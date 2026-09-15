# AWS (Lambda + API Gateway + Cognito + RDS, behind CloudFront)

Read [`infra/README.md`](../README.md) first: images, secrets and state are the same for both
clouds. This folder is the **v3 shape** of [ADR 0009](../../docs/architecture/adr/0009-lambda-cognito-budget.md)
(drawn in [`docs/architecture/aws-architecture.drawio.svg`](../../docs/architecture/aws-architecture.drawio.svg)):
the same two container images run as **Lambda functions** behind an **API Gateway REST API**, the
browser signs in through a **Cognito user pool**, and **CloudFront** is the single public origin
for the static frontend (S3) and the API (`/api/*`). No load balancer, no NAT, no VPC endpoints,
no Secrets Manager: about 4 €/month with the RDS free tier, ~19 € without.

| Function | Image | Where | Receives |
|---|---|---|---|
| `core-api` | `core-api` | private subnets, security group to RDS only | `DB_*`, `AUTH_MODE=cognito` + `COGNITO_*`, `BACKEND_CORS_ORIGINS` |
| `ai-api` | `ai-api` | outside the VPC (Bedrock, NVIDIA, `core_api` through CloudFront) | `NVIDIA_*`, `AUTH_MODE=cognito` + `COGNITO_*`, `CORE_API_URL=https://<domain>` |

Request path: `https://<domain>/api/v1/...` → CloudFront (`/api/*`, no cache, `Authorization`
forwarded) → API Gateway (Cognito authorizer, then `/api/v1/ai/{proxy+}` streamed to `ai-api`,
`/api/v1/{proxy+}` buffered to `core-api`) → Lambda Web Adapter → uvicorn. Every API method needs
a Cognito ID token, health endpoints included.

## What Terraform creates

| File | Resources |
|---|---|
| `network.tf`, `security.tf` | VPC with two private subnets (no IGW), DB subnet group, security groups `core-api` → `rds:5432` |
| `rds.tf` | RDS PostgreSQL 16 `db.t4g.micro`, private, encrypted, deletion protection |
| `ecr.tf` | Two ECR repositories: `${name_prefix}-core-api`, `${name_prefix}-ai-api` |
| `cognito.tf` | User pool, Google identity provider, public app client (code + PKCE), `admin` group, hosted-UI domain, the JWKS as output and environment |
| `lambda.tf` | Two container-image functions with their roles (VPC access for `core-api`, Bedrock invoke for `ai-api`) and log groups; permissions for the gateway |
| `apigateway.tf` | REST API (regional), Cognito authorizer, the two proxy resources, deployment and `prod` stage |
| `frontend.tf` | Private S3 bucket (OAC), CloudFront with the S3 default behaviour, the `/api/*` behaviour to the gateway and a directory-index function, Route 53 aliases; the ACM certificate (us-east-1) and the hosted zone are read, not created |

