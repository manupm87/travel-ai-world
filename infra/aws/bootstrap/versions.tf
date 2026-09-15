# Bootstrap root: the few resources that must exist BEFORE the main root can
# use its S3 backend and CI can assume a role. Applied once, by hand, with
# local state (ignored by git). See README.md in this folder.
terraform {
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}
