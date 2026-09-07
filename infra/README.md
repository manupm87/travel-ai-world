# Infrastructure

Terraform for the two backend services, one folder per cloud. The clouds are **alternatives**:
pick one, apply only its folder. Nothing is created until you run `terraform apply`.

| Folder | Shape | Public origin(s) | Frontend variables |
|---|---|---|---|
| [`gcp/`](gcp/README.md) | Cloud Run ×2 + Cloud SQL + Artifact Registry + Secret Manager | two Cloud Run URLs | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_AI_API_URL` |
| [`aws/`](aws/README.md) | ECS Fargate ×2 + RDS + ECR + ALB + Secrets Manager | one ALB (routes `/api/v1/ai/*`) | `NEXT_PUBLIC_API_URL` |

Both deploy `core_api` and `ai_api` as separate services, each with its own identity and access
**only to its secrets**. `SECRET_KEY` is the same secret in both: `ai_api` verifies the JWTs
`core_api` issues ([ADR 0002](../docs/architecture/adr/0002-auth-between-services.md)). Why two
services and why the frontend accepts two URLs: [ADR 0001](../docs/architecture/adr/0001-backend-split.md),
[ADR 0003](../docs/architecture/adr/0003-frontend-two-base-urls.md).

## What is shared by both clouds

- **Images** are built by CI (`.github/workflows/backend-images.yml`) and published to GHCR as
  `ghcr.io/manupm87/travel-ai-world/{core-api,ai-api}` (tags: commit SHA and `latest`). Terraform
  only references image URLs; copy them into the cloud registry with
  `docker buildx imagetools create -t <registry>/<image>:<tag> ghcr.io/manupm87/travel-ai-world/<image>:<tag>`
  or build locally from `src/backend/` (`just docker-build`).
- **Secrets** are Terraform variables (`db_password`, `secret_key`, `google_client_id`,
  `google_client_secret`, `nvidia_api_key`) stored in the cloud's secret manager and injected per
  service. Locally they go in `terraform.tfvars` (ignored by git; start from `terraform.tfvars.example`).
  In CI they arrive as `TF_VAR_*` repository secrets.
- **CORS and OAuth**: `backend_cors_origins` must list the deployed frontend origin, and that origin
  must be registered in the Google OAuth client.
- **Migrations** run at container start in `core_api` only (`src/backend/docker/entrypoint.sh`).
- **State**: commit `.terraform.lock.hcl`, never `*.tfstate` or `*.tfvars`. Sensitive variables end
  up in the state, so use a remote backend with restricted access (GCS or S3) for team work; the CI
  workflow requires one.
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
just infra-fmt && just infra-validate gcp && just infra-validate aws    # CI runs the check variants changes in gcp/ or aws/
```
