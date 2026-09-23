# AWS (Lambda + API Gateway + Cognito + DynamoDB, behind CloudFront)

Read [`infra/README.md`](../README.md) first: images, secrets and state are the same for both
clouds. This folder is the **v3 shape** of [ADR 0009](../../docs/architecture/adr/0009-lambda-cognito-budget.md)
(drawn in [`docs/architecture/aws-architecture.drawio.svg`](../../docs/architecture/aws-architecture.drawio.svg)):
the same two container images run as **Lambda functions** behind an **API Gateway REST API**, the
browser signs in through a **Cognito user pool**, and **CloudFront** is the single public origin
for the static frontend (S3) and the API (`/api/*`). `core_api` keeps its data in the DynamoDB
table `${name_prefix}-core` ([ADR 0023](../../docs/architecture/adr/0023-dynamodb-data-store.md)).
No VPC, no load balancer, no NAT, no Secrets Manager: both functions run outside any VPC and
reach AWS services over their public endpoints with IAM. The bill is about 5 €/month.

CloudFront also has a **WAF web ACL** with the AWS managed rule groups
`AmazonIpReputationList`, `CommonRuleSet` and `KnownBadInputsRuleSet`. It was created from the
CloudFront console and is **not managed by Terraform**: a `terraform apply` neither creates nor
removes it.

| Function | Image | Where | Receives |
|---|---|---|---|
| `core-api` | `core-api` | outside the VPC (DynamoDB through IAM, HTTPS) | `CORE_TABLE`, `AUTH_MODE=cognito` + `COGNITO_*`, `BACKEND_CORS_ORIGINS` |
| `ai-api` | `ai-api` | outside the VPC (Bedrock, NVIDIA, `core_api` through CloudFront) | `LLM_PROVIDER` (`bedrock` by default) + `BEDROCK_*`, `NVIDIA_*` (fallback), `AUTH_MODE=cognito` + `COGNITO_*`, `CORE_API_URL=https://<domain>`, `RETRIEVAL_ENABLED` + `VECTOR_*` + `EMBEDDINGS_*` |

Request path: `https://<domain>/api/v1/...` → CloudFront (`/api/*`, no cache, `Authorization`
forwarded) → API Gateway (Cognito authorizer, then `/api/v1/ai/{proxy+}` streamed to `ai-api`,
`/api/v1/{proxy+}` buffered to `core-api`) → Lambda Web Adapter → uvicorn. Every API method needs
a Cognito ID token, health endpoints included.

## What Terraform creates

