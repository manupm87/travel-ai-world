# Runbook — deploy

**Frontend.** `.github/workflows/deploy.yml` runs on every push to `main` that touches
`src/frontend/`: it builds the static export with `NEXT_PUBLIC_API_URL=https://<domain>` and the
Cognito variables, syncs `out/` to the private S3 bucket and invalidates CloudFront. Repository
variables: `FRONTEND_DOMAIN`, `CLOUDFRONT_DISTRIBUTION_ID`, `COGNITO_DOMAIN`, `COGNITO_CLIENT_ID`;
secrets `AWS_REGION`, `AWS_ROLE_TO_ASSUME` (the same OIDC role as the backend) and
`GOOGLE_CLIENT_ID`.

**Backend.** Images are built by `backend-images.yml`. Getting them to AWS is a manual,
two-step decision:

1. **First deployment**: read [`infra/README.md`](../../infra/README.md), then follow
   [`infra/aws/README.md`](../../infra/aws/README.md) once for the initial `terraform apply`
   (Lambda + API Gateway + Cognito + DynamoDB behind CloudFront).
2. **Subsequent deploys** run `.github/workflows/deploy-backend.yml` (Actions → "Deploy backend"
   → Run workflow): pick the image tag (a commit SHA or `latest`) and whether to apply.
   It copies the GHCR images into ECR, pins the functions to the image digests and runs
   Terraform. Nothing runs after the apply: `core_api` keeps its data in
   DynamoDB (ADR 0023), whose table is Terraform's, so there are no migrations. Requires a remote
   Terraform state backend
   ([`infra/aws/bootstrap/`](../../infra/aws/bootstrap/README.md), applied once by hand), the
   secrets listed in the workflow header and the repository variables `AWS_TF_STATE_BUCKET` +
   `FRONTEND_DOMAIN`. CI never holds cloud credentials: AWS is
   reached through OIDC with the bootstrap's role, restricted to the `aws` GitHub environment.

   **The `aws` environment must hold every secret the applied state was built with**:
   `TF_VAR_nvidia_api_key` and `TF_VAR_google_client_secret` (the values of
   the local `terraform.tfvars`). Only secrets live there: non-secret inputs such as
   `google_client_id` and `backend_cors_origins` are defaults in `infra/aws/variables.tf`. A missing
   secret reaches Terraform as an empty string, and the plan then resets the Lambda secrets and
   Cognito's Google client.
   Whenever one of these values changes (a rotation), update the secret **and** the local
   tfvars together. Before any `apply=true`, run with `apply=false` and require the plan to show
   only the two Lambda `image_uri` changes, plus the Terraform changes merged since the last
   apply.

The deployed frontend is built with `NEXT_PUBLIC_API_URL=https://<domain>` (CloudFront routes
`/api/*` to the gateway: same origin, no CORS), no `NEXT_PUBLIC_AI_API_URL`, and the Cognito
sign-in variables `NEXT_PUBLIC_COGNITO_DOMAIN` + `NEXT_PUBLIC_COGNITO_CLIENT_ID`.

## Promoting a backend change (the sequence after a merge)

Nothing reaches AWS from a merge alone except the frontend. After `main` changes:

1. **Images**: `backend-images.yml` runs on the push if it touched `src/backend/**` and publishes
   `ghcr.io/<repo>/core-api` and `.../ai-api` tagged with the commit SHA and `latest`. Wait for it
   (Actions → "Backend images") before promoting; `latest` moves with every run.
2. **Promote**: Actions → "Deploy backend" → Run workflow with `image_tag=<that
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

## Data store

`core_api` stores everything in one DynamoDB table (`travel-ai-core`,
[ADR 0023](../architecture/adr/0023-dynamodb-data-store.md)); there is no relational database and
no migration step.

## Frontend on AWS (S3 + CloudFront)

Terraform manages the bucket, the distribution and the DNS records in `infra/aws/frontend.tf`; the
ACM certificate and the hosted zone are imported into its state (ADR 0010). The console view of
the same setup is in [`frontend-https-aws.md`](frontend-https-aws.md). A CloudFront Function
resolves `/route/` to `/route/index.html`; the distribution has no 403/404 → `index.html` error
pages, because error pages apply to the whole distribution and would turn the API's 403/404 into
HTML. One narrower error response remains: the 403 S3 returns for a missing path is served as
`404.html` with status 404 and no error caching. The API's JSON 404s are untouched, and an API 403
arrives as a 404 (the frontend treats both as "not found").
