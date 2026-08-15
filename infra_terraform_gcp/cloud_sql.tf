resource "google_sql_database_instance" "main" {
  name                = "${var.name_prefix}-postgres"
  database_version    = "POSTGRES_15"
  region              = var.region
  deletion_protection = var.deletion_protection

  settings {
    tier              = var.cloud_sql_tier
    availability_type = "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = 10
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled       = false
      private_network    = google_compute_network.main.id
      allocated_ip_range = google_compute_global_address.private_services.name
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
    }
  }

  depends_on = [google_service_networking_connection.private_services]
}

resource "google_sql_database" "main" {
  name     = var.db_name
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "main" {
  name     = var.db_user
  instance = google_sql_database_instance.main.name
  password = var.db_password
}
