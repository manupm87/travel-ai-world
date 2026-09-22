# DynamoDB is the data store (ADR 0023). One table per owning service:
# core_api's single table here; ai_api's interaction log joins it in TRA-220.
# On-demand billing: demo traffic costs cents, and nothing is provisioned idle.

# ── core_api: users, trips (whole aggregates), conversations, messages ──────
# Keys (core_api/infrastructure/dynamo): USER#<id>/PROFILE, EMAIL#<email>/EMAIL,
# USER#<id>/TRIP#<id>, USER#<id>/THREAD#<id>, THREAD#<id>/MSG#<ts>#<id>;
# GSI1 = USERS/<email> for the admin list of accounts.

resource "aws_dynamodb_table" "core" {
  name         = "${var.name_prefix}-core"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }
  attribute {
    name = "GSI1PK"
    type = "S"
  }
  attribute {
    name = "GSI1SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = var.deletion_protection

  tags = var.tags
}

# What core_api may do with it: item reads and writes, never Scan, never the
# table's own configuration.
data "aws_iam_policy_document" "core_api_dynamodb" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:BatchWriteItem",
      "dynamodb:TransactWriteItems",
      "dynamodb:ConditionCheckItem",
      "dynamodb:DescribeTable",
    ]
    resources = [
      aws_dynamodb_table.core.arn,
      "${aws_dynamodb_table.core.arn}/index/*",
    ]
  }
}

resource "aws_iam_role_policy" "core_api_dynamodb" {
  name   = "dynamodb-core"
  role   = aws_iam_role.core_api.id
  policy = data.aws_iam_policy_document.core_api_dynamodb.json
}
