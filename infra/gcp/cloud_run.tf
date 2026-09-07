# Two Cloud Run services, one per backend image.
#
#   core_api  — auth, users, trips. Private egress to Cloud SQL.
#   ai_api    — chat streaming. No database; calls core_api over HTTPS with
#               the caller's own token when it has to persist something.
#
# Each service gets only the secrets it uses.

locals {
  # CORS is the only thing the backend needs to know about the frontend.
  frontend_env = {
    BACKEND_CORS_ORIGINS = var.backend_cors_origins
  }
}

module "core_api" {
  source = "./modules/cloud_run_service"

  name        = "${var.name_prefix}-core-api"
  location    = var.region
  image       = var.core_api_image
  health_path = "/api/v1/health/"

  vpc_connector = google_vpc_access_connector.run.id

  env = merge(local.frontend_env, {
    DB_SERVER = google_sql_database_instance.main.private_ip_address
    DB_PORT   = "5432"
    DB_USER   = var.db_user
    DB_NAME   = var.db_name
  })

  secret_env = {
    SECRET_KEY           = google_secret_manager_secret.app["secret-key"].id
    GOOGLE_CLIENT_ID     = google_secret_manager_secret.app["google-client-id"].id
    GOOGLE_CLIENT_SECRET = google_secret_manager_secret.app["google-client-secret"].id
    DB_PASSWORD          = google_secret_manager_secret.app["db-password"].id
  }

  depends_on = [
    google_sql_database.main,
    google_sql_user.main,
  ]
}

module "ai_api" {
  source = "./modules/cloud_run_service"

  name        = "${var.name_prefix}-ai-api"
  location    = var.region
  image       = var.ai_api_image
  health_path = "/api/v1/ai/health/"

  # Streaming answers hold a request open; give it a little more headroom.
  memory = "1Gi"

  env = merge(local.frontend_env, {
    CORE_API_URL      = module.core_api.uri
    NVIDIA_CHAT_MODEL = var.nvidia_chat_model
  })

  secret_env = {
    SECRET_KEY     = google_secret_manager_secret.app["secret-key"].id
    NVIDIA_API_KEY = google_secret_manager_secret.app["nvidia-api-key"].id
  }
}
