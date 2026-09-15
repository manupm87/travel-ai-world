# Frontend — S3 + CloudFront + ACM + Route 53
# Documentación manual: docs/runbooks/frontend-https-aws.md
# NOTA: Requiere que el dominio esté en Route 53 (hosted zone) y validado en ACM.

# -----------------------------------------------------------------------------
# Data sources — Hosted Zone y ACM Certificate existentes (creados manualmente)
# -----------------------------------------------------------------------------

data "aws_route53_zone" "main" {
  name         = var.domain_name
  private_zone = false
}

data "aws_acm_certificate" "frontend" {
  domain      = var.domain_name
  types       = ["AMAZON_ISSUED"]
  most_recent = true

  # El certificado debe estar en us-east-1 para CloudFront
  provider = aws.us_east_1
}

# -----------------------------------------------------------------------------
# S3 Bucket — Frontend estático (privado, acceso vía CloudFront OAC)
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "frontend" {
  bucket = var.frontend_bucket_name

  tags = merge(
    var.tags,
    {
      Name = var.frontend_bucket_name
    }
  )
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Política del bucket: permite lectura solo desde CloudFront (OAC)
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipal"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          ArnLike = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })

  depends_on = [aws_cloudfront_distribution.frontend]
}

# -----------------------------------------------------------------------------
# CloudFront Origin Access Control (OAC)
# -----------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.name_prefix}-frontend-oac"
  description                       = "OAC for ${var.domain_name} frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# -----------------------------------------------------------------------------
# CloudFront Function — directory index for the static export
# -----------------------------------------------------------------------------
# Next.js exports `/dashboard/` as `dashboard/index.html`; S3 only serves the
# root's default object. The function maps `/x/` and `/x` (no extension) to
# `/x/index.html` before the request reaches S3. It replaces the previous
# 403/404 → `/index.html` error pages, which CloudFront applies to every
# behaviour and would have turned the API's own 403/404 answers into HTML 200s.

resource "aws_cloudfront_function" "directory_index" {
  name    = "${var.name_prefix}-directory-index"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-JS
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      if (uri.endsWith('/')) {
        request.uri = uri + 'index.html';
      } else if (!uri.split('/').pop().includes('.')) {
        request.uri = uri + '/index.html';
      }
      return request;
    }
  JS
}

# Managed policies for the API behaviour: nothing cached, everything forwarded
# except the Host header (API Gateway needs its own).
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

# -----------------------------------------------------------------------------
# CloudFront Distribution
# -----------------------------------------------------------------------------

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Travel AI World Frontend — ${var.domain_name}"
  default_root_object = "index.html"
  price_class         = var.cloudfront_price_class
  aliases             = [var.domain_name, "www.${var.domain_name}"]

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "S3-${var.frontend_bucket_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # The API, behind the same domain: no CORS, one OAuth origin, a relative URL.
  origin {
    domain_name = local.api_gateway_host
    origin_id   = "APIGW-${var.name_prefix}"
    origin_path = local.api_gateway_path

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60 # per read; a streamed chat keeps sending tokens
      origin_keepalive_timeout = 60
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.frontend_bucket_name}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
    compress               = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.directory_index.arn
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "APIGW-${var.name_prefix}"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    viewer_protocol_policy   = "https-only"
    compress                 = false # SSE must reach the browser chunk by chunk
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = data.aws_acm_certificate.frontend.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-frontend"
    }
  )
}

# -----------------------------------------------------------------------------
# Route 53 Records — Alias a CloudFront
# -----------------------------------------------------------------------------

resource "aws_route53_record" "frontend_a" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "frontend_aaaa" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

# Registro www opcional
resource "aws_route53_record" "frontend_www" {
  count = var.create_www_record ? 1 : 0

  zone_id = data.aws_route53_zone.main.zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "frontend_bucket_name" {
  description = "Nombre del bucket S3 del frontend"
  value       = aws_s3_bucket.frontend.id
}

output "frontend_bucket_arn" {
  description = "ARN del bucket S3 del frontend"
  value       = aws_s3_bucket.frontend.arn
}

output "cloudfront_distribution_id" {
  description = "ID de la distribución CloudFront"
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_distribution_arn" {
  description = "ARN de la distribución CloudFront"
  value       = aws_cloudfront_distribution.frontend.arn
}

output "cloudfront_domain_name" {
  description = "Domain name de CloudFront (ej. d30ecrvgx9jgud.cloudfront.net)"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "frontend_url" {
  description = "URL pública del frontend"
  value       = "https://${var.domain_name}"
}
