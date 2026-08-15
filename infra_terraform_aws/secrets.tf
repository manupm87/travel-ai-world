locals {
  secret_values = {
    db-password          = var.db_password
    nvidia-api-key       = var.nvidia_api_key
    secret-key           = var.secret_key
    google-client-id     = var.google_client_id
    google-client-secret = var.google_client_secret
  }
}

resource "aws_secretsmanager_secret" "app" {
  for_each = local.secret_values
  name     = "${var.name_prefix}/${each.key}"
}

resource "aws_secretsmanager_secret_version" "app" {
  for_each      = local.secret_values
  secret_id     = aws_secretsmanager_secret.app[each.key].id
  secret_string = each.value
}
