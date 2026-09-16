# Frontend — S3 + CloudFront + ACM + Route 53
# The first deployment was done by hand (docs/runbooks/frontend-https-aws.md);
# the zone and the certificate were imported into the state afterwards
# (ADR 0010). The registrar must point the domain at `name_servers`.

# -----------------------------------------------------------------------------
# Domain roots: the public hosted zone and the certificate CloudFront and the
# Cognito custom domain serve. Both are protected from `terraform destroy`:
# losing the zone changes the name servers and takes the whole domain down.
# -----------------------------------------------------------------------------

resource "aws_route53_zone" "main" {
  name = var.domain_name
  tags = var.tags

  lifecycle {
    prevent_destroy = true
  }
}

# CloudFront only accepts certificates from us-east-1, whatever the region of
# everything else. One certificate covers the apex and every subdomain
# (`auth.<domain>` for Cognito among them).
resource "aws_acm_certificate" "frontend" {
  provider = aws.us_east_1

  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method         = "DNS"
  tags                      = var.tags

  lifecycle {
    create_before_destroy = true
    prevent_destroy       = true
  }
}

# ACM proves ownership through one CNAME per name; the apex and the wildcard
# share the same record, hence `allow_overwrite`. Keys are the names (known at
# plan time), not the record names (known only once the certificate exists).
resource "aws_route53_record" "certificate_validation" {
  for_each = {
    for option in aws_acm_certificate.frontend.domain_validation_options :
    option.domain_name => {
      name   = option.resource_record_name
      type   = option.resource_record_type
      record = option.resource_record_value
    }
  }

  zone_id         = aws_route53_zone.main.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 300
  records         = [each.value.record]
  allow_overwrite = true
}

# Waits for issuance; consumers take the ARN from here so a fresh apply does
# not hand CloudFront or Cognito a certificate that is still pending.
resource "aws_acm_certificate_validation" "frontend" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.frontend.arn
  validation_record_fqdns = [for record in aws_route53_record.certificate_validation : record.fqdn]
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

# The static export: cache by URL, compress, ignore query strings and cookies.
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
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
    cache_policy_id  = data.aws_cloudfront_cache_policy.caching_optimized.id

    viewer_protocol_policy = "redirect-to-https"
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

  # A missing key in the private bucket answers 403 (CloudFront may not list
  # it), so 403 alone is enough to show the export's not-found page with a
  # real 404. Error responses apply to every behaviour: mapping 404 as well
  # would replace the API's JSON 404s (a trip that does not exist). An API 403
  # becomes this 404 too, which the frontend already reads as "not found"
  # (`services/trips.ts`). No error caching: `/api/*` is not cached per user,
  # so a cached 403 for one caller would be served to the next.
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.frontend.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  # The WAF web ACL attached from the console (#83) is managed there, not here:
  # it is a cost item on its own (AWS WAF pricing) that the budget of ADR 0009
  # does not include, so attaching or removing it stays a deliberate decision.
  lifecycle {
    ignore_changes = [web_acl_id]
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
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "frontend_aaaa" {
  zone_id = aws_route53_zone.main.zone_id
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

  zone_id = aws_route53_zone.main.zone_id
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

output "name_servers" {
  description = "Name servers of the hosted zone: what the registrar must delegate the domain to."
  value       = aws_route53_zone.main.name_servers
}

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
