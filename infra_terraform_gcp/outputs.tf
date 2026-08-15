output "artifact_registry_repository" {
  value = google_artifact_registry_repository.backend.name
}

output "backend_image_repository" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.backend.repository_id}"
}

output "cloud_run_url" {
  value = google_cloud_run_v2_service.backend.uri
}

output "cloud_sql_private_ip" {
  value = google_sql_database_instance.main.private_ip_address
}

output "cloud_sql_connection_name" {
  value = google_sql_database_instance.main.connection_name
}
