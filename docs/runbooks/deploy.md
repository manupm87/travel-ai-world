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

## Promoting a backend change (the sequence after a merge)

Nothing reaches AWS from a merge alone except the frontend. After `main` changes:

1. **Images**: `backend-images.yml` runs on the push if it touched `src/backend/**` and publishes
   `ghcr.io/<repo>/core-api` and `.../ai-api` tagged with the commit SHA and `latest`. Wait for it
   (Actions → "Backend images") before promoting; `latest` moves with every run.
2. **Promote**: Actions → "Deploy backend" → Run workflow with `cloud=aws`, `image_tag=<that
   SHA, or latest>`, `apply=true` (`apply=false` first if the Terraform plan is in doubt). It
   pins both functions to the image digests, applies, waits for `core-api` to be updated and
   invokes `{"command": "migrate"}`; the run fails if the answer is not `status: ok`.
3. **Confirm** the running image, from `infra/aws/` initialised against the state backend
   ([AWS README](../../infra/aws/README.md)) after `just aws-login`:

   ```bash
   fn=$(terraform output -raw core_api_function_name)
   aws lambda get-function --function-name "$fn" --query 'Code.ResolvedImageUri' --output text
   ```

   The digest must be the one the workflow printed in its "Copy images from GHCR" step.
4. **Seed demo data** if the environment needs it: next section. It never runs on its own.
5. **Frontend**: `deploy.yml` deploys itself on the push if it touched `src/frontend/**`
   (Actions → "Deploy frontend" → Run workflow to redo it by hand). A backend deploy that does
   not change the contract needs no frontend deploy, and the reverse.

## Seed demo data

`core_api` ships a `seed` command that loads the four demo trips for one account
([ADR 0011](../architecture/adr/0011-real-trips-seed-and-client-side-loading.md); every form of
the command in [docker.md](docker.md#the-same-image-on-aws-lambda)). On Lambda it is reachable
the way `migrate` is: the Web Adapter delivers a direct invocation as `POST /events`, which only
the IAM call can reach (the gateway forwards `/api/*` alone). It **never runs automatically**:
neither the deploy workflow nor the entrypoint calls it, so a production account gets demo
trips only when someone runs this, after `just aws-login`, from `infra/aws/`:

```bash
fn=$(terraform output -raw core_api_function_name)
aws lambda invoke --function-name "$fn" --cli-binary-format raw-in-base64-out \
  --payload '{"command": "seed", "args": {"email": "<google-email>"}}' /dev/stdout
```

The email is the Google account that will sign in on the site. The answer is
`{"command": "seed", "status": "ok"}` (the adapter may wrap it as
`{"statusCode": 200, "body": "..."}`); a missing email or an unknown command answers 400 and
nothing is written. The report is one log line in CloudWatch, in the function's log group
`/aws/lambda/<function name>` (`infra/aws/lambda.tf`):

```bash
aws logs tail "/aws/lambda/$fn" --since 10m --format short | grep 'Seed:'
# Seed: owner id=<n>: 4 demo trips (4 created, 0 replaced)
```

**Idempotent per account.** A demo trip is identified by owner and title, so a second
invocation for the same email reports `(0 created, 4 replaced)`, never eight trips; other trips
of that account and every other account are untouched. Each run is one transaction: the account
ends with the four trips or unchanged. The account row is created if it does not exist yet, and
Cognito's sign-in upserts by email, so signing in with that Google account afterwards adopts
the seeded row (profile refreshed) and the dashboard lists the four trips; open one to
check the full itinerary in the viewer (`/trip/?id=<uuid>`). To seed a second environment or a
second account, run the command again with that email.

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
