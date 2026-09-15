# Sign-in: an Amazon Cognito user pool with Google as the only identity
# provider (ADR 0009, TRA-119). The browser signs in through the pool's managed
# login (authorization code + PKCE, no client secret); Cognito does the OAuth
# exchange with Google; both backend services verify the pool's RS256 ID tokens
# offline against the JWKS exported below.
#
# Manual step in Google Cloud (the OAuth client stays there): add
#   https://<cognito domain>/oauth2/idpresponse   to "Authorised redirect URIs"
#   https://<cognito domain>                      to "Authorised JavaScript origins"
# The domain is the `cognito_domain` output.

resource "aws_cognito_user_pool" "main" {
  name = "${var.name_prefix}-users"

  # Nobody signs up with a password: accounts come from Google only.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  deletion_protection      = var.deletion_protection ? "ACTIVE" : "INACTIVE"

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  tags = var.tags
}

resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile"
  }

  # Claims the ID token will carry (core_api upserts the profile from them).
  attribute_mapping = {
    email    = "email"
    name     = "name"
    picture  = "picture"
    username = "sub"
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.name_prefix}-web"
  user_pool_id = aws_cognito_user_pool.main.id

  # A public client: the browser holds no secret; PKCE protects the code.
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = [aws_cognito_identity_provider.google.provider_name]
  callback_urls                        = local.cognito_callback_urls
  logout_urls                          = local.cognito_logout_urls
  explicit_auth_flows                  = ["ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors        = "ENABLED"

  # The ID token is the bearer the backend verifies; the refresh token keeps
  # the browser session alive without a new Google round trip.
  id_token_validity      = 60
  access_token_validity  = 60
  refresh_token_validity = 30
  token_validity_units {
    id_token      = "minutes"
    access_token  = "minutes"
    refresh_token = "days"
  }

  read_attributes = ["email", "email_verified", "name", "picture"]
}

# `admin` is the only role the application knows besides `user`; membership
# arrives in the ID token as `cognito:groups` (travel_common.cognito).
resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Application administrators (Principal.role = admin)."
}

# -----------------------------------------------------------------------------
# Managed login domain: the pool's default host now, a custom host later.
# -----------------------------------------------------------------------------

locals {
  use_custom_cognito_domain = var.cognito_custom_domain != ""
  cognito_domain            = local.use_custom_cognito_domain ? var.cognito_custom_domain : "${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com"

  cognito_callback_urls = concat(
    ["https://${var.domain_name}/auth/callback/"],
    [for origin in var.cognito_dev_origins : "${origin}/auth/callback/"],
  )
  cognito_logout_urls = concat(
    ["https://${var.domain_name}/"],
    [for origin in var.cognito_dev_origins : "${origin}/"],
  )
}

resource "aws_cognito_user_pool_domain" "main" {
  user_pool_id = aws_cognito_user_pool.main.id
  # Prefix domains are global: the account id keeps it unique. With a custom
  # domain, Cognito needs the us-east-1 certificate (the wildcard covers it)
  # and the parent domain must already resolve (it does: the frontend's A record).
  domain          = local.use_custom_cognito_domain ? var.cognito_custom_domain : "${var.name_prefix}-${data.aws_caller_identity.current.account_id}"
  certificate_arn = local.use_custom_cognito_domain ? aws_acm_certificate_validation.frontend.certificate_arn : null
  # Classic hosted UI (version 1). The browser is sent straight to Google
  # (`identity_provider=Google`), so nobody sees this page; the "managed
  # login" designer (version 2) needs `aws_cognito_managed_login_branding`,
  # which the 5.x provider does not have. Revisit with provider 6.
}

# The custom domain is served by a CloudFront distribution Cognito owns.
resource "aws_route53_record" "cognito" {
  count = local.use_custom_cognito_domain ? 1 : 0

  zone_id = aws_route53_zone.main.zone_id
  name    = var.cognito_custom_domain
  type    = "A"

  alias {
    name                   = aws_cognito_user_pool_domain.main.cloudfront_distribution
    zone_id                = aws_cognito_user_pool_domain.main.cloudfront_distribution_zone_id
    evaluate_target_health = false
  }
}

# -----------------------------------------------------------------------------
# What the services need: issuer, audience and the pool's public keys, read at
# plan time so no function fetches keys at runtime (ADR 0009).
# -----------------------------------------------------------------------------

locals {
  cognito_issuer = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
}

data "http" "cognito_jwks" {
  url = "${local.cognito_issuer}/.well-known/jwks.json"

  lifecycle {
    postcondition {
      condition     = self.status_code == 200
      error_message = "The user pool's JWKS could not be read."
    }
  }
}

# Environment for both backend services in Cognito mode (travel_common.config).
locals {
  cognito_backend_env = {
    AUTH_MODE         = "cognito"
    COGNITO_ISSUER    = local.cognito_issuer
    COGNITO_CLIENT_ID = aws_cognito_user_pool_client.web.id
    COGNITO_JWKS      = data.http.cognito_jwks.response_body
  }
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  description = "App client id: NEXT_PUBLIC_COGNITO_CLIENT_ID and COGNITO_CLIENT_ID."
  value       = aws_cognito_user_pool_client.web.id
}

output "cognito_domain" {
  description = "Managed login host: NEXT_PUBLIC_COGNITO_DOMAIN, and the Google OAuth client's redirect URI host."
  value       = local.cognito_domain
}

output "cognito_issuer" {
  description = "COGNITO_ISSUER for both services."
  value       = local.cognito_issuer
}

output "cognito_jwks" {
  description = "COGNITO_JWKS for both services (one JSON line)."
  value       = data.http.cognito_jwks.response_body
}