| File | Resources |
|---|---|
| `dynamodb.tf` | The `core_api` table `${name_prefix}-core` (on-demand, `PK`/`SK` + `GSI1` (accounts) + `GSI2` (every trip, summary projection), point-in-time recovery, deletion protection), and `core-api`'s item-level permissions on it ([ADR 0023](../../docs/architecture/adr/0023-dynamodb-data-store.md)); see [History](#history-rds--dynamodb-2026-09-22) |
| `ecr.tf` | Two ECR repositories: `${name_prefix}-core-api`, `${name_prefix}-ai-api` |
| `cognito.tf` | User pool, Google identity provider, public app client (code + PKCE), `admin` group and its members (`admin_usernames`), hosted-UI domain, the JWKS as output and environment |
| `lambda.tf` | Two container-image functions with their roles (basic execution for both; for `ai-api`, Bedrock invoke on the EU inference profiles of the chat and title models, see [Chat model](#chat-model-bedrock)) and log groups; permissions for the gateway |
| `vectors.tf` | S3 Vectors bucket and the `city-kb` index (1024 dimensions, cosine), plus the read-only `s3vectors` and Titan embeddings permissions of the `ai-api` role, see [Vector store](#vector-store-s3-vectors) |
| `apigateway.tf` | REST API (regional), Cognito authorizer, the two proxy resources, deployment and `prod` stage |
| `frontend.tf` | Private S3 bucket (OAC), CloudFront with the S3 default behaviour, the `/api/*` behaviour to the gateway and a directory-index function, S3's 403 for a missing page served as the export's `404.html` with status 404, Route 53 aliases; the public hosted zone and the ACM certificate (us-east-1, apex + wildcard, DNS-validated), both `prevent_destroy` (ADR 0010) |

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
(`just aws-login`) and a registered domain (`domain_name`). Terraform creates its hosted zone and
certificate; the certificate is only issued once the registrar delegates the domain to the
`name_servers` output, so on a brand-new domain apply the zone first
(`terraform apply -target=aws_route53_zone.main`), delegate, then continue. The account we use
had both created by hand ([frontend runbook](../../docs/runbooks/frontend-https-aws.md)) and
imported into the state (ADR 0010).

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

2. Everything else:

   ```bash
   terraform plan && terraform apply
   ```

   There is no schema step: the DynamoDB table is created by Terraform and `core_api` has no
   migrations (ADR 0023).

3. [Sign-in (Cognito)](#sign-in-cognito): register the pool's domain on the Google OAuth client.

4. Frontend: set the repository variables `FRONTEND_DOMAIN`, `CLOUDFRONT_DISTRIBUTION_ID`
   (`terraform output cloudfront_distribution_id`), `COGNITO_DOMAIN` and `COGNITO_CLIENT_ID`
   and run the "Deploy frontend" workflow (or push to `main`). It builds with
   `NEXT_PUBLIC_API_URL=https://<domain>`, syncs `out/` to the bucket and invalidates CloudFront.

Later backend deploys: the "Deploy backend" workflow with `cloud=aws`. It assumes the bootstrap's
role through OIDC, initialises the same S3 backend, pins the functions to the new image digests,
and applies; there is no migrate step. It needs the secrets `AWS_REGION`, `AWS_ROLE_TO_ASSUME`, the
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
4. **Administrators**: `admin_usernames` in `terraform.tfvars` (below); the role travels in the
   ID token as `cognito:groups`.

The managed-login host is `auth.<domain>` by default (`cognito_subdomain`, covered by the wildcard
certificate); set it to `""` to fall back to the pool's own host
(`<name_prefix>-<account id>.auth.<region>.amazoncognito.com`).
Key rotation: the pool's signing keys are stable, but if `cognito_jwks` ever changes, a
`terraform apply` refreshes the functions' environment.

## Making someone an administrator

The administrators are a reviewed list in Terraform (ADR 0024): `terraform apply` puts each
username of `admin_usernames` in the pool's `admin` group (`aws_cognito_user_in_group.admin`), the
ID token carries the group, and `core_api` mirrors it as `role=admin`. No service reads a list.

1. The person signs in once with Google, so the pool has their user.
2. `just aws-login`, then `just cognito-username <email>` prints the username (`google_<sub>`).
3. Add it to `admin_usernames = ["google_..."]` in `terraform.tfvars` (and the PR that changes it).
4. `terraform apply` (it only adds or removes the group memberships).
5. The person signs out and in again: the ID token they hold was issued before the change.

Removing a name from the list and applying takes the group away; the role follows at the next
sign-in. A user added to the group by hand in the console is not in the list and Terraform leaves
them alone, so do not: the list is the source of truth.

## Chat model (Bedrock)

`ai-api` answers with Amazon Bedrock (`llm_provider = "bedrock"`, the default): Claude Haiku 4.5
for the chat (`bedrock_chat_model`) and Amazon Nova Lite for short completions such as titles
(`bedrock_title_model`). Both are EU geographic cross-Region inference profiles (`eu.` prefix),
so prompts are processed in EU Regions. There is no API key: the function's role signs the calls.

- **Model access, once per account.** Most Bedrock models are enabled automatically. Anthropic
  models need a one-time use-case form (Bedrock console in eu-west-1 → Model catalog → a Claude
  model). It was submitted for this account on 2026-09-16. Right after it, the account can stay
  "being verified" for a few hours, and Anthropic calls answer `AccessDeniedException` with that
  text until it finishes.
- **IAM.** `lambda.tf` grants `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream`
  on the two inference profiles, and on their foundation models in any Region only for calls made
  through those profiles (`bedrock:InferenceProfileArn` condition). Any other model is denied.
- **Changing a model.** Set the variable to another `eu.` profile id
  (`aws bedrock list-inference-profiles --region eu-west-1`) and apply; the policy follows it.
- **Rollback to NVIDIA.** `llm_provider = "nvidia"` and apply. `NVIDIA_API_KEY` stays in the
  function for that reason.
- **Checking it.** Each answer writes one `Bedrock usage model=... input_tokens=... output_tokens=...`
  line to the function log, which also reconciles the spend with Cost Explorer.

## Vector store (S3 Vectors)

The chat grounds its answers in a corpus of city documents kept in **Amazon S3 Vectors**
([ADR 0014](../../docs/architecture/adr/0014-vector-store-s3-vectors.md)): `vectors.tf` creates the
vector bucket `${name_prefix}-vectors` and one index, `city-kb`, of 1024 dimensions and cosine
distance. Same account, same Region, no endpoint and no key — the function searches it with its
own role, so a question never leaves the account.

- **Frozen at creation.** The dimension, the distance metric and the list of non-filterable
  metadata keys cannot be changed in place: Terraform replaces the index, and the corpus has to be
  loaded again (minutes, about 0.01 USD of embeddings).
- **IAM.** `vectors.tf` grants the `ai-api` role `s3vectors:QueryVectors`, `GetVectors` and
  `GetIndex` on that index alone, and `bedrock:InvokeModel` on `embeddings_model`
  (`amazon.titan-embed-text-v2:0`, an in-Region foundation model, not an inference profile).
  The function never writes: the index is filled from a laptop with `just index`
  ([`ai_api` README](../../src/backend/services/ai_api/README.md#filling-the-index)).
- **On by default** (`retrieval_enabled = true`, since TRA-152). The index has to hold a corpus
  before a deploy switches it on; `retrieval_enabled = false` and apply is the rollback, and the
  chat then answers from the model alone, as before.

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
  `/x/` to `/x/index.html` is not attached, or the export was not synced. An unknown path
  shows the XML instead of the not-found page → the `custom_error_response` (403 →
  `/404.html`, 404) is missing, or `404.html` is not at the root of the bucket.
- An API call answers 404 with HTML → the API returned 403 (someone else's resource, an
  authorizer deny); the distribution-wide error response maps it. API 404s stay JSON.

## History: RDS → DynamoDB (2026-09-22)

[ADR 0023](../../docs/architecture/adr/0023-dynamodb-data-store.md) moved `core_api` from RDS
PostgreSQL to DynamoDB on 2026-09-22 (TRA-217, TRA-218): the table was applied first, the
DynamoDB image deployed, and the one-off `copy-from-postgres` command copied every user, trip,
thread and message. TRA-219 then removed RDS, the VPC and the copy command. No snapshot of the
old database is kept: every row lives in DynamoDB, which has point-in-time recovery.

## Retiring RDS (TRA-219, done 2026-09-23)

RDS, the VPC, its subnets, security groups and the DynamoDB gateway endpoint were destroyed on
2026-09-23; none of them is in the Terraform code any more. Kept here because a single apply
could not do it, which is worth knowing the next time a Lambda leaves a VPC.

1. **Deletion protection off** (`aws rds modify-db-instance --db-instance-identifier
   travel-ai-postgres --no-deletion-protection --apply-immediately`): Terraform cannot destroy
   the instance while it is on.
2. **The plain apply fails with `Error: Cycle`** between `aws_lambda_function.core_api` (update:
   drop `vpc_config`) and the destroys of its security group, the subnets and the VPC. So the
   apply ran in two steps, locally, with both images pinned to the digests already in ECR
   (`-var core_api_image=... -var ai_api_image=...`; a stale `terraform.tfvars` would deploy an
   image that no longer exists):
   - `terraform apply -target=aws_lambda_function.core_api`: 1 added
     (`AWSLambdaBasicExecutionRole`), 1 changed (new image, no `DB_*` variables, no VPC);
     `core-api` answered `/api/v1/health/db` from outside the VPC before going on.
   - `terraform apply`: 10 destroyed, `ai-api` moved to the same commit's image. RDS took 7 min;
     the ENIs did not hold the security groups or the subnets back.
3. **Final snapshot deleted** (`aws rds delete-db-snapshot --db-snapshot-identifier
   travel-ai-final`); the automated snapshots went with the instance.
