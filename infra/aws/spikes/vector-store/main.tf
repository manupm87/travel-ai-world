# Throwaway stack for the vector store spike (TRA-151).
#
# It measures, it does not serve: a Qdrant function (candidate A) and a bench
# function that times both candidates from where ai_api runs. Candidate B needs
# no compute, only permission to query the index the main stack already owns.
#
# Local state on purpose (no S3 backend, nothing shared with the main stack), so
# `terraform destroy` here can never touch production. Destroy it after measuring.

terraform {
  # Lower than the main stack on purpose: that one needs 1.11 for the S3
  # backend's native lockfile, and this stack keeps its state locally.
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.26"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      spike   = "vector-store"
      issue   = "TRA-151"
      managed = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  prefix = "${var.name_prefix}-spike-vs"
  # The index of the main stack (ADR 0014), queried read-only by the bench.
  vector_index_arn = "arn:aws:s3vectors:${var.region}:${data.aws_caller_identity.current.account_id}:bucket/${var.vector_bucket}/index/${var.vector_index}"
  embeddings_arn   = "arn:aws:bedrock:${var.region}::foundation-model/${var.embeddings_model}"
}

# ── Shared artefacts ─────────────────────────────────────────────────────────

# The embeddings artefact (24 MB of float32) is deterministic but expensive to
# regenerate in wall-clock time, and both candidates must be filled from exactly
# the same vectors. It is too big for git, so it lives here while the spike does.
resource "aws_s3_bucket" "artifacts" {
  bucket        = "${local.prefix}-artifacts-${data.aws_caller_identity.current.account_id}"
  force_destroy = true # a spike bucket: destroy must not need a manual empty
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# ── Candidate A: Qdrant as its own Lambda ────────────────────────────────────

resource "aws_ecr_repository" "qdrant" {
  name         = "${local.prefix}-qdrant"
  force_delete = true # a spike repository: destroy must not need a manual purge

  image_scanning_configuration {
    scan_on_push = false
  }
}

resource "aws_iam_role" "qdrant" {
  name               = "${local.prefix}-qdrant"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "qdrant_logs" {
  role       = aws_iam_role.qdrant.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# One function per memory size: Qdrant's cold start is dominated by loading the
# collection, and Lambda scales CPU with memory, so this is the interesting axis.
resource "aws_lambda_function" "qdrant" {
  for_each = toset([for m in var.qdrant_memory_sizes : tostring(m)])

  function_name = "${local.prefix}-qdrant-${each.value}"
  role          = aws_iam_role.qdrant.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.qdrant.repository_url}:${var.image_tag}"
  memory_size   = tonumber(each.value)
  timeout       = 60
  architectures = [var.architecture]

  ephemeral_storage {
    size = var.qdrant_tmp_mb # the collection is copied into /tmp at every cold start
  }
}

# AWS_IAM, never NONE: the store is reachable only by a signed request, so a
# question never leaves the account and there is no key to keep.
resource "aws_lambda_function_url" "qdrant" {
  for_each = aws_lambda_function.qdrant

  function_name      = each.value.function_name
  authorization_type = "AWS_IAM"
  invoke_mode        = "BUFFERED"
}

# ── The bench function ───────────────────────────────────────────────────────

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "bench" {
  statement {
    sid       = "EmbedQueries"
    actions   = ["bedrock:InvokeModel"]
    resources = [local.embeddings_arn]
  }

  statement {
    sid       = "QueryS3Vectors"
    actions   = ["s3vectors:QueryVectors", "s3vectors:GetIndex"]
    resources = [local.vector_index_arn]
  }

  statement {
    sid       = "CallQdrant"
    actions   = ["lambda:InvokeFunctionUrl"]
    resources = [for f in aws_lambda_function.qdrant : f.arn]

    condition {
      test     = "StringEquals"
      variable = "lambda:FunctionUrlAuthType"
      values   = ["AWS_IAM"]
    }
  }
}

resource "aws_iam_role" "bench" {
  name               = "${local.prefix}-bench"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy" "bench" {
  name   = "bench"
  role   = aws_iam_role.bench.id
  policy = data.aws_iam_policy_document.bench.json
}

resource "aws_iam_role_policy_attachment" "bench_logs" {
  role       = aws_iam_role.bench.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "bench" {
  for_each = aws_lambda_function_url.qdrant

  function_name    = "${local.prefix}-bench-${each.key}"
  role             = aws_iam_role.bench.arn
  handler          = "handler.handler"
  runtime          = "python3.12"
  filename         = var.bench_zip
  source_code_hash = filebase64sha256(var.bench_zip)
  memory_size      = var.bench_memory_mb
  timeout          = 300
  architectures    = ["x86_64"] # the zip is pure Python; the arch only has to be valid

  environment {
    variables = {
      QDRANT_URL            = each.value.function_url
      VECTOR_BUCKET         = var.vector_bucket
      VECTOR_INDEX          = var.vector_index
      EMBEDDINGS_MODEL      = var.embeddings_model
      EMBEDDINGS_DIMENSIONS = tostring(var.embeddings_dimensions)
    }
  }
}
