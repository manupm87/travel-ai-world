# AWS (ECS Fargate + RDS + ALB)

Read [`infra/README.md`](../README.md) first: images, secrets, state and CORS/OAuth are the same
for both clouds. This folder deploys the two services as **ECS Fargate** services behind one
**Application Load Balancer**, which acts as the API gateway: a single public origin, routed by
path. The frontend needs only `NEXT_PUBLIC_API_URL`.

> **This is the v1 shape, not the target.** The target (v3: CloudFront single origin, API Gateway
> REST with response streaming, the same images on **Lambda**, Cognito sign-in, RDS with
> `pgvector`, Bedrock, no NAT and no load balancer, for a 30 €/month budget) is drawn in
> [`docs/architecture/aws-architecture.drawio.svg`](../../docs/architecture/aws-architecture.drawio.svg)
> and decided in [ADR 0009](../../docs/architecture/adr/0009-lambda-cognito-budget.md).
> The frontend part of the target (S3 + CloudFront + Route 53 + ACM) is already here in
> [`frontend.tf`](frontend.tf); the backend part below is still v1 and moves to v3 issue by
> issue. Until then the ALB has no HTTPS listener, so the deployed frontend cannot call it.

| Service | Image | Receives | ALB rule |
|---|---|---|---|
| `core-api` | `core-api` | `DB_*`, `AUTH_MODE=cognito` + `COGNITO_*`, and still `GOOGLE_*`, `SECRET_KEY` (unused in Cognito mode) | default action |
| `ai-api` | `ai-api` | `NVIDIA_API_KEY`, `AUTH_MODE=cognito` + `COGNITO_*`, `CORE_API_URL` (the ALB URL) | `/api/v1/ai/*` |

## What Terraform creates

- VPC, public subnets and security groups (ALB → ECS:8000 → RDS:5432).
- RDS PostgreSQL 16 (private).
- Two ECR repositories: `${name_prefix}-core-api`, `${name_prefix}-ai-api`.
- Secrets Manager secrets: `secret-key`, `google-client-id`, `google-client-secret`,
  `db-password`, `nvidia-api-key`; each task execution role can read only its own.
- One ECS cluster and two Fargate services (module `modules/ecs_service`).
- ALB with two target groups, health checks on `/api/v1/health/` and `/api/v1/ai/health/`, and a
  300 s idle timeout for streaming responses.
- Sign-in (`cognito.tf`, the first piece of v3, applicable on its own): a Cognito user pool, Google
  as its only identity provider, a public app client (authorization code + PKCE, refresh tokens for
  30 days), the `admin` group, a hosted-UI domain, and the pool's JWKS read at plan time so both
  services get `COGNITO_JWKS` as an environment variable. See [Sign-in (Cognito)](#sign-in-cognito).

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
3. **Backend**: the ECS task definitions already receive `AUTH_MODE=cognito`, `COGNITO_ISSUER`,
   `COGNITO_CLIENT_ID` and `COGNITO_JWKS` from the same outputs; run them locally with
   `terraform output -raw cognito_jwks` in `.env` to test against the real pool.
4. **Administrators**: add the user to the `admin` group in the pool (console or
   `aws cognito-idp admin-add-user-to-group`); the role travels in the ID token as `cognito:groups`.

The domain is the pool's default host (`<name_prefix>-<account id>.auth.<region>.amazoncognito.com`)
until `cognito_custom_domain` (e.g. `auth.kyrian-world.com`) is set, which needs the `us-east-1`
certificate to cover that name. Key rotation: the pool's signing keys are stable, but if `cognito_jwks`
ever changes, a `terraform apply` refreshes the services' environment.

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

Prerequisites: the devcontainer (AWS CLI v2, Terraform ≥ 1.11, `crane`) and an SSO session
(`just aws-login`).

Bootstrap first, once: state bucket, GitHub OIDC provider and CI role, following
[`bootstrap/README.md`](bootstrap/README.md). It ends with the `terraform init` of this folder
against the S3 backend.

```bash
cp terraform.tfvars.example terraform.tfvars      # fill in every value; the file is ignored by git
terraform init -backend-config="bucket=$(terraform -chdir=bootstrap output -raw state_bucket)" -backend-config="region=eu-west-1"
terraform validate
```

1. Registry first:

   ```bash
   terraform apply -target=aws_ecr_repository.services
   ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
   REG="$ACCOUNT.dkr.ecr.eu-west-1.amazonaws.com"
   aws ecr get-login-password --region eu-west-1 | crane auth login --username AWS --password-stdin "$REG"
   for svc in core-api ai-api; do
     crane copy ghcr.io/manupm87/travel-ai-world/$svc:latest $REG/travel-ai-$svc:latest
   done
   ```

   `crane` copies registry-to-registry, so no Docker daemon is needed in the devcontainer. On a
   host with Docker, `docker buildx imagetools create -t <dst> <src>` does the same, or build
   locally from `src/backend/` (`just docker-build`) and push both tags to `$REG`.

2. Everything else:

   ```bash
   terraform plan && terraform apply
   terraform output -raw backend_url
   ```

3. Frontend:

   ```bash
   cd ../../src/frontend
   export NEXT_PUBLIC_API_URL="$(terraform -chdir=../../infra/aws output -raw backend_url)"
   npm run build
   ```

Later deploys: the "Deploy backend" workflow with `cloud=aws`. It assumes the bootstrap's role
through OIDC and initialises the same S3 backend; it needs the secrets `AWS_REGION`,
`AWS_ROLE_TO_ASSUME`, the variable `AWS_TF_STATE_BUCKET` and the `TF_VAR_*` listed in the
workflow header.

## Debugging a running task

The devcontainer includes the Session Manager plugin, so you can open a shell in a Fargate task
(the task role needs `ssmmessages:*` and the service `enable_execute_command`):

```bash
aws ecs execute-command --cluster <cluster> --task <task-id> --container core-api --interactive --command /bin/sh
aws logs tail /ecs/<name_prefix>-core-api --follow
```

For production add an ACM certificate and an HTTPS listener to the ALB before publishing the domain.
