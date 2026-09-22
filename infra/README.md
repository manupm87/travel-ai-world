# Infrastructure

Terraform for the two backend services, one folder per cloud. The clouds are **alternatives**:
pick one, apply only its folder. Nothing is created until you run `terraform apply`.
**AWS is the cloud we deploy to** ([ADR 0007](../docs/architecture/adr/0007-aws-cloud-and-auth.md));
`gcp/` stays as a maintained-by-CI, not deployed, alternative.

| Folder | Shape | Public origin(s) | Frontend variables |
|---|---|---|---|
| [`gcp/`](gcp/README.md) | Cloud Run ×2 + Cloud SQL + Artifact Registry + Secret Manager | two Cloud Run URLs | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_AI_API_URL` |
| [`aws/`](aws/README.md) | Lambda ×2 + API Gateway REST + Cognito + DynamoDB + ECR, behind CloudFront (S3 frontend, WAF); RDS only until TRA-219 | one CloudFront domain (`/api/*` → gateway) | `NEXT_PUBLIC_API_URL=https://<domain>` (same origin) |

Both deploy `core_api` and `ai_api` as separate services, each with its own identity and access
**only to its secrets**. On AWS the two services run in `AUTH_MODE=cognito`: a Cognito user pool
signs people in with Google and both services verify its RS256 tokens offline
([ADR 0009](../docs/architecture/adr/0009-lambda-cognito-budget.md)); on GCP they still share
`SECRET_KEY` and `core_api` issues the tokens ([ADR 0002](../docs/architecture/adr/0002-auth-between-services.md)).
Why two services and why the frontend accepts two URLs: [ADR 0001](../docs/architecture/adr/0001-backend-split.md),
[ADR 0003](../docs/architecture/adr/0003-frontend-two-base-urls.md).

## What is shared by both clouds

- **Images** are built by CI (`.github/workflows/backend-images.yml`) and published to GHCR as
  `ghcr.io/manupm87/travel-ai-world/{core-api,ai-api}` (tags: commit SHA and `latest`). Terraform
  only references image URLs; copy them into the cloud registry with
  `crane copy ghcr.io/manupm87/travel-ai-world/<image>:<tag> <registry>/<image>:<tag>` (no Docker
  daemon needed; installed in the devcontainer; keeps the digest), or build
  locally from `src/backend/` (`just docker-build`).
  Not `docker buildx imagetools create` for AWS: it wraps the image in an OCI index, which Lambda
  rejects ("image manifest ... media type is not supported").
- **Secrets** are Terraform variables (`db_password`, `google_client_secret`, `nvidia_api_key`;
  GCP also `secret_key`; `google_client_id` travels with them but is public). GCP stores them in Secret Manager and injects them per
  service; AWS sets them as encrypted Lambda environment variables (a VPC without endpoints
  cannot reach Secrets Manager; ADR 0009) and hands the Google client to Cognito. Locally they go
  in `terraform.tfvars` (ignored by git; start from `terraform.tfvars.example`). In CI they arrive
  as `TF_VAR_*` secrets of the cloud's GitHub environment (`aws`, `gcp`), which must match the
  local tfvars ([deploy runbook](../docs/runbooks/deploy.md)).
- **CORS and OAuth**: `backend_cors_origins` must list the deployed frontend origin. The Google OAuth
  client (it stays in Google Cloud) must list the Cognito domain's `/oauth2/idpresponse` as a
  redirect URI on AWS (see [`aws/README.md`](aws/README.md#sign-in-cognito)), and the frontend
  origin itself where the Google button is used (GCP, local).
- **No migrations**: `core_api` keeps its data in DynamoDB
  ([ADR 0023](../docs/architecture/adr/0023-dynamodb-data-store.md)), whose table Terraform owns
  on AWS, so neither the container start (`src/backend/docker/entrypoint.sh`) nor the deploy
  workflow runs a schema step. The only `ops` command is the one-off `copy-from-postgres` (see the
  [Docker runbook](../docs/runbooks/docker.md#the-same-image-on-aws-lambda)).
- **State**: commit `.terraform.lock.hcl`, never `*.tfstate` or `*.tfvars`. Sensitive variables end
  up in the state, so it lives in a remote backend with restricted access; the CI workflow
  requires one. AWS: the private S3 bucket created by [`aws/bootstrap/`](aws/bootstrap/README.md)
  (partial backend config passed at `init`). GCP: add a GCS bucket to `gcp/versions.tf` if you
  ever apply it.
- **The frontend** is a static export. On AWS it lives in the private S3 bucket behind the same
  CloudFront distribution as the API (`aws/frontend.tf`), synced by `.github/workflows/deploy.yml`
  on every push to `main`; on GCP it would be any static host.

## Workflow

1. **First apply, by hand** (registry first, because the services need an existing image):
   follow the chosen cloud's README.
2. **Later deploys from CI**: Actions → "Deploy backend" → choose cloud, image tag and whether to
   apply (`apply=false` only plans). Details and required secrets are in the header of
   `.github/workflows/deploy-backend.yml` and in the [deploy runbook](../docs/runbooks/deploy.md).
3. **After the backend URL changes** (GCP, or a local frontend against AWS): rebuild the frontend
   with the new `NEXT_PUBLIC_*` values and update `backend_cors_origins`; on GCP also the Google
   OAuth client's origins. On AWS the frontend and the API share one domain, so nothing changes.

```bash
just infra-fmt && just infra-validate gcp && just infra-validate aws && just infra-validate aws/bootstrap    # CI runs the check variants on changes in infra/
```
