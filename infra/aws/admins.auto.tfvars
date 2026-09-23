# Administrators (ADR 0024): Cognito usernames `terraform apply` puts in the
# `admin` group. Committed on purpose — it holds no secret, and the CI deploy
# applies from a clean checkout where `terraform.tfvars` does not exist, so a
# list kept there would be emptied on the first deploy. Terraform loads every
# `*.auto.tfvars` by itself, locally and in CI.
#
# A Google account's username is `Google_<sub>` (capital G, as Cognito prints
# it), known after the person's first sign-in: `just cognito-username <email>`.
# After the apply the person signs out and in again so the ID token carries
# `cognito:groups`.
admin_usernames = [
  "Google_108657555537374578008", # manugijon@gmail.com
]
