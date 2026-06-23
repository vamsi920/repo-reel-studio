resource "aws_cloudwatch_log_group" "node" {
  name              = "/ecs/${local.name_prefix}-node"
  retention_in_days = 14
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "agent" {
  name              = "/ecs/${local.name_prefix}-agent"
  retention_in_days = 14
  tags              = local.common_tags
}

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = local.common_tags
}

resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = var.service_discovery_namespace
  description = "Internal DNS for GitFlick ECS services"
  vpc         = data.aws_vpc.default.id

  tags = local.common_tags
}

resource "aws_service_discovery_service" "agent" {
  name = "agent-api"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }

  tags = local.common_tags
}
