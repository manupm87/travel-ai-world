output "artifacts_bucket" {
  description = "Where the shared embeddings artefact lives while the spike runs."
  value       = aws_s3_bucket.artifacts.bucket
}

output "vector_bucket" {
  description = "The spike's own S3 Vectors bucket; fill it with `index-s3vectors`."
  value       = aws_s3vectors_vector_bucket.spike.vector_bucket_name
}

output "ecr_repository_url" {
  description = "Push the Qdrant image here before the first apply."
  value       = aws_ecr_repository.qdrant.repository_url
}

output "qdrant_function_urls" {
  description = "Function URLs of each Qdrant size (IAM-authenticated: curl alone will not do)."
  value       = { for size, url in aws_lambda_function_url.qdrant : size => url.function_url }
}

output "bench_function_names" {
  description = "Invoke these to measure: one per Qdrant size."
  value       = { for size, fn in aws_lambda_function.bench : size => fn.function_name }
}
