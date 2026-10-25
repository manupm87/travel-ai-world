# Infrastructure

Terraform for the two backend services on AWS ([ADR 0007](../docs/architecture/adr/0007-aws-cloud-and-auth.md)).
Nothing is created until you run `terraform apply`.

| Folder | What it holds |
|---|---|
| [`aws/`](aws/README.md) | Lambda ×2 + API Gateway REST + Cognito + DynamoDB + ECR + S3 Vectors, behind CloudFront (S3 frontend, WAF); no VPC. One public origin: the CloudFront domain, with `/api/*` routed to the gateway |
| [`aws/bootstrap/`](aws/bootstrap/README.md) | Applied once: the remote state bucket, the GitHub OIDC provider and the CI role |

Google Cloud only hosts the **Google OAuth client** (created by hand in the console, not in
Terraform): Cognito uses it as its identity provider, and the local Google button uses it directly.

`core_api` and `ai_api` deploy as separate functions, each with its own role and access **only to
its secrets**. Both run in `AUTH_MODE=cognito`: a Cognito user pool signs people in with Google and
both services verify its RS256 tokens offline ([ADR 0009](../docs/architecture/adr/0009-lambda-cognito-budget.md)).
Why two services and why the frontend accepts two URLs: [ADR 0001](../docs/architecture/adr/0001-backend-split.md),
[ADR 0003](../docs/architecture/adr/0003-frontend-two-base-urls.md).

## Conventions

- **Images** are built by CI (`.github/workflows/backend-images.yml`) and published to GHCR as
  `ghcr.io/manupm87/travel-ai-world/{core-api,ai-api}` (tags: commit SHA and `latest`). Terraform
  only references image URLs; copy them into ECR with
  `crane copy ghcr.io/manupm87/travel-ai-world/<image>:<tag> <registry>/<image>:<tag>` (no Docker
  daemon needed; installed in the devcontainer; keeps the digest), or build locally from
  `src/backend/` (`just docker-build`). Not `docker buildx imagetools create`: it wraps the image
  in an OCI index, which Lambda rejects ("image manifest ... media type is not supported").
- **Secrets** are Terraform variables (`google_client_secret`, `nvidia_api_key`;
  `google_client_id` travels with them but is public). They become encrypted Lambda environment
  variables (no Secrets Manager, ADR 0009), and the Google client goes to Cognito. Locally they go
  in `terraform.tfvars` (ignored by git; start from `terraform.tfvars.example`). In CI they arrive
  as `TF_VAR_*` secrets of the `aws` GitHub environment, which must match the local tfvars
  ([deploy runbook](../docs/runbooks/deploy.md)).
- **OAuth**: the Google OAuth client must list the Cognito domain's `/oauth2/idpresponse` as a
  redirect URI (see [`aws/README.md`](aws/README.md#sign-in-cognito)), and `http://localhost:3000`
  as a JavaScript origin if you use the Google button locally.
- **No migrations**: `core_api` keeps its data in DynamoDB
  ([ADR 0023](../docs/architecture/adr/0023-dynamodb-data-store.md)), whose table Terraform owns,
  so neither the container start (`src/backend/docker/entrypoint.sh`) nor the deploy workflow
  runs a schema step.
- **State**: commit `.terraform.lock.hcl`, never `*.tfstate` or `*.tfvars`. Sensitive variables end
  up in the state, so it lives in the private S3 bucket created by
  [`aws/bootstrap/`](aws/bootstrap/README.md) (partial backend config passed at `init`).
- **The frontend** is a static export in the private S3 bucket behind the same CloudFront
  distribution as the API (`aws/frontend.tf`), synced by `.github/workflows/deploy.yml` on every
  push to `main`. Frontend and API share one domain, so a backend deploy changes no frontend URL.

## Workflow

1. **First apply, by hand** (ECR first, because the functions need an existing image): follow
   [`aws/README.md`](aws/README.md).
2. **Later deploys from CI**: Actions → "Deploy backend" → image tag and whether to apply
   (`apply=false` only plans). Required secrets are in the header of
   `.github/workflows/deploy-backend.yml` and in the [deploy runbook](../docs/runbooks/deploy.md).

```bash
just infra-fmt && just infra-validate aws && just infra-validate aws/bootstrap    # CI runs the check variants on changes in infra/
```
