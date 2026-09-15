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
  description = "ECR image URI for core_api (auth, users, trips)."
  type        = string
}

variable "ai_api_image" {
  description = "ECR image URI for ai_api (chat streaming)."
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
  description = "CloudFront price class (PriceClass_All, PriceClass_200, PriceClass_100)."
  type        = string
  default     = "PriceClass_100" # Solo N. America y Europa (más barato)
}

variable "create_www_record" {
  description = "Create www.kyrian-world.com record."
  type        = bool
  default     = false
}

# -----------------------------------------------------------------------------
# Sign-in (Cognito)
# -----------------------------------------------------------------------------

variable "cognito_custom_domain" {
  description = "Custom managed-login host (e.g. auth.kyrian-world.com). Empty uses the pool's default *.amazoncognito.com host. Needs the us-east-1 ACM certificate to cover it."
  type        = string
  default     = ""
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
