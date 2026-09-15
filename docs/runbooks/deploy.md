# Runbook — deploy

**Frontend.** `.github/workflows/deploy.yml` runs on every push to `main` that touches
`src/frontend/`: it builds the static export with `NEXT_PUBLIC_API_URL=https://<domain>` and the
Cognito variables, syncs `out/` to the private S3 bucket and invalidates CloudFront. Repository
variables: `FRONTEND_DOMAIN`, `CLOUDFRONT_DISTRIBUTION_ID`, `COGNITO_DOMAIN`, `COGNITO_CLIENT_ID`;
secrets `AWS_REGION`, `AWS_ROLE_TO_ASSUME` (the same OIDC role as the backend).

**Backend.** Images are built by `backend-images.yml`. Getting them to a cloud is a manual,
two-step decision:

1. **Choose a cloud**: read [`infra/README.md`](../../infra/README.md) (what both clouds share), then
   follow the cloud's README once for the initial `terraform apply`:
   [AWS (Lambda + API Gateway + Cognito + RDS behind CloudFront)](../../infra/aws/README.md), the
   deployed one · [GCP (Cloud Run + Cloud SQL)](../../infra/gcp/README.md), the alternative.
   Both deploy `core_api` and `ai_api` separately with per-service configuration.
2. **Subsequent deploys** run `.github/workflows/deploy-backend.yml` (Actions → "Deploy backend"
   → Run workflow): pick the cloud, the image tag (a commit SHA or `latest`) and whether to apply.
   It copies the GHCR images into the cloud registry and runs Terraform; on AWS it pins the
   functions to the image digests and, after the apply, invokes `core-api` with
   `{"command": "migrate"}`. Requires a remote Terraform state backend
   (AWS: [`infra/aws/bootstrap/`](../../infra/aws/bootstrap/README.md), applied once by hand), the
   secrets listed in the workflow header and the repository variables `AWS_TF_STATE_BUCKET` +
   `FRONTEND_DOMAIN` (AWS) or `GCP_REGION` (GCP). CI never holds cloud credentials: AWS is
   reached through OIDC with the bootstrap's role, restricted to the `aws` GitHub environment.

Frontend variables per shape:

| Shape | `NEXT_PUBLIC_API_URL` | `NEXT_PUBLIC_AI_API_URL` | Sign-in |
|---|---|---|---|
| AWS (CloudFront `/api/*` → gateway) | `https://<domain>` (same origin, no CORS) | unset | `NEXT_PUBLIC_COGNITO_DOMAIN` + `NEXT_PUBLIC_COGNITO_CLIENT_ID` |
| GCP (two Cloud Run URLs) | `core_api_url` output | `ai_api_url` output | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` |

On GCP, after changing a backend URL, rebuild the frontend and register the frontend origin in
Google OAuth and in `backend_cors_origins`.

---

## Frontend manual en AWS (S3 + CloudFront)

El paso a paso manual con el que se creó el certificado ACM, la zona de Route 53, el bucket y la
distribución está en [`frontend-https-aws.md`](frontend-https-aws.md). Terraform gestiona hoy el
bucket, la distribución y los registros DNS en `infra/aws/frontend.tf`; el certificado y la zona
se leen como *data sources*. Las páginas de error 403/404 → `index.html` de aquel runbook se
sustituyeron por una CloudFront Function que resuelve `/ruta/` a `/ruta/index.html`, porque las
páginas de error se aplican a toda la distribución y convertían los 403/404 de la API en HTML.
