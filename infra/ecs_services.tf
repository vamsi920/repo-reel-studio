resource "aws_ecs_task_definition" "agent" {
  family                   = "${local.name_prefix}-agent"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.agent_cpu
  memory                   = var.agent_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "agent"
      image     = "${aws_ecr_repository.agent.repository_url}:latest"
      essential = true
      portMappings = [{
        containerPort = var.agent_api_port
        hostPort      = var.agent_api_port
        protocol      = "tcp"
      }]
      environment = [
        { name = "AGENT_API_PORT", value = tostring(var.agent_api_port) },
        { name = "PROACTIVE_STORE_ROOT", value = "/data/proactive" },
        { name = "PROACTIVE_LOG_MODEL", value = "gemini-2.5-flash-lite" },
      ]
      secrets = local.agent_secret_refs
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.agent.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "agent"
        }
      }
      mountPoints = var.enable_efs ? [{
        sourceVolume  = "agent-data"
        containerPath = "/data"
        readOnly      = false
      }] : []
    }
  ])

  dynamic "volume" {
    for_each = var.enable_efs ? [1] : []
    content {
      name = "agent-data"
      efs_volume_configuration {
        file_system_id     = aws_efs_file_system.agent[0].id
        transit_encryption = "ENABLED"
        authorization_config {
          access_point_id = aws_efs_access_point.agent[0].id
          iam             = "ENABLED"
        }
      }
    }
  }

  tags = local.common_tags
}

resource "aws_ecs_task_definition" "node" {
  family                   = "${local.name_prefix}-node"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.node_cpu
  memory                   = var.node_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "node"
      image     = "${aws_ecr_repository.node.repository_url}:latest"
      essential = true
      portMappings = [{
        containerPort = var.node_container_port
        hostPort      = var.node_container_port
        protocol      = "tcp"
      }]
      environment = [
        { name = "PORT", value = tostring(var.node_container_port) },
        { name = "NODE_ENV", value = "production" },
        { name = "AGENT_RUNS_PROXY_URL", value = local.agent_proxy_url },
        { name = "CORS_ORIGINS", value = join(",", local.cors_origins) },
        { name = "INGEST_MAX_FILES", value = "120" },
        { name = "INGEST_MAX_TOTAL_BYTES", value = "6291456" },
        { name = "INGEST_MAX_FILE_BYTES", value = "524288" },
      ]
      secrets = local.node_secret_refs
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.node.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "node"
        }
      }
    }
  ])

  tags = local.common_tags
}

resource "aws_ecs_service" "agent" {
  name            = "${local.name_prefix}-agent"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.agent.arn
  desired_count   = var.agent_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.agent.id]
    assign_public_ip = true
  }

  service_registries {
    registry_arn = aws_service_discovery_service.agent.arn
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  tags = local.common_tags

  lifecycle {
    ignore_changes = [task_definition]
  }
}

resource "aws_ecs_service" "node" {
  name            = "${local.name_prefix}-node"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.node.arn
  desired_count   = var.node_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.node.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.node.arn
    container_name   = "node"
    container_port   = var.node_container_port
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  depends_on = [aws_lb_listener.http_forward, aws_lb_listener.http_redirect, aws_lb_listener.https, aws_ecs_service.agent]

  tags = local.common_tags

  lifecycle {
    ignore_changes = [task_definition]
  }
}
