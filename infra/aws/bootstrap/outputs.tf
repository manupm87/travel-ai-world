output "state_bucket" {
  description = "S3 bucket for the main root's state (repository variable AWS_TF_STATE_BUCKET)."
  value       = aws_s3_bucket.state.bucket
}

output "ci_role_arn" {
  description = "Role GitHub Actions assumes (repository secret AWS_ROLE_TO_ASSUME)."
  value       = aws_iam_role.github_deploy.arn
}

output "main_root_init" {
  description = "terraform init command for infra/aws with this state bucket."
  value       = "terraform init -backend-config=\"bucket=${aws_s3_bucket.state.bucket}\" -backend-config=\"region=${var.region}\""
}
