terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# CloudFront ACM certificates must live in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  name_prefix = "${var.project_name}-${var.environment}"

  agent_service_dns = "agent-api.${var.service_discovery_namespace}"
  agent_proxy_url   = "http://${local.agent_service_dns}:${var.agent_api_port}"

  cors_origins = compact(concat(
    var.cors_origins,
    var.domain_name != "" ? [
      "https://${var.app_subdomain}.${var.domain_name}",
      "https://${var.domain_name}",
    ] : [],
    var.cloudfront_url != "" ? [var.cloudfront_url] : [],
  ))

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
