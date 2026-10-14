# Optional, generic reader. Live Grafana identifiers belong only in private inputs.
data "aws_partition" "business_logs" {}

locals {
  business_log_group_arn = trimsuffix(aws_cloudwatch_log_group.core_api.arn, ":*")
}

data "aws_iam_policy_document" "grafana_business_logs_trust" {
  count = nonsensitive(var.grafana_cloud_logs_reader != null) ? 1 : 0

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "AWS"
      identifiers = ["arn:${data.aws_partition.business_logs.partition}:iam::${var.grafana_cloud_logs_reader.account_id}:root"]
    }
    condition {
      test     = "StringEquals"
      variable = "sts:ExternalId"
      values   = [var.grafana_cloud_logs_reader.external_id]
    }
  }
}

resource "aws_iam_role" "grafana_business_logs" {
  count              = nonsensitive(var.grafana_cloud_logs_reader != null) ? 1 : 0
  name               = "${var.name_prefix}-grafana-business-logs"
  assume_role_policy = data.aws_iam_policy_document.grafana_business_logs_trust[0].json
}

data "aws_iam_policy_document" "grafana_business_logs_read" {
  count = nonsensitive(var.grafana_cloud_logs_reader != null) ? 1 : 0

  statement {
    sid       = "QueryCoreLogsOnly"
    effect    = "Allow"
    actions   = ["logs:StartQuery", "logs:GetLogGroupFields", "logs:GetQueryResults"]
    resources = [local.business_log_group_arn, "${local.business_log_group_arn}:*"]
  }

  # AWS does not support resource ARNs for these actions. Describe reveals
  # regional log-group metadata; StopQuery can stop other regional queries.
  statement {
    sid       = "RegionalMetadataAndQueryStop"
    effect    = "Allow"
    actions   = ["logs:DescribeLogGroups", "logs:StopQuery"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = [var.region]
    }
  }
}

resource "aws_iam_role_policy" "grafana_business_logs_read" {
  count  = nonsensitive(var.grafana_cloud_logs_reader != null) ? 1 : 0
  name   = "${var.name_prefix}-core-business-logs-read"
  role   = aws_iam_role.grafana_business_logs[0].id
  policy = data.aws_iam_policy_document.grafana_business_logs_read[0].json
}