The images bake the Lambda Web Adapter and their `AWS_LWA_*` settings
([Docker runbook](../../docs/runbooks/docker.md#the-same-image-on-aws-lambda)); the functions
receive **image digests**, since a mutable tag would not redeploy them. Environment variables are
encrypted at rest with the Lambda service key; secrets live in the Terraform state (ADR 0007).

## Access (once per account)

Nobody uses access keys ([ADR 0007](../../docs/architecture/adr/0007-aws-cloud-and-auth.md)).
Identity Center lives in the **management account of the organization**, so what you can do
depends on who administers it:

**You administer Identity Center** (your own organization). In the console, once:

1. **IAM Identity Center** → Enable (it creates an organization if there is none; free).
2. **Users** → add yourself (email invitation) and any other maintainer.
3. **Permission sets** → create `TravelAIWorldDeveloper`. `PowerUserAccess` plus the inline
   IAM statements of [`bootstrap/main.tf`](bootstrap/main.tf) is the right size for whoever runs
   Terraform by hand; read-only users get `ViewOnlyAccess`.
4. **AWS accounts** → assign the user(s) to this account with that permission set.

**Someone else administers it** (the account is a member of an organization you do not own,
as with the current course account). Permission sets and assignments can only be created from
the management account, not from this one, even with `AdministratorAccess`: ask the
organization's administrator for an assignment and use whatever permission set they grant.
`aws sso login` followed by `aws sso list-account-roles` shows the names you actually have.
The current account grants `AdministratorAccess`; it cannot be narrowed from our side.

Then copy the **start URL** (Settings), the account id and the permission set name into
`~/.aws/config` in the devcontainer (`sso_role_name`; see
[`.devcontainer/README.md`](../../.devcontainer/README.md#aws)) and run `just aws-login`.
A successful browser login followed by `GetRoleCredentials ... No access` means the
`sso_role_name` in the profile is not assigned to you on that account.

## First deployment

Prerequisites: the devcontainer (AWS CLI v2, Terraform ≥ 1.11, `crane`), an SSO session
(`just aws-login`), the domain's public hosted zone in this account and its ACM certificate
(domain + wildcard) issued in `us-east-1` ([frontend runbook](../../docs/runbooks/frontend-https-aws.md)).

Bootstrap first, once: state bucket, GitHub OIDC provider and CI role, following
[`bootstrap/README.md`](bootstrap/README.md). It ends with the `terraform init` of this folder
against the S3 backend.

```bash
cp terraform.tfvars.example terraform.tfvars      # fill in every value; the file is ignored by git
terraform init -backend-config="bucket=$(terraform -chdir=bootstrap output -raw state_bucket)" -backend-config="region=eu-west-1"
terraform validate
```

1. Registry first, and the images the functions will run:

   ```bash
   terraform apply -target=aws_ecr_repository.services
   ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
   REG="$ACCOUNT.dkr.ecr.eu-west-1.amazonaws.com"
   aws ecr get-login-password --region eu-west-1 | crane auth login --username AWS --password-stdin "$REG"
   for svc in core-api ai-api; do
     crane copy ghcr.io/manupm87/travel-ai-world/$svc:latest $REG/travel-ai-$svc:latest
     echo "$svc: $(crane digest $REG/travel-ai-$svc:latest)"     # → core_api_image / ai_api_image in terraform.tfvars
   done
   ```

   `crane` copies registry-to-registry, so no Docker daemon is needed in the devcontainer.
   Lambda only accepts a single-platform image manifest: images built before the workflow set
   `provenance: false` are OCI indexes, and their `linux/amd64` child digest
   (`crane digest --platform linux/amd64 <ref>`) is the one to pin.

2. Everything else, then the schema:

   ```bash
   terraform plan && terraform apply
   aws lambda invoke --function-name "$(terraform output -raw core_api_function_name)" \
     --cli-binary-format raw-in-base64-out --payload '{"command": "migrate"}' /dev/stdout
   ```

   Check the RDS free tier (account creation date) before this apply: `db.t4g.micro` is the
   swing item of the budget.

3. [Sign-in (Cognito)](#sign-in-cognito): register the pool's domain on the Google OAuth client.

4. Frontend: set the repository variables `FRONTEND_DOMAIN`, `CLOUDFRONT_DISTRIBUTION_ID`
   (`terraform output cloudfront_distribution_id`), `COGNITO_DOMAIN` and `COGNITO_CLIENT_ID`
   and run the "Deploy frontend" workflow (or push to `main`). It builds with
   `NEXT_PUBLIC_API_URL=https://<domain>`, syncs `out/` to the bucket and invalidates CloudFront.

Later backend deploys: the "Deploy backend" workflow with `cloud=aws`. It assumes the bootstrap's
role through OIDC, initialises the same S3 backend, pins the functions to the new image digests,
applies, and invokes `migrate`. It needs the secrets `AWS_REGION`, `AWS_ROLE_TO_ASSUME`, the
variables `AWS_TF_STATE_BUCKET`, `FRONTEND_DOMAIN` and the `TF_VAR_*` listed in the workflow header.

## Sign-in (Cognito)

The Google OAuth client stays in Google Cloud; Cognito uses it on the backend's behalf. After the
first `terraform apply`:

1. **Google Cloud console → APIs & Services → Credentials → the OAuth client** (the same
   `google_client_id` / `google_client_secret` Terraform receives). Add, using
   `terraform output -raw cognito_domain`:
   - Authorised JavaScript origins: `https://<cognito_domain>`
   - Authorised redirect URIs: `https://<cognito_domain>/oauth2/idpresponse`

   Until this is done Google answers `redirect_uri_mismatch` when Cognito hands off to it.
2. **Frontend build**: `NEXT_PUBLIC_COGNITO_DOMAIN=$(terraform output -raw cognito_domain)` and
   `NEXT_PUBLIC_COGNITO_CLIENT_ID=$(terraform output -raw cognito_client_id)` (GitHub repository
   variables `COGNITO_DOMAIN` / `COGNITO_CLIENT_ID` for `deploy.yml`). The app client accepts
   `https://<domain_name>/auth/callback/` and every `cognito_dev_origins` entry (default
   `http://localhost:3000`), so a local frontend can sign in against the deployed pool.
3. **Backend**: both functions receive `AUTH_MODE=cognito`, `COGNITO_ISSUER`,
   `COGNITO_CLIENT_ID` and `COGNITO_JWKS` from the same outputs; run them locally with
   `terraform output -raw cognito_jwks` in `.env` to test against the real pool.
4. **Administrators**: add the user to the `admin` group in the pool (console or
   `aws cognito-idp admin-add-user-to-group`); the role travels in the ID token as `cognito:groups`.

The domain is the pool's default host (`<name_prefix>-<account id>.auth.<region>.amazoncognito.com`)
until `cognito_custom_domain` (e.g. `auth.<domain>`, covered by the wildcard certificate) is set.
Key rotation: the pool's signing keys are stable, but if `cognito_jwks` ever changes, a
`terraform apply` refreshes the functions' environment.

## Debugging

```bash
aws logs tail /aws/lambda/<name_prefix>-core-api --follow
aws logs tail /aws/lambda/<name_prefix>-ai-api --follow
# The gateway directly, with an ID token from the browser's localStorage (travel_ai_token):
curl -H "Authorization: Bearer $TOKEN" "$(terraform output -raw api_gateway_invoke_url)/api/v1/users/me"
```

- `{"message":"Unauthorized"}` from the gateway → the authorizer rejected the token (expired, an
  access token instead of the ID token, or the wrong pool).
- A function never becomes ready → the Web Adapter's readiness path answered non-2xx; the
  function log shows the app's startup error. `INIT_REPORT ... Status: timeout` means the app
  took more than the 10 s Lambda gives the init phase; the invocation still succeeds (Lambda
  retries the init inside the invoke), but raise `core_api_memory_mb` for more CPU.
- `Distributions with the Free pricing plan can't have the following features: Price class` →
  keep `cloudfront_price_class = "PriceClass_All"` (the default).
- The chat arrives all at once → the `/api/*` behaviour must keep `compress = false` and the
  `ai` integration `response_transfer_mode = "STREAM"`.
- A page under a subfolder shows an S3 `AccessDenied` XML → the CloudFront function that maps
  `/x/` to `/x/index.html` is not attached, or the export was not synced.
