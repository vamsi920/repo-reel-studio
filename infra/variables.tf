variable "project_name" {
  type        = string
  description = "Short project slug used in resource names."
  default     = "gitflick"
}

variable "environment" {
  type        = string
  description = "Deployment environment (e.g. prod, staging)."
  default     = "prod"
}

variable "aws_region" {
  type        = string
  description = "Primary AWS region for ECS, ALB, EFS, and regional ACM."
  default     = "us-east-1"
}

variable "domain_name" {
  type        = string
  description = "Root domain for app/api hostnames (e.g. example.com). Leave empty to use raw ALB + CloudFront URLs."
  default     = ""
}

variable "route53_zone_id" {
  type        = string
  description = "Existing Route 53 hosted zone ID for domain_name. Required when domain_name is set."
  default     = ""
}

variable "app_subdomain" {
  type        = string
  description = "Frontend hostname prefix."
  default     = "app"
}

variable "api_subdomain" {
  type        = string
  description = "API hostname prefix."
  default     = "api"
}

variable "cors_origins" {
  type        = list(string)
  description = "Extra browser origins allowed by the Node ingestion API (in addition to app domain when set)."
  default     = []
}

variable "cloudfront_url" {
  type        = string
  description = "Optional https://d123.cloudfront.net origin to allow before custom domain is wired."
  default     = ""
}

variable "service_discovery_namespace" {
  type        = string
  description = "Private DNS namespace for internal ECS service discovery."
  default     = "gitflick.local"
}

variable "node_container_port" {
  type    = number
  default = 8080
}

variable "agent_api_port" {
  type    = number
  default = 8788
}

variable "node_cpu" {
  type    = number
  default = 512
}

variable "node_memory" {
  type    = number
  default = 1024
}

variable "agent_cpu" {
  type    = number
  default = 512
}

variable "agent_memory" {
  type    = number
  default = 1024
}

variable "node_desired_count" {
  type    = number
  default = 1
}

variable "agent_desired_count" {
  type    = number
  default = 1
}

variable "enable_efs" {
  type        = bool
  description = "Mount EFS on the Python Agent Ops task for persistent state."
  default     = true
}

variable "ssm_parameter_prefix" {
  type        = string
  description = "Prefix for SSM Parameter Store secrets consumed by ECS tasks."
  default     = "/gitflick/prod"
}

variable "create_ssm_placeholders" {
  type        = bool
  description = "Create placeholder SecureString parameters (set real values in AWS Console/CLI before first deploy)."
  default     = true
}
