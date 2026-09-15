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
   Terraform state backend (AWS: [`infra/aws/bootstrap/`](../../infra/aws/bootstrap/README.md),
   applied once by hand), the secrets listed in the workflow header and the repository variables
   `AWS_TF_STATE_BUCKET` (AWS) or `GCP_REGION` (GCP). CI never holds cloud credentials: AWS is
   reached through OIDC with the bootstrap's role, restricted to the `aws` GitHub environment.

Frontend variables per shape:

| Shape | `NEXT_PUBLIC_API_URL` | `NEXT_PUBLIC_AI_API_URL` |
|---|---|---|
| AWS (ALB routes `/api/v1/ai/*`) | ALB URL | unset |
| GCP (two Cloud Run URLs) | `core_api_url` output | `ai_api_url` output |

After changing the backend URL, rebuild the frontend and register the frontend origin in Google
OAuth and in `backend_cors_origins`.

---

## Frontend manual en AWS (S3 + CloudFront)

Si el frontend se despliega manualmente en AWS (no vía GitHub Pages), seguir el runbook
[`frontend-https-aws.md`](frontend-https-aws.md). Documenta el paso a paso de:

- ACM Certificate (SSL en us-east-1)
- CloudFront con OAC (Origin Access Control)
- S3 bucket privado
- Route 53 (Alias A/AAAA)
- Error pages para SPA (403/404 → index.html)

> **Nota:** La versión automatizada con Terraform está en desarrollo (`infra/aws/frontend.tf`).
