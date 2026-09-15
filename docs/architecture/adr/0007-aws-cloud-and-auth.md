# 0007 — AWS is the deployment cloud; SSO locally, OIDC in CI, state in S3

**Status:** Accepted
**Date:** 2026-09-15

## Context

`infra/` has kept two equivalent Terraform folders (`gcp/`, `aws/`) since the beginning, both
validated by CI, neither applied. Choosing one unblocks the first real deployment and decides
which tooling the devcontainer ships and how every actor (a developer, a coding agent running in
the devcontainer, GitHub Actions) obtains credentials.

Credentials are the sensitive part. The devcontainer runs coding agents with shell access, so
anything stored in it (or mounted into it from the host) is readable by them. Long-lived IAM
access keys on disk would be the single worst asset to leak. The Terraform state contains
`db_password`, `secret_key` and the OAuth client secret, so wherever it lives must be as
restricted as Secrets Manager.

## Decision

- **AWS** (`infra/aws/`: ECS Fargate ×2 + RDS + ALB + ECR + Secrets Manager) is the cloud we
  deploy to. `infra/gcp/` stays in the repo and in CI's `infra-validate` matrix as a documented
  alternative, but it is not applied and does not drive tooling decisions.
- **Devcontainer tooling**: AWS CLI v2, Terraform (pinned minor), `crane` (registry-to-registry
  image copy, so no Docker daemon is needed inside the container) and the Session Manager plugin
  (`aws ecs execute-command`). No SAM, CDK, Copilot or Docker-in-Docker.
- **Local authentication is IAM Identity Center (SSO)**: `aws configure sso`-style profile
  `travel-ai-world` seeded from `.devcontainer/aws-config.example` (account id, role, start URL,
  region: no secrets), `AWS_PROFILE` set by compose, `just aws-login` for the device-code flow.
  Tokens are short-lived and cached in the `aws_config` named volume; the host's `~/.aws` is never
  mounted. The permission set should be scoped to the project's resources, not
  `AdministratorAccess` (see the amendment below for the current account).
  Access keys (`aws_access_key_id`) are forbidden in `.env`, `terraform.tfvars`, the repo and
  the container.
- **CI authentication is OIDC**: `deploy-backend.yml` assumes `AWS_ROLE_TO_ASSUME` through
  `aws-actions/configure-aws-credentials`; the role's trust policy is restricted to
  `repo:manupm87/travel-ai-world:environment:aws`. No AWS secrets are stored in GitHub beyond the
  role ARN and region.
- **Terraform state lives in a private S3 bucket** (versioned, SSE, public access blocked,
  native lockfile `use_lockfile = true`, so no DynamoDB table). The bucket, the GitHub OIDC
  provider and the CI role are created once by a small `infra/aws/bootstrap/` root with local
  state; the main `infra/aws/` root then uses the S3 backend (`infra/aws/bootstrap/`, #73).

## Consequences

- Good: no long-lived cloud credential exists anywhere in the pipeline; a compromised devcontainer
  or agent session yields at most a few hours of a scoped role. Developers, agents and CI use
  the same Terraform files and the same state, so `plan` output is comparable.
- Good: the devcontainer stays daemon-free; image promotion is `crane copy`.
- Bad: IAM Identity Center is one more console to configure (organization, user, permission
  set); documented in `infra/aws/README.md`. `aws sso login` has to be repeated when the token
  expires.
- Bad: the first `terraform apply` of the bootstrap root is manual and keeps a local state file
  (ignored by git); losing it means importing three resources by hand.
- Amendment (2026-09-15): the account we deploy to is a member of an organization whose
  management account (and therefore Identity Center) we do not administer. Permission sets and
  assignments can only be created there, so neither the console nor the bootstrap root can
  create `TravelAIWorldDeveloper`; the organization grants `AdministratorAccess` and we use it.
  The scoped permission set stays the target for any account whose Identity Center we own, and
  the bootstrap root deliberately does not manage Identity Center resources. The bootstrap was
  applied that day (state bucket, OIDC provider, CI role) and the main root initialised against
  the S3 backend.
- Revisit if a second environment (staging) appears: then the bootstrap should create one role
  and one state key per GitHub environment.
