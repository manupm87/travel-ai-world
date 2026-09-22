output "ecr_repository_urls" {
  description = "ECR repository URL per service image."
  value       = { for k, r in aws_ecr_repository.services : k => r.repository_url }
}

output "aws_region" {
  value = var.region
}

output "api_url" {
  description = "Public API base URL (CloudFront, same origin as the frontend): NEXT_PUBLIC_API_URL."
  value       = "https://${var.domain_name}"
}

output "api_gateway_invoke_url" {
  description = "The gateway's own URL (bypasses CloudFront; same Cognito token required)."
  value       = aws_api_gateway_stage.prod.invoke_url
}

output "core_api_function_name" {
  description = "Invoke with {\"command\": \"copy-from-postgres\"} once, after the DynamoDB cut-over (TRA-218)."
  value       = aws_lambda_function.core_api.function_name
}

output "ai_api_function_name" {
  value = aws_lambda_function.ai_api.function_name
}

output "rds_endpoint" {
  value = aws_db_instance.main.address
}

output "core_table_name" {
  value = aws_dynamodb_table.core.name
}
