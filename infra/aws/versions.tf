terraform {
  # 1.11+ for the S3 backend's native lockfile (no DynamoDB table).
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    # Reads the user pool's JWKS at plan time (cognito.tf).
    http = {
      source  = "hashicorp/http"
      version = "~> 3.4"
    }
  }

  # Partial configuration: the bucket (contains the account id) and the region
  # are passed at init time, locally from the bootstrap outputs and in CI from
  # the AWS_TF_STATE_BUCKET / AWS_REGION variables. See README.md.
  #   terraform init -backend-config="bucket=..." -backend-config="region=..."
  backend "s3" {
    key          = "aws/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region
}

# Provider para recursos en us-east-1 (requerido para ACM + CloudFront)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
