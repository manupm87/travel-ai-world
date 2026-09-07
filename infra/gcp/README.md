# Google Cloud (Cloud Run + Cloud SQL)

Read [`infra/README.md`](../README.md) first: images, secrets, state and CORS/OAuth are the same
for both clouds. This folder deploys the two services as separate **Cloud Run** services.

| Service | Image | Receives | Network |
|---|---|---|---|
| `${name_prefix}-core-api` | `core-api` | `DB_*`, `GOOGLE_*`, `SECRET_KEY` | egress through the VPC connector to Cloud SQL (private IP) |
| `${name_prefix}-ai-api` | `ai-api` | `NVIDIA_API_KEY`, `SECRET_KEY`, `CORE_API_URL` (the first service's URL) | no VPC |

## What Terraform creates

- The required GCP APIs, a VPC, a subnet and a Serverless VPC Access connector.
- Cloud SQL PostgreSQL 16 (private IP), database and user.
- One Artifact Registry Docker repository (`${name_prefix}-images`).
- Secret Manager secrets: `secret-key`, `google-client-id`, `google-client-secret`,
  `db-password`, `nvidia-api-key`; each service account can read only its own.
- Two Cloud Run services (module `modules/cloud_run_service`), publicly invocable.

Not created: a load balancer in front of both services. The frontend accepts two base URLs
([ADR 0003](../../docs/architecture/adr/0003-frontend-two-base-urls.md)); add a global LB only
when you want a single domain.

## First deployment

Prerequisites: a project with billing, `gcloud`, Terraform ≥ 1.6, Docker, and permissions on
Cloud Run, Cloud SQL, VPC, Artifact Registry, Secret Manager and IAM.

```bash
gcloud auth login && gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
cp terraform.tfvars.example terraform.tfvars      # fill in every value; the file is ignored by git
terraform init && terraform validate
```

1. Registry first, because Cloud Run needs an existing image:

   ```bash
   terraform apply -target=google_artifact_registry_repository.backend
   gcloud auth configure-docker europe-west1-docker.pkg.dev
   REG=europe-west1-docker.pkg.dev/YOUR_PROJECT_ID/travel-ai-images
   for svc in core-api ai-api; do
     docker buildx imagetools create -t $REG/$svc:latest ghcr.io/manupm87/travel-ai-world/$svc:latest
   done
   ```

   Or build locally from `src/backend/` (`just docker-build`) and push both tags to `$REG`.

2. Everything else:

   ```bash
   terraform plan && terraform apply
   terraform output core_api_url ai_api_url
   ```

3. Frontend:

   ```bash
   cd ../../src/frontend
   export NEXT_PUBLIC_API_URL="$(terraform -chdir=../../infra/gcp output -raw core_api_url)"
   export NEXT_PUBLIC_AI_API_URL="$(terraform -chdir=../../infra/gcp output -raw ai_api_url)"
   npm run build
   ```

Later deploys: the "Deploy backend" workflow with `cloud=gcp`. It needs a GCS state backend in
`versions.tf` and the secrets `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`,
`GCP_SERVICE_ACCOUNT` plus the `TF_VAR_*` listed in the workflow header.

`terraform destroy` requires `deletion_protection = false` on the Cloud SQL instance.
