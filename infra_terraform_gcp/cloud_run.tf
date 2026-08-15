resource "google_service_account" "backend" {
  account_id   = "${var.name_prefix}-backend"
  display_name = "Travel AI backend runtime"
}

resource "google_secret_manager_secret_iam_member" "backend" {
  for_each = google_secret_manager_secret.app

  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_cloud_run_v2_service" "backend" {
  name     = "${var.name_prefix}-backend"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.backend.email

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    vpc_access {
      connector = google_vpc_access_connector.run.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.backend_image

      ports {
        container_port = 8000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      env {
        name  = "DB_ENGINE"
        value = "postgresql"
      }
      env {
        name  = "DB_SERVER"
        value = google_sql_database_instance.main.private_ip_address
      }
      env {
        name  = "DB_PORT"
        value = "5432"
      }
      env {
        name  = "DB_USER"
        value = var.db_user
      }
      env {
        name  = "DB_NAME"
        value = var.db_name
      }
      env {
        name  = "FRONTEND_URL"
        value = var.frontend_url
      }
      env {
        name  = "BACKEND_CORS_ORIGINS"
        value = var.backend_cors_origins
      }

      dynamic "env" {
        for_each = {
          NVIDIA_API_KEY       = "nvidia-api-key"
          SECRET_KEY           = "secret-key"
          GOOGLE_CLIENT_ID     = "google-client-id"
          GOOGLE_CLIENT_SECRET = "google-client-secret"
          DB_PASSWORD          = "db-password"
        }

        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.app[env.value].id
              version = "latest"
            }
          }
        }
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_iam_member.backend,
    google_sql_database.main,
    google_sql_user.main,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.backend.name
  location = google_cloud_run_v2_service.backend.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
