# AWS bootstrap (apply once)

The four things that must exist **before** [`infra/aws/`](../README.md) can use its S3 backend
and before GitHub Actions can deploy without stored credentials
([ADR 0007](../../../docs/architecture/adr/0007-aws-cloud-and-auth.md)):

| Resource | Name | Used by |
|---|---|---|
| S3 bucket (versioned, SSE, TLS-only, no public access) | `travel-ai-tfstate-<account-id>` | the main root's `backend "s3"` |
| IAM OIDC provider | `token.actions.githubusercontent.com` | `aws-actions/configure-aws-credentials` |
| IAM role `travel-ai-github-deploy` | trust: `repo:manupm87/travel-ai-world:environment:aws` | `deploy-backend.yml` |
| IAM role `travel-ai-github-ecr-public-pull` | trust: `repo:manupm87/travel-ai-world:*` | `_build-image.yml`, the Compose e2e (ECR Public pull token only) |

The deploy role has `PowerUserAccess` plus IAM on roles named `travel-ai-*` (meant for the roles
the main root creates: the two Lambda execution roles and the optional
`travel-ai-grafana-business-logs`; the pattern also matches this role itself, so it can change its
own policies), nothing else. The ECR Public pull role can only fetch an ECR Public pull token. This root keeps **local state** (`terraform.tfstate`, ignored by
git; it holds no secrets). Do not add anything else here: it is not applied by CI.

```bash
just aws-login                       # SSO session with a permission set that can create IAM roles and buckets
cd infra/aws/bootstrap
terraform init && terraform apply
terraform output                     # state_bucket, ci_role_arn, ecr_public_pull_role_arn, main_root_init
```

Then, in GitHub → Settings:

- **Environments → `aws`**: create it (add required reviewers if you want every apply gated).
- **Secrets**: `AWS_REGION` = `eu-west-1`, `AWS_ROLE_TO_ASSUME` = `ci_role_arn`.
- **Variables**: `AWS_TF_STATE_BUCKET` = `state_bucket`; `AWS_ECR_PUBLIC_ROLE` = `ecr_public_pull_role_arn`
  (the image builds log in to ECR Public with it, because anonymous pulls of the Lambda
  adapter hit the per-IP rate limit on GitHub's shared runners; the role can only ask for the
  ECR Public pull token, and any job of the repository may assume it. Unset, builds pull
  anonymously).

And initialise the main root against the bucket (the exact command is the `main_root_init`
output):

```bash
cd ..
terraform init -backend-config="bucket=$(terraform -chdir=bootstrap output -raw state_bucket)" -backend-config="region=eu-west-1"
```

If the local state of this folder is lost, re-adopt the resources with `terraform import`
(bucket name, provider ARN and role name are deterministic).
