# The two backend images as Lambda functions (ADR 0009). The images carry the
# Lambda Web Adapter and their AWS_LWA_* settings (src/backend/Dockerfile), so
# only the application's own configuration is set here. Environment variables
# are encrypted at rest with the Lambda service key; the values (database
# password, NVIDIA key) are already in the Terraform state, which the
# bootstrap protects (ADR 0007).

locals {
  # Both functions in Cognito mode (cognito.tf), CORS for any extra origin.
  backend_env = merge(local.cognito_backend_env, {
    BACKEND_CORS_ORIGINS = var.backend_cors_origins
  })
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ── core_api: inside the VPC, talks to RDS only ─────────────────────────────

resource "aws_cloudwatch_log_group" "core_api" {
  name              = "/aws/lambda/${var.name_prefix}-core-api"
  retention_in_days = var.log_retention_days
}

resource "aws_iam_role" "core_api" {
  name               = "${var.name_prefix}-core-api-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

# Logs plus the ENIs a function in a VPC needs.
resource "aws_iam_role_policy_attachment" "core_api_vpc" {
  role       = aws_iam_role.core_api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_lambda_function" "core_api" {
  function_name = "${var.name_prefix}-core-api"
  role          = aws_iam_role.core_api.arn
  package_type  = "Image"
  image_uri     = var.core_api_image
  architectures = ["x86_64"]
  memory_size   = var.core_api_memory_mb
  # The gateway waits at most 29 s for a buffered integration.
  timeout = 30

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.core_api.id]
  }

  environment {
    variables = merge(local.backend_env, {
      DB_SERVER   = aws_db_instance.main.address
      DB_PORT     = "5432"
      DB_USER     = var.db_user
      DB_PASSWORD = var.db_password
      DB_NAME     = var.db_name
    })
  }

  depends_on = [aws_cloudwatch_log_group.core_api, aws_iam_role_policy_attachment.core_api_vpc]
}

# ── ai_api: outside the VPC, reaches the LLM provider and core_api ──────────

resource "aws_cloudwatch_log_group" "ai_api" {
  name              = "/aws/lambda/${var.name_prefix}-ai-api"
  retention_in_days = var.log_retention_days
}

resource "aws_iam_role" "ai_api" {
  name               = "${var.name_prefix}-ai-api-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "ai_api_basic" {
  role       = aws_iam_role.ai_api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Bedrock as the cloud LLM provider (ADR 0009; the adapter is TRA-122).
data "aws_iam_policy_document" "ai_api_bedrock" {
  statement {
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "ai_api_bedrock" {
  name   = "bedrock-invoke"
  role   = aws_iam_role.ai_api.id
  policy = data.aws_iam_policy_document.ai_api_bedrock.json
}

resource "aws_lambda_function" "ai_api" {
  function_name = "${var.name_prefix}-ai-api"
  role          = aws_iam_role.ai_api.arn
  package_type  = "Image"
  image_uri     = var.ai_api_image
  architectures = ["x86_64"]
  memory_size   = var.ai_api_memory_mb
  # A streamed chat answer may run for minutes; the gateway allows 15.
  timeout = 900

  environment {
    variables = merge(local.backend_env, {
      NVIDIA_API_KEY    = var.nvidia_api_key
      NVIDIA_CHAT_MODEL = var.nvidia_chat_model
      # core_api through the public origin, with the caller's own token.
      CORE_API_URL = "https://${var.domain_name}"
    })
  }

  depends_on = [aws_cloudwatch_log_group.ai_api, aws_iam_role_policy_attachment.ai_api_basic]
}

# ── The gateway may invoke both (streaming uses the same action) ────────────

resource "aws_lambda_permission" "core_api_from_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.core_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "ai_api_from_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ai_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}
