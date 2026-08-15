resource "google_artifact_registry_repository" "backend" {
  location      = var.region
  repository_id = "${var.name_prefix}-images"
  description   = "Container images for Travel AI World"
  format        = "DOCKER"

  depends_on = [google_project_service.required]
}
