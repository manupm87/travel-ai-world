# Infrastructure

Terraform for the two backend services, one folder per cloud. The clouds are **alternatives**:
pick one, apply only its folder. Nothing is created until you run `terraform apply`.
**AWS is the cloud we deploy to** ([ADR 0007](../docs/architecture/adr/0007-aws-cloud-and-auth.md));
`gcp/` stays as a maintained-by-CI, not deployed, alternative.

| Folder | Shape | Public origin(s) | Frontend variables |
|---|---|---|---|
| [`gcp/`](gcp/README.md) | Cloud Run ×2 + Cloud SQL + Artifact Registry + Secret Manager | two Cloud Run URLs | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_AI_API_URL` |
| [`aws/`](aws/README.md) | ECS Fargate ×2 + RDS + ECR + ALB + Secrets Manager | one ALB (routes `/api/v1/ai/*`) | `NEXT_PUBLIC_API_URL` |

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
  daemon needed; installed in the devcontainer) or `docker buildx imagetools create`, or build
  locally from `src/backend/` (`just docker-build`).
- **Secrets** are Terraform variables (`db_password`, `secret_key`, `google_client_id`,
  `google_client_secret`, `nvidia_api_key`) stored in the cloud's secret manager and injected per
  service. Locally they go in `terraform.tfvars` (ignored by git; start from `terraform.tfvars.example`).
  In CI they arrive as `TF_VAR_*` repository secrets.
- **CORS and OAuth**: `backend_cors_origins` must list the deployed frontend origin. The Google OAuth
  client (it stays in Google Cloud) must list the Cognito domain's `/oauth2/idpresponse` as a
  redirect URI on AWS (see [`aws/README.md`](aws/README.md#sign-in-cognito)), and the frontend
  origin itself where the Google button is used (GCP, local).
- **Migrations**: `core_api` only. At container start on Compose/ECS (`src/backend/docker/entrypoint.sh`);
  on Lambda the deploy workflow invokes the function with `{"command": "migrate"}` (see the
  [Docker runbook](../docs/runbooks/docker.md#the-same-image-on-aws-lambda)).
- **State**: commit `.terraform.lock.hcl`, never `*.tfstate` or `*.tfvars`. Sensitive variables end
  up in the state, so it lives in a remote backend with restricted access; the CI workflow
  requires one. AWS: the private S3 bucket created by [`aws/bootstrap/`](aws/bootstrap/README.md)
  (partial backend config passed at `init`). GCP: add a GCS bucket to `gcp/versions.tf` if you
  ever apply it.
- **The frontend is not deployed here**: it is a static export on GitHub Pages
  (`.github/workflows/deploy.yml`) or any static host.

## Workflow

1. **First apply, by hand** (registry first, because the services need an existing image):
   follow the chosen cloud's README.
2. **Later deploys from CI**: Actions → "Deploy backend" → choose cloud, image tag and whether to
   apply (`apply=false` only plans). Details and required secrets are in the header of
   `.github/workflows/deploy-backend.yml` and in the [deploy runbook](../docs/runbooks/deploy.md).
3. **After the backend URL changes**: rebuild the frontend with the new `NEXT_PUBLIC_*` values and
   update `backend_cors_origins` and the Google OAuth client.

```bash
just infra-fmt && just infra-validate gcp && just infra-validate aws && just infra-validate aws/bootstrap    # CI runs the check variants on changes in infra/
```
