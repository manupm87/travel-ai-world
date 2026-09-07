variable "project_id" {
  description = "Google Cloud project ID."
  type        = string
}

variable "region" {
  description = "GCP region for regional resources."
  type        = string
  default     = "europe-west1"
}

variable "zone" {
  description = "GCP zone used by Cloud SQL."
  type        = string
  default     = "europe-west1-b"
}

variable "name_prefix" {
  description = "Prefix used for resource names."
  type        = string
  default     = "travel-ai"
}

variable "core_api_image" {
  description = "Artifact Registry image URI for core_api (auth, users, trips)."
  type        = string
}

variable "ai_api_image" {
  description = "Artifact Registry image URI for ai_api (chat streaming)."
  type        = string
}

variable "nvidia_chat_model" {
  description = "Chat model served by NVIDIA for ai_api."
  type        = string
  default     = "minimaxai/minimax-m3"
}

variable "db_name" {
  description = "Application database name."
  type        = string
  default     = "travel_ai_world"
}

variable "db_user" {
  description = "Application database user."
  type        = string
  default     = "travel"
}

variable "db_password" {
  description = "Application database password. Stored in Terraform state when managed here."
  type        = string
  sensitive   = true
}

variable "nvidia_api_key" {
  description = "NVIDIA API key. Stored in Terraform state when managed here."
  type        = string
  sensitive   = true
}

variable "secret_key" {
  description = "JWT signing key. Stored in Terraform state when managed here."
  type        = string
  sensitive   = true
}

variable "google_client_id" {
  description = "Google OAuth client ID."
  type        = string
  sensitive   = true
}

variable "google_client_secret" {
  description = "Google OAuth client secret. Stored in Terraform state when managed here."
  type        = string
  sensitive   = true
}

variable "backend_cors_origins" {
  description = "JSON list of allowed frontend origins."
  type        = string
}

variable "cloud_sql_tier" {
  description = "Cloud SQL machine tier."
  type        = string
  default     = "db-custom-1-3840"
}

variable "deletion_protection" {
  description = "Protect Cloud SQL from accidental deletion."
  type        = bool
  default     = true
}
