# AWS (ECS Fargate + RDS + ALB)

Read [`infra/README.md`](../README.md) first: images, secrets, state and CORS/OAuth are the same
for both clouds. This folder deploys the two services as **ECS Fargate** services behind one
**Application Load Balancer**, which acts as the API gateway: a single public origin, routed by
path. The frontend needs only `NEXT_PUBLIC_API_URL`.

| Service | Image | Receives | ALB rule |
|---|---|---|---|
| `core-api` | `core-api` | `DB_*`, `GOOGLE_*`, `SECRET_KEY` | default action |
| `ai-api` | `ai-api` | `NVIDIA_API_KEY`, `SECRET_KEY`, `CORE_API_URL` (the ALB URL) | `/api/v1/ai/*` |

## What Terraform creates

- VPC, public subnets and security groups (ALB → ECS:8000 → RDS:5432).
- RDS PostgreSQL 16 (private).
- Two ECR repositories: `${name_prefix}-core-api`, `${name_prefix}-ai-api`.
- Secrets Manager secrets: `secret-key`, `google-client-id`, `google-client-secret`,
  `db-password`, `nvidia-api-key`; each task execution role can read only its own.
- One ECS cluster and two Fargate services (module `modules/ecs_service`).
- ALB with two target groups, health checks on `/api/v1/health/` and `/api/v1/ai/health/`, and a
  300 s idle timeout for streaming responses.

## Access (once per account)

Nobody uses access keys ([ADR 0007](../../docs/architecture/adr/0007-aws-cloud-and-auth.md)).
In the AWS console, once:

1. **IAM Identity Center** → Enable (it creates an organization if there is none; free).
2. **Users** → add yourself (email invitation) and any other maintainer.
3. **Permission sets** → create `TravelAIWorldDeveloper`. `PowerUserAccess` plus the inline
   IAM statements of [`bootstrap/main.tf`](bootstrap/main.tf) is the right size for whoever runs
   Terraform by hand; read-only users get `ViewOnlyAccess`.
4. **AWS accounts** → assign the user(s) to this account with that permission set.
5. Copy the **start URL** (Settings) and the account id into `~/.aws/config` in the devcontainer
   (see [`.devcontainer/README.md`](../../.devcontainer/README.md#aws)), then `just aws-login`.

## First deployment

Prerequisites: the devcontainer (AWS CLI v2, Terraform ≥ 1.11, `crane`) and an SSO session
(`just aws-login`).

0. Bootstrap, once: state bucket, GitHub OIDC provider and CI role, following
   [`bootstrap/README.md`](bootstrap/README.md). It ends with the `terraform init` of this
   folder against the S3 backend.

```bash
cp terraform.tfvars.example terraform.tfvars      # fill in every value; the file is ignored by git
terraform init -backend-config="bucket=$(terraform -chdir=bootstrap output -raw state_bucket)" -backend-config="region=eu-west-1"
terraform validate
```

1. Registry first:

   ```bash
   terraform apply -target=aws_ecr_repository.services
   ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
   REG="$ACCOUNT.dkr.ecr.eu-west-1.amazonaws.com"
   aws ecr get-login-password --region eu-west-1 | crane auth login --username AWS --password-stdin "$REG"
   for svc in core-api ai-api; do
     crane copy ghcr.io/manupm87/travel-ai-world/$svc:latest $REG/travel-ai-$svc:latest
   done
   ```

   `crane` copies registry-to-registry, so no Docker daemon is needed in the devcontainer. On a
   host with Docker, `docker buildx imagetools create -t <dst> <src>` does the same, or build
   locally from `src/backend/` (`just docker-build`) and push both tags to `$REG`.

2. Everything else:

   ```bash
   terraform plan && terraform apply
   terraform output -raw backend_url
   ```

3. Frontend:

   ```bash
   cd ../../src/frontend
   export NEXT_PUBLIC_API_URL="$(terraform -chdir=../../infra/aws output -raw backend_url)"
   npm run build
   ```

Later deploys: the "Deploy backend" workflow with `cloud=aws`. It assumes the bootstrap's role
through OIDC and initialises the same S3 backend; it needs the secrets `AWS_REGION`,
`AWS_ROLE_TO_ASSUME`, the variable `AWS_TF_STATE_BUCKET` and the `TF_VAR_*` listed in the
workflow header.

## Debugging a running task

The devcontainer includes the Session Manager plugin, so you can open a shell in a Fargate task
(the task role needs `ssmmessages:*` and the service `enable_execute_command`):

```bash
aws ecs execute-command --cluster <cluster> --task <task-id> --container core-api --interactive --command /bin/sh
aws logs tail /ecs/<name_prefix>-core-api --follow
```

For production add an ACM certificate and an HTTPS listener to the ALB before publishing the domain.
