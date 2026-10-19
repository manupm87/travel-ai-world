# The store the chat retrieves from: Amazon S3 Vectors, in the same account and
# Region as everything else (ADR 0014). There is no endpoint to expose and no
# key to keep: `ai_api` reads it with its own IAM role, so a question and its
# embedding never leave the account. The vectors themselves are derived data —
# `just index` rebuilds them from the corpus committed under
# `src/backend/tools/city_corpus/data/`.

resource "aws_s3vectors_vector_bucket" "main" {
  vector_bucket_name = "${var.name_prefix}-vectors"
  # Derived data: a destroy should not stall on vectors that one command
  # recreates. Encryption stays the default (SSE-S3, AWS-managed).
  force_destroy = true

  tags = var.tags
}

# Dimension, distance metric and the non-filterable key list are frozen when
# the index is created: changing any of them replaces the index and needs a
# full reindex (~10 minutes and about 0.01 USD of embeddings). 1024 dimensions
# and cosine are what Titan Text Embeddings V2 produces normalised.
#
# The index runs in ENHANCED mode (filter first, then search; ADR 0033), set
# with the CLI because the provider has no `index_mode` argument: a plan does
# not touch it, but an index this resource *recreates* comes back in the
# bucket's default mode. After a replacement, before `just index`:
#   aws s3vectors update-index-mode --vector-bucket-name <bucket> \
#     --index-name <index> --index-mode ENHANCED
resource "aws_s3vectors_index" "city_kb" {
  vector_bucket_name = aws_s3vectors_vector_bucket.main.vector_bucket_name
  index_name         = var.vector_index_name
  data_type          = "float32"
  dimension          = var.embeddings_dimensions
  distance_metric    = "cosine"

  metadata_configuration {
    # What an answer shows but never filters on, `text` above all: keeping it
    # out of the filterable metadata keeps a document under the 2 KB filterable
    # budget (the worst Budapest one measures 185 B). Everything else in the
    # payload — city, category, district, kind, lang, source, price_tier, lat,
    # lon — stays filterable. Ten keys is the hard limit; seven are used.
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

  tags = var.tags
}

# ── What ai_api may do with it ──────────────────────────────────────────────

data "aws_iam_policy_document" "ai_api_retrieval" {
  # Read-only over this one index: the function searches, it never writes.
  # Indexing runs from a laptop with the operator's own SSO session.
  statement {
    effect = "Allow"
    actions = [
      "s3vectors:QueryVectors",
      "s3vectors:GetVectors",
      "s3vectors:GetIndex",
    ]
    resources = [aws_s3vectors_index.city_kb.index_arn]
  }

  # The query embedding. Titan Text Embeddings V2 is a plain foundation model
  # invoked in-Region, so it needs no inference profile (unlike the chat
  # models, which are EU cross-Region profiles).
  statement {
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel"]
    resources = ["arn:aws:bedrock:${var.region}::foundation-model/${var.embeddings_model}"]
  }
}

resource "aws_iam_role_policy" "ai_api_retrieval" {
  name   = "retrieval"
  role   = aws_iam_role.ai_api.id
  policy = data.aws_iam_policy_document.ai_api_retrieval.json
}
