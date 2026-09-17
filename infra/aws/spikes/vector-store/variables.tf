variable "region" {
  description = "Same Region as the rest of the stack, or the latency is not comparable."
  type        = string
  default     = "eu-west-1"
}

variable "name_prefix" {
  description = "Prefix for the spike's resource names."
  type        = string
  default     = "travel-ai"
}

variable "image_tag" {
  description = "Tag of the Qdrant image pushed to the spike's ECR repository."
  type        = string
  default     = "budapest"
}

variable "architecture" {
  description = "Lambda architecture; must match the image you built and pushed."
  type        = string
  default     = "x86_64"

  validation {
    condition     = contains(["x86_64", "arm64"], var.architecture)
    error_message = "architecture must be x86_64 or arm64."
  }
}

variable "qdrant_memory_sizes" {
  description = "Memory sizes to measure Qdrant at (one function each). 2048 is the one to deploy: at 1024 the container peaked at 1,012 MB of its 1,024."
  type        = list(number)
  default     = [1024, 2048]
}

variable "qdrant_tmp_mb" {
  description = "Ephemeral /tmp: holds the copy of the collection (about 60 MB for Budapest)."
  type        = number
  default     = 1024
}

variable "bench_memory_mb" {
  description = "Memory for the bench function, close to what ai_api uses."
  type        = number
  default     = 1024
}

variable "bench_zip" {
  description = "Override the path to the packaged bench function; empty uses the one bench_lambda/build.sh writes."
  type        = string
  default     = ""
}

variable "vector_index" {
  description = "Name of the spike's own S3 Vectors index (candidate B)."
  type        = string
  default     = "city-kb"
}

variable "embeddings_model" {
  description = "Embeddings model; the same one on both candidates (ADR 0014)."
  type        = string
  default     = "amazon.titan-embed-text-v2:0"
}

variable "embeddings_dimensions" {
  description = "Embedding dimensions."
  type        = number
  default     = 1024
}
