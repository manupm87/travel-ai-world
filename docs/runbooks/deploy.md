# Runbook — deploy

The frontend deploys itself to GitHub Pages on every push to `main`
(`.github/workflows/deploy.yml`). Backend images are built by `backend-images.yml`. Getting them
to a cloud is a manual, two-step decision:

1. **Choose a cloud**: read [`infra/README.md`](../../infra/README.md) (what both clouds share), then
   follow the cloud's README once for the initial `terraform apply`:
   [GCP (Cloud Run + Cloud SQL)](../../infra/gcp/README.md) ·
   [AWS (ECS Fargate + RDS + ALB)](../../infra/aws/README.md).
   Both deploy `core_api` and `ai_api` as separate services with per-service secrets.
2. **Subsequent deploys** run `.github/workflows/deploy-backend.yml` (Actions → "Deploy backend"
   → Run workflow): pick the cloud, the image tag (a commit SHA or `latest`) and whether to apply.
   It copies the GHCR images into the cloud registry and runs Terraform. Requires a remote
   Terraform state backend, the secrets listed in the workflow header and, for GCP, the repository
   variable `GCP_REGION`.

Frontend variables per shape:

| Shape | `NEXT_PUBLIC_API_URL` | `NEXT_PUBLIC_AI_API_URL` |
|---|---|---|
| AWS (ALB routes `/api/v1/ai/*`) | ALB URL | unset |
| GCP (two Cloud Run URLs) | `core_api_url` output | `ai_api_url` output |

After changing the backend URL, rebuild the frontend and register the frontend origin in Google
OAuth and in `backend_cors_origins`.
