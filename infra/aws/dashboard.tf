# Native service metrics only: no custom metrics, log scans or app changes.
# This delivers the presentation dashboard subset of TRA-297.
resource "aws_cloudwatch_dashboard" "service" {
  count          = var.service_dashboard_enabled ? 1 : 0
  dashboard_name = "${var.name_prefix}-service-metrics"
  dashboard_body = templatefile("${path.module}/metric/cloudwatch/service_metrics.json.tftpl", {
    region        = var.region
    core_function = aws_lambda_function.core_api.function_name
    ai_function   = aws_lambda_function.ai_api.function_name
    api_name      = aws_api_gateway_rest_api.main.name
    stage         = aws_api_gateway_stage.prod.stage_name
  })
}

variable "service_dashboard_enabled" {
  description = "Create the native CloudWatch service dashboard. Standard CloudWatch dashboard pricing applies."
  type        = bool
  default     = true
}

output "service_dashboard_url" {
  description = "CloudWatch console URL for the native service dashboard; requires AWS console access."
  value       = var.service_dashboard_enabled ? "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards:name=${aws_cloudwatch_dashboard.service[0].dashboard_name}" : null
}
