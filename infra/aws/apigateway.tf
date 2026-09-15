# API Gateway REST, regional (ADR 0008/0009): the one door to both functions.
#
#   /api/v1/ai/{proxy+}  → ai_api,   response streaming (SSE chat, up to 15 min)
#   /api/v1/{proxy+}     → core_api, buffered
#
# Every method requires a Cognito ID token (the user pool authorizer); the
# services verify the same token again themselves. CloudFront is the only
# public caller (frontend.tf), but the invoke URL works directly too.

resource "aws_api_gateway_rest_api" "main" {
  name        = "${var.name_prefix}-api"
  description = "Travel AI World backend: core_api and ai_api on Lambda"

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_authorizer" "cognito" {
  name            = "cognito"
  rest_api_id     = aws_api_gateway_rest_api.main.id
  type            = "COGNITO_USER_POOLS"
  provider_arns   = [aws_cognito_user_pool.main.arn]
  identity_source = "method.request.header.Authorization"
}

# ── Resources: /api/v1/{proxy+} and /api/v1/ai/{proxy+} ─────────────────────

resource "aws_api_gateway_resource" "api" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "api"
}

resource "aws_api_gateway_resource" "v1" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.api.id
  path_part   = "v1"
}

resource "aws_api_gateway_resource" "core_proxy" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.v1.id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_resource" "ai" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.v1.id
  path_part   = "ai"
}

resource "aws_api_gateway_resource" "ai_proxy" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.ai.id
  path_part   = "{proxy+}"
}

# ── Methods + integrations ──────────────────────────────────────────────────

resource "aws_api_gateway_method" "core_proxy" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.core_proxy.id
  http_method   = "ANY"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id

  request_parameters = { "method.request.path.proxy" = true }
}

resource "aws_api_gateway_integration" "core_proxy" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.core_proxy.id
  http_method             = aws_api_gateway_method.core_proxy.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.core_api.invoke_arn
  response_transfer_mode  = "BUFFERED"
  timeout_milliseconds    = 29000
}

resource "aws_api_gateway_method" "ai_proxy" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.ai_proxy.id
  http_method   = "ANY"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id

  request_parameters = { "method.request.path.proxy" = true }
}

resource "aws_api_gateway_integration" "ai_proxy" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.ai_proxy.id
  http_method             = aws_api_gateway_method.ai_proxy.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.ai_api.response_streaming_invoke_arn
  response_transfer_mode  = "STREAM"
  timeout_milliseconds    = 900000
}

# ── Deployment + stage ──────────────────────────────────────────────────────

resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id

  # A new deployment whenever the API's shape changes.
  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.core_proxy.id,
      aws_api_gateway_resource.ai_proxy.id,
      aws_api_gateway_method.core_proxy.id,
      aws_api_gateway_method.ai_proxy.id,
      aws_api_gateway_integration.core_proxy.id,
      aws_api_gateway_integration.core_proxy.uri,
      aws_api_gateway_integration.ai_proxy.id,
      aws_api_gateway_integration.ai_proxy.uri,
      aws_api_gateway_integration.ai_proxy.response_transfer_mode,
      aws_api_gateway_authorizer.cognito.id,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "prod" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  deployment_id = aws_api_gateway_deployment.main.id
  stage_name    = "prod"
}

locals {
  # Host and path CloudFront forwards /api/* to.
  api_gateway_host = "${aws_api_gateway_rest_api.main.id}.execute-api.${var.region}.amazonaws.com"
  api_gateway_path = "/${aws_api_gateway_stage.prod.stage_name}"
}
