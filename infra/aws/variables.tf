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

variable "core_api_image" {
  description = "ECR image URI for core_api (users, trips). Use a digest (repo@sha256:...) so a new image redeploys the function."
  type        = string
}

variable "ai_api_image" {
  description = "ECR image URI for ai_api (chat streaming). Use a digest (repo@sha256:...)."
  type        = string
}

variable "core_api_memory_mb" {
  description = "Memory of the core_api function. CPU scales with it, and the init phase (SQLAlchemy import plus the VPC attachment) has 10 s: 1769 MB is one full vCPU."
  type        = number
  default     = 1769
}

variable "ai_api_memory_mb" {
  description = "Memory of the ai_api function."
  type        = number
  default     = 512
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for both functions."
  type        = number
  default     = 14
}

variable "nvidia_chat_model" {
  description = "Chat model served by NVIDIA for ai_api."
  type        = string
  default     = "nvidia/nemotron-3-super-120b-a12b"
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

variable "google_client_id" {
  description = "Google OAuth client ID (used by the Cognito identity provider)."
  type        = string
  sensitive   = true
}

variable "google_client_secret" {
  description = "Google OAuth client secret (held by Cognito). Stored in Terraform state when managed here."
  type        = string
  sensitive   = true
}

variable "backend_cors_origins" {
  description = "JSON list of extra browser origins allowed to call the API. The deployed frontend is same-origin (CloudFront) and needs none; a local frontend does."
  type        = string
  default     = "[\"http://localhost:3000\"]"
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

# -----------------------------------------------------------------------------
# Frontend (S3 + CloudFront + Route 53)
# -----------------------------------------------------------------------------

variable "domain_name" {
  description = "Domain name for the frontend (must exist in Route 53)."
  type        = string
  default     = "kyrian-world.com"
}

variable "frontend_bucket_name" {
  description = "S3 bucket name for the static frontend."
  type        = string
  default     = "kyrian-world.com"
}

variable "cloudfront_price_class" {
  description = "CloudFront price class. A distribution on CloudFront's Free pricing plan only accepts PriceClass_All."
  type        = string
  default     = "PriceClass_All"
}

variable "create_www_record" {
  description = "Create www.kyrian-world.com record."
  type        = bool
  default     = false
}

# -----------------------------------------------------------------------------
# Sign-in (Cognito)
# -----------------------------------------------------------------------------

variable "cognito_subdomain" {
  description = "Label of the managed-login host under domain_name (\"auth\" -> auth.<domain>, covered by the wildcard certificate). Empty keeps the pool's default *.amazoncognito.com host. A default, not a tfvars value, so the CI apply and a local apply agree."
  type        = string
  default     = "auth"
}

variable "cognito_dev_origins" {
  description = "Extra browser origins allowed to sign in (callback = <origin>/auth/callback/)."
  type        = list(string)
  default     = ["http://localhost:3000"]
}

variable "tags" {
  description = "Tags to apply to all resources."
  type        = map(string)
  default = {
    Project     = "travel-ai-world"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}
