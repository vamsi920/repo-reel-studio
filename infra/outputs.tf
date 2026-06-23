output "aws_region" {
  value = var.aws_region
}

output "ecr_node_repository_url" {
  value = aws_ecr_repository.node.repository_url
}

output "ecr_agent_repository_url" {
  value = aws_ecr_repository.agent.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_node_service_name" {
  value = aws_ecs_service.node.name
}

output "ecs_agent_service_name" {
  value = aws_ecs_service.agent.name
}

output "alb_dns_name" {
  value = aws_lb.api.dns_name
}

output "api_url" {
  value = var.domain_name != "" ? "https://${var.api_subdomain}.${var.domain_name}" : "https://${aws_cloudfront_distribution.app.domain_name}"
}

output "frontend_bucket_name" {
  value = aws_s3_bucket.frontend.id
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.app.id
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.app.domain_name
}

output "app_url" {
  value = var.domain_name != "" ? "https://${var.app_subdomain}.${var.domain_name}" : "https://${aws_cloudfront_distribution.app.domain_name}"
}

output "cors_origins_effective" {
  value = local.cors_origins
}

output "agent_runs_proxy_url" {
  value = local.agent_proxy_url
}

output "ssm_parameter_names" {
  value = [for p in aws_ssm_parameter.secrets : p.name]
}

output "github_actions_secrets_hint" {
  value = <<-EOT
    Set these GitHub repository secrets for deploy-aws.yml:
    AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION=${var.aws_region}
    ECR_NODE_REPOSITORY=${aws_ecr_repository.node.repository_url}
    ECR_AGENT_REPOSITORY=${aws_ecr_repository.agent.repository_url}
    ECS_CLUSTER=${aws_ecs_cluster.main.name}
    ECS_NODE_SERVICE=${aws_ecs_service.node.name}
    ECS_AGENT_SERVICE=${aws_ecs_service.agent.name}
    S3_FRONTEND_BUCKET=${aws_s3_bucket.frontend.id}
    CLOUDFRONT_DISTRIBUTION_ID=${aws_cloudfront_distribution.app.id}
    VITE_API_URL=${var.domain_name != "" ? "https://${var.api_subdomain}.${var.domain_name}" : "https://${aws_cloudfront_distribution.app.domain_name}"}
  EOT
}
