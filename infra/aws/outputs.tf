output "ecr_repository_urls" {
  description = "ECR repository URL per service image."
  value       = { for k, r in aws_ecr_repository.services : k => r.repository_url }
}

output "aws_region" {
  description = "AWS region of the deployment."
  value       = var.region
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
  description = "Name of the core_api Lambda function."
  value       = aws_lambda_function.core_api.function_name
}

output "ai_api_function_name" {
  description = "Name of the ai_api Lambda function."
  value       = aws_lambda_function.ai_api.function_name
}

output "core_table_name" {
  description = "Name of the core_api DynamoDB table."
  value       = aws_dynamodb_table.core.name
}

output "grafana_business_logs_role_arn" {
  description = "Optional Grafana Assume Role ARN; null until the private reader configuration is supplied."
  value       = try(aws_iam_role.grafana_business_logs[0].arn, null)
}

output "core_api_log_group_name" {
  description = "Existing application log group for core_api Logs Insights queries."
  value       = aws_cloudwatch_log_group.core_api.name
}
