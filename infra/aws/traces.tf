# ai_api's interaction log (ADR 0023, amended by ADR 0024): one trace per
# planner turn, chat answer and card detail, written before the stream's
# closing frame (ai_api/infrastructure/dynamo_traces.py).
#
# Items:
#   summary  PK = DAY#<YYYY-MM-DD>   SK = <ts µs ISO>#<turn_id>
#            GSI1 = SUBJECT#<subject> / <ts>   (one user's turns)
#            GSI2 = SESSION#<session_id> / <ts> (one conversation; sparse)
#   context  PK = TURN#<turn_id>     SK = CONTEXT
#   events   PK = TURN#<turn_id>     SK = EVENTS
#   step     PK = TURN#<turn_id>     SK = SPAN#<seq>
# Every item carries `expires_at` (epoch seconds): the TTL below deletes it
# after INTERACTION_TTL_DAYS (90 by default). A log that expires by design
# needs no point-in-time recovery and no deletion protection.

resource "aws_dynamodb_table" "interactions" {
  name         = "${var.name_prefix}-interactions"
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
  attribute {
    name = "GSI2PK"
    type = "S"
  }
  attribute {
    name = "GSI2SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "GSI2"
    hash_key        = "GSI2PK"
    range_key       = "GSI2SK"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  deletion_protection_enabled = false

  tags = var.tags
}

# ai_api writes the traces and, for the admin console (TRA-221), reads them
# back by key and by index. Never Scan, never the table's configuration
# beyond describing it.
data "aws_iam_policy_document" "ai_api_interactions" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:BatchWriteItem",
      "dynamodb:Query",
      "dynamodb:GetItem",
      "dynamodb:DescribeTable",
    ]
    resources = [
      aws_dynamodb_table.interactions.arn,
      "${aws_dynamodb_table.interactions.arn}/index/*",
    ]
  }
}

resource "aws_iam_role_policy" "ai_api_interactions" {
  name   = "interactions"
  role   = aws_iam_role.ai_api.id
  policy = data.aws_iam_policy_document.ai_api_interactions.json
}
