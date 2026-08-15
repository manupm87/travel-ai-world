variable "region" {
  description = "AWS region for all regional resources."
  type        = string
  default     = "eu-west-1"
}

variable "name_prefix" {
  description = "Prefix used for resource names."
  type        = string
  default     = "travel-ai"
}

variable "backend_image" {
  description = "ECR image URI for the backend."
  type        = string
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
  description = "Database password. Stored in Terraform state when managed here."
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

variable "frontend_url" {
  description = "Public frontend URL."
  type        = string
}

variable "backend_cors_origins" {
  description = "JSON list of allowed frontend origins."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR range for the VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "deletion_protection" {
  description = "Protect RDS from accidental deletion."
  type        = bool
  default     = true
}
