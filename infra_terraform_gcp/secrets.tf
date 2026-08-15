locals {
  secret_values = {
    db-password          = var.db_password
    nvidia-api-key       = var.nvidia_api_key
    secret-key           = var.secret_key
    google-client-id     = var.google_client_id
    google-client-secret = var.google_client_secret
  }
}

resource "google_secret_manager_secret" "app" {
  for_each = local.secret_values

  secret_id = "${var.name_prefix}-${each.key}"
  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "app" {
  for_each = local.secret_values

  secret      = google_secret_manager_secret.app[each.key].id
  secret_data = each.value
}
