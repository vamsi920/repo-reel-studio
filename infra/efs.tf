resource "aws_efs_file_system" "agent" {
  count          = var.enable_efs ? 1 : 0
  creation_token = "${local.name_prefix}-agent"
  encrypted      = true

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-agent-efs" })
}

resource "aws_efs_mount_target" "agent" {
  for_each        = var.enable_efs ? toset(data.aws_subnets.default.ids) : toset([])
  file_system_id  = aws_efs_file_system.agent[0].id
  subnet_id       = each.value
  security_groups = [aws_security_group.efs[0].id]
}

resource "aws_efs_access_point" "agent" {
  count          = var.enable_efs ? 1 : 0
  file_system_id = aws_efs_file_system.agent[0].id

  posix_user {
    gid = 0
    uid = 0
  }

  root_directory {
    path = "/agent-data"
    creation_info {
      owner_gid   = 0
      owner_uid   = 0
      permissions = "0777"
    }
  }

  tags = local.common_tags
}
