variable "region" {
  description = "AWS region for the state bucket and the IAM resources."
  type        = string
  default     = "eu-west-1"
}

variable "name_prefix" {
  description = "Prefix used for resource names (same value as the main root)."
  type        = string
  default     = "travel-ai"
}

variable "github_repository" {
  description = "GitHub repository (owner/name) allowed to assume the CI role."
  type        = string
  default     = "manupm87/travel-ai-world"
}

variable "github_environment" {
  description = "GitHub Actions environment whose jobs may assume the CI role (deploy-backend.yml uses `environment: aws`)."
  type        = string
  default     = "aws"
}
