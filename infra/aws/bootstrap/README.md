# AWS bootstrap (apply once)

The three things that must exist **before** [`infra/aws/`](../README.md) can use its S3 backend
and before GitHub Actions can deploy without stored credentials
([ADR 0007](../../../docs/architecture/adr/0007-aws-cloud-and-auth.md)):

| Resource | Name | Used by |
|---|---|---|
| S3 bucket (versioned, SSE, TLS-only, no public access) | `travel-ai-tfstate-<account-id>` | the main root's `backend "s3"` |
| IAM OIDC provider | `token.actions.githubusercontent.com` | `aws-actions/configure-aws-credentials` |
| IAM role `travel-ai-github-deploy` | trust: `repo:manupm87/travel-ai-world:environment:aws` | `deploy-backend.yml` |

The role has `PowerUserAccess` plus IAM on roles named `travel-ai-*` (the ECS task and
execution roles), nothing else. This root keeps **local state** (`terraform.tfstate`, ignored by
git; it holds no secrets). Do not add anything else here: it is not applied by CI.

```bash
just aws-login                       # SSO session with a permission set that can create IAM roles and buckets
cd infra/aws/bootstrap
terraform init && terraform apply
terraform output                     # state_bucket, ci_role_arn, main_root_init
```

Then, in GitHub → Settings:

- **Environments → `aws`**: create it (add required reviewers if you want every apply gated).
- **Secrets**: `AWS_REGION` = `eu-west-1`, `AWS_ROLE_TO_ASSUME` = `ci_role_arn`.
- **Variables**: `AWS_TF_STATE_BUCKET` = `state_bucket`.

And initialise the main root against the bucket (the exact command is the `main_root_init`
output):

```bash
cd ..
terraform init -backend-config="bucket=$(terraform -chdir=bootstrap output -raw state_bucket)" -backend-config="region=eu-west-1"
```

If the local state of this folder is lost, re-adopt the three resources with `terraform import`
(bucket name, provider ARN and role name are deterministic).
