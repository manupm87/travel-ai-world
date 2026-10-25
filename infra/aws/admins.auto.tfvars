# Administrators (ADR 0024): Cognito usernames `terraform apply` puts in the
# `admin` group. Committed on purpose — it holds no secret, and the CI deploy
# applies from a clean checkout where `terraform.tfvars` does not exist, so a
# list kept there would be emptied on the first deploy. Terraform loads every
# `*.auto.tfvars` by itself, locally and in CI.
#
# A Google account's username is `Google_<sub>` (capital G, as Cognito prints
# it), known after the person's first sign-in: `just cognito-username <email>`.
# After the apply the person signs out and in again so the ID token carries
# `cognito:groups`. Entries carry a first name, never an email: to match an
# email to its username, run `just cognito-username <email>`.
admin_usernames = [
  "Google_108657555537374578008", # Manuel
  "Google_103190282319288494474", # Alexander
  "Google_111853055735810265639", # Joaquín
  "Google_107694207370503807198", # David
]
