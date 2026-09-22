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
   functions to the image digests. Nothing runs after the apply: `core_api` keeps its data in
   DynamoDB (ADR 0023), whose table is Terraform's, so there are no migrations. Requires a remote
   Terraform state backend
   (AWS: [`infra/aws/bootstrap/`](../../infra/aws/bootstrap/README.md), applied once by hand), the
   secrets listed in the workflow header and the repository variables `AWS_TF_STATE_BUCKET` +
   `FRONTEND_DOMAIN` (AWS) or `GCP_REGION` (GCP). CI never holds cloud credentials: AWS is
   reached through OIDC with the bootstrap's role, restricted to the `aws` GitHub environment.

   **The `aws` environment must hold every secret the applied state was built with**:
   `TF_VAR_db_password`, `TF_VAR_nvidia_api_key` and `TF_VAR_google_client_secret` (the values of
   the local `terraform.tfvars`). Only secrets live there: non-secret inputs such as
   `google_client_id` and `backend_cors_origins` are defaults in `infra/aws/variables.tf`. A missing
   secret reaches Terraform as an empty string, and the plan then resets the RDS password, the
   Lambda secrets and Cognito's Google client (TRA-133).
   Whenever one of these values changes (a rotation), update the secret **and** the local
   tfvars together. Before any `apply=true`, run with `apply=false` and require the plan to show
   only the two Lambda `image_uri` changes.

Frontend variables per shape:

| Shape | `NEXT_PUBLIC_API_URL` | `NEXT_PUBLIC_AI_API_URL` | Sign-in |
|---|---|---|---|
| AWS (CloudFront `/api/*` → gateway) | `https://<domain>` (same origin, no CORS) | unset | `NEXT_PUBLIC_COGNITO_DOMAIN` + `NEXT_PUBLIC_COGNITO_CLIENT_ID` |
| GCP (two Cloud Run URLs) | `core_api_url` output | `ai_api_url` output | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` |

On GCP, after changing a backend URL, rebuild the frontend and register the frontend origin in
Google OAuth and in `backend_cors_origins`.

## Promoting a backend change (the sequence after a merge)

Nothing reaches AWS from a merge alone except the frontend. After `main` changes:

1. **Images**: `backend-images.yml` runs on the push if it touched `src/backend/**` and publishes
   `ghcr.io/<repo>/core-api` and `.../ai-api` tagged with the commit SHA and `latest`. Wait for it
   (Actions → "Backend images") before promoting; `latest` moves with every run.
2. **Promote**: Actions → "Deploy backend" → Run workflow with `cloud=aws`, `image_tag=<that
   SHA, or latest>`, `apply=true` (`apply=false` first if the Terraform plan is in doubt). It
   pins both functions to the image digests and applies.
3. **Confirm** the running image, from `infra/aws/` initialised against the state backend
   ([AWS README](../../infra/aws/README.md)) after `just aws-login`:

   ```bash
   fn=$(terraform output -raw core_api_function_name)
   aws lambda get-function --function-name "$fn" --query 'Code.ResolvedImageUri' --output text
   ```

   The digest must be the one the workflow printed in its "Copy images from GHCR" step.
4. **Frontend**: `deploy.yml` deploys itself on the push if it touched `src/frontend/**`
   (Actions → "Deploy frontend" → Run workflow to redo it by hand). A backend deploy that does
   not change the contract needs no frontend deploy, and the reverse.

## The one-off copy from RDS to DynamoDB

`core_api` stores everything in one DynamoDB table (`travel-ai-core`,
[ADR 0023](../architecture/adr/0023-dynamodb-data-store.md)). The accounts, trips and
conversations that were on RDS move once, with the `copy-from-postgres` command, after the image
that speaks DynamoDB is live (TRA-218 does the switch by hand):

```bash
fn=$(terraform output -raw core_api_function_name)   # from infra/aws/, after just aws-login
aws lambda invoke --function-name "$fn" --cli-binary-format raw-in-base64-out \
  --payload '{"command": "copy-from-postgres"}' response.json
cat response.json   # {"command": "copy-from-postgres", "status": "ok", "result": {"users": n, "trips": n, "threads": n, "messages": n}}
```

- It reads every row through `core_api/legacy_sql` (the function still has `DB_*` and the VPC
  until TRA-219) and **overwrites** the items, so it can run again with the same result.
- Ids and timestamps are kept. Users get UUIDs: the one already registered for their email when
  they signed in on DynamoDB before the copy, otherwise
  `uuid5(NAMESPACE_URL, "kyrian-world:user:<old integer id>")`; their trips and threads follow.
- It fails (500, `COPY_INCOMPLETE`) when what it wrote differs from what it read; the answer's
  `extras` carry both counts. Compare `result` with the row counts of RDS before retiring it.

---

## Frontend manual en AWS (S3 + CloudFront)

El paso a paso manual con el que se creó el certificado ACM, la zona de Route 53, el bucket y la
distribución está en [`frontend-https-aws.md`](frontend-https-aws.md). Terraform gestiona hoy el
bucket, la distribución y los registros DNS en `infra/aws/frontend.tf`; el certificado y la zona
se importaron al estado (ADR 0010). Las páginas de error 403/404 → `index.html` de aquel runbook se
sustituyeron por una CloudFront Function que resuelve `/ruta/` a `/ruta/index.html`, porque las
páginas de error se aplican a toda la distribución y convertían los 403/404 de la API en HTML.
Desde TRA-134 queda una sola, más estrecha: el 403 que S3 da para una ruta inexistente se sirve
como `404.html` con estado 404 y sin caché de errores; los 404 JSON de la API no se tocan y un
403 de la API llega como 404 (el frontend ya trata ambos como "no encontrado").
