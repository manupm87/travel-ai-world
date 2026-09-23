# The two backend images as Lambda functions (ADR 0009). The images carry the
# Lambda Web Adapter and their AWS_LWA_* settings (src/backend/Dockerfile), so
# only the application's own configuration is set here. Environment variables
# are encrypted at rest with the Lambda service key; the values (the NVIDIA
# key) are already in the Terraform state, which the bootstrap protects
# (ADR 0007).

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

# ── core_api: outside the VPC; DynamoDB through IAM ─────────────────────────

resource "aws_cloudwatch_log_group" "core_api" {
  name              = "/aws/lambda/${var.name_prefix}-core-api"
  retention_in_days = var.log_retention_days
}

resource "aws_iam_role" "core_api" {
  name               = "${var.name_prefix}-core-api-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "core_api_basic" {
  role       = aws_iam_role.core_api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
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

  environment {
    variables = merge(local.backend_env, {
      CORE_TABLE = aws_dynamodb_table.core.name
    })
  }

  depends_on = [aws_cloudwatch_log_group.core_api, aws_iam_role_policy_attachment.core_api_basic]
}

# ── ai_api: reaches the LLM provider and core_api ───────────────────────────

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

# Bedrock as the cloud LLM provider (ADR 0009, TRA-122). ai_api calls the chat
# and title models through EU geographic cross-Region inference profiles, so
# prompts are processed in EU Regions. Invoking a profile takes two grants: the
# profile in this Region, and its foundation model in every Region the profile
# routes to. The second grant is pinned to the profile by the
# bedrock:InferenceProfileArn condition, so the Region wildcard never allows
# calling the model directly (Bedrock user guide, "IAM policy requirements for
# Geographic cross-Region inference"). Embedding models are granted by the
# retrieval issue that needs them.
locals {
  bedrock_profile_arns = {
    for profile in toset([var.bedrock_chat_model, var.bedrock_title_model]) :
    profile => "arn:aws:bedrock:${var.region}:${data.aws_caller_identity.current.account_id}:inference-profile/${profile}"
  }
}

data "aws_iam_policy_document" "ai_api_bedrock" {
  statement {
    sid       = "InvokeEuInferenceProfiles"
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = values(local.bedrock_profile_arns)
  }

  dynamic "statement" {
    for_each = local.bedrock_profile_arns
    content {
      effect    = "Allow"
      actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
      resources = ["arn:aws:bedrock:*::foundation-model/${trimprefix(statement.key, "eu.")}"]

      condition {
        test     = "StringEquals"
        variable = "bedrock:InferenceProfileArn"
        values   = [statement.value]
      }
    }
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
      # Which adapter answers the chat (TRA-122): Bedrock with this role, or
      # NVIDIA as the fallback (llm_provider = "nvidia"; its key stays set).
      LLM_PROVIDER        = var.llm_provider
      BEDROCK_REGION      = var.region
      BEDROCK_CHAT_MODEL  = var.bedrock_chat_model
      BEDROCK_TITLE_MODEL = var.bedrock_title_model
      NVIDIA_API_KEY      = var.nvidia_api_key
      NVIDIA_CHAT_MODEL   = var.nvidia_chat_model
      # core_api through the public origin, with the caller's own token.
      CORE_API_URL = "https://${var.domain_name}"
      # Where the answers are grounded (ADR 0014): the index of vectors.tf,
      # searched with this role. Off until a corpus has been indexed.
      RETRIEVAL_ENABLED = tostring(var.retrieval_enabled)
      VECTOR_BUCKET     = aws_s3vectors_vector_bucket.main.vector_bucket_name
      VECTOR_INDEX      = aws_s3vectors_index.city_kb.index_name
      VECTOR_REGION     = var.region
      EMBEDDINGS_MODEL  = var.embeddings_model
      EMBEDDINGS_REGION = var.region
      # The trace of every turn (ADR 0024), table in traces.tf.
      INTERACTIONS_TABLE = aws_dynamodb_table.interactions.name
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
