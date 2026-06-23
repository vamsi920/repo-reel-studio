data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "${local.name_prefix}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "ecs_execution_ssm" {
  statement {
    sid    = "ReadSsmParameters"
    effect = "Allow"
    actions = [
      "ssm:GetParameters",
      "ssm:GetParameter",
    ]
    resources = [
      "arn:aws:ssm:${var.aws_region}:${local.account_id}:parameter${var.ssm_parameter_prefix}/*",
    ]
  }
}

resource "aws_iam_policy" "ecs_execution_ssm" {
  name   = "${local.name_prefix}-ecs-execution-ssm"
  policy = data.aws_iam_policy_document.ecs_execution_ssm.json
  tags   = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ecs_execution_ssm" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = aws_iam_policy.ecs_execution_ssm.arn
}

resource "aws_iam_role" "ecs_task" {
  name               = "${local.name_prefix}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.common_tags
}

data "aws_iam_policy_document" "ecs_task_efs" {
  count = var.enable_efs ? 1 : 0

  statement {
    sid    = "EfsAccess"
    effect = "Allow"
    actions = [
      "elasticfilesystem:ClientMount",
      "elasticfilesystem:ClientWrite",
      "elasticfilesystem:DescribeMountTargets",
    ]
    resources = [aws_efs_file_system.agent[0].arn]
  }
}

resource "aws_iam_policy" "ecs_task_efs" {
  count  = var.enable_efs ? 1 : 0
  name   = "${local.name_prefix}-ecs-task-efs"
  policy = data.aws_iam_policy_document.ecs_task_efs[0].json
  tags   = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ecs_task_efs" {
  count      = var.enable_efs ? 1 : 0
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.ecs_task_efs[0].arn
}
