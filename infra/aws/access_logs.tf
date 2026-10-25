# One structured application record per request in the existing Lambda groups.
resource "aws_cloudwatch_dashboard" "access_logs" {
  count          = var.access_logs_dashboard_enabled ? 1 : 0
  dashboard_name = "${var.name_prefix}-access-logs"
  dashboard_body = templatefile("${path.module}/metric/cloudwatch/access_logs.json.tftpl", {
    region         = var.region
    core_log_group = aws_cloudwatch_log_group.core_api.name
    ai_log_group   = aws_cloudwatch_log_group.ai_api.name
  })
}

output "access_logs_dashboard_url" {
  description = "Console URL for access-log queries; each open/refresh scans the selected log window."
  value       = var.access_logs_dashboard_enabled ? "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards:name=${aws_cloudwatch_dashboard.access_logs[0].dashboard_name}" : null
}
