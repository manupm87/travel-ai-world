# Existing native metrics only; CloudFront metrics live in us-east-1.
resource "aws_cloudwatch_dashboard" "infrastructure" {
  count          = var.infrastructure_dashboard_enabled ? 1 : 0
  dashboard_name = "${var.name_prefix}-infrastructure-metrics"
  dashboard_body = templatefile("${path.module}/metric/cloudwatch/infrastructure_metrics.json.tftpl", {
    region          = var.region
    core_table      = aws_dynamodb_table.core.name
    traces_table    = aws_dynamodb_table.interactions.name
    distribution_id = aws_cloudfront_distribution.frontend.id
    core_function   = aws_lambda_function.core_api.function_name
    ai_function     = aws_lambda_function.ai_api.function_name
  })
}

variable "infrastructure_dashboard_enabled" {
  description = "Create the native DynamoDB, CloudFront and Lambda infrastructure dashboard; verify the account dashboard free-tier allowance."
  type        = bool
  default     = true
}

output "infrastructure_dashboard_url" {
  description = "AWS console URL for the infrastructure dashboard."
  value       = var.infrastructure_dashboard_enabled ? "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards:name=${aws_cloudwatch_dashboard.infrastructure[0].dashboard_name}" : null
}
