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
  # Relative to this module, not to the directory terraform is run from.
  bench_zip        = var.bench_zip != "" ? var.bench_zip : "${path.module}/../../../../src/backend/tools/vector_store_bench/bench_lambda/bench.zip"
  vector_index_arn = aws_s3vectors_index.city_kb.index_arn
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

# ── Candidate B: its own S3 Vectors store ────────────────────────────────────
#
# A copy of the main stack's index (ADR 0014), not the index itself: the spike
# fills and queries its own, so measuring never touches what TRA-152 deploys.

resource "aws_s3vectors_vector_bucket" "spike" {
  vector_bucket_name = "${local.prefix}-vectors"
  force_destroy      = true
}

resource "aws_s3vectors_index" "city_kb" {
  vector_bucket_name = aws_s3vectors_vector_bucket.spike.vector_bucket_name
  index_name         = var.vector_index
  data_type          = "float32"
  dimension          = var.embeddings_dimensions
  distance_metric    = "cosine"

  metadata_configuration {
    # The same split as ADR 0014, so the comparison measures the store and not a
    # different payload. `tour_type` and `price_model` (TRA-154) stay filterable.
    non_filterable_metadata_keys = [
      "text",
      "doc_id",
      "name",
      "url",
      "source_url",
      "heading_path",
      "extra",
    ]
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

  # Everything Qdrant writes must live in /tmp: the image's filesystem is
  # read-only on Lambda, and it panics at startup creating its snapshots
  # directory ("Can't create Snapshots directory: ReadOnlyFilesystem").
  environment {
    variables = {
      QDRANT__STORAGE__STORAGE_PATH   = "/tmp/storage"
      QDRANT__STORAGE__SNAPSHOTS_PATH = "/tmp/snapshots"
      QDRANT__STORAGE__TEMP_PATH      = "/tmp/qdrant-temp"
      QDRANT__TELEMETRY_DISABLED      = "true"
    }
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

# A Function URL with AWS_IAM needs both sides: the caller's identity policy
# (below) and this resource-based policy. Without it Lambda answers 403 and the
# request never reaches the container, so Qdrant logs nothing.
resource "aws_lambda_permission" "qdrant_url" {
  for_each = aws_lambda_function.qdrant

  statement_id           = "AllowBenchInvokeFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = each.value.function_name
  principal              = aws_iam_role.bench.arn
  function_url_auth_type = "AWS_IAM"
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

  # The spike fills its own index from a laptop, so the bench role never needs
  # to write; PutVectors is done with the operator's SSO session.

  # Since October 2025 a function URL needs both actions; granting only
  # InvokeFunctionUrl answers 403 with "Forbidden. For troubleshooting Function
  # URL authorization issues ...". InvokedViaFunctionUrl keeps the second action
  # from becoming a plain invoke permission.
  statement {
    sid       = "CallQdrantUrl"
    actions   = ["lambda:InvokeFunctionUrl"]
    resources = [for f in aws_lambda_function.qdrant : f.arn]

    condition {
      test     = "StringEquals"
      variable = "lambda:FunctionUrlAuthType"
      values   = ["AWS_IAM"]
    }
  }

  statement {
    sid       = "CallQdrantFunction"
    actions   = ["lambda:InvokeFunction"]
    resources = [for f in aws_lambda_function.qdrant : f.arn]

    condition {
      test     = "Bool"
      variable = "lambda:InvokedViaFunctionUrl"
      values   = ["true"]
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
  filename         = local.bench_zip
  source_code_hash = filebase64sha256(local.bench_zip)
  memory_size      = var.bench_memory_mb
  timeout          = 300
  architectures    = ["x86_64"] # the zip is pure Python; the arch only has to be valid

  environment {
    variables = {
      QDRANT_URL            = each.value.function_url
      VECTOR_BUCKET         = aws_s3vectors_vector_bucket.spike.vector_bucket_name
      VECTOR_INDEX          = var.vector_index
      EMBEDDINGS_MODEL      = var.embeddings_model
      EMBEDDINGS_DIMENSIONS = tostring(var.embeddings_dimensions)
    }
  }
}
