locals {
  ssm_secrets = {
    github_token          = "GITHUB_TOKEN"
    gemini_api_key        = "GEMINI_API_KEY"
    google_tts_api_key    = "GOOGLE_TTS_API_KEY"
    github_webhook_secret = "GITHUB_WEBHOOK_SECRET"
    proactive_cron_token  = "PROACTIVE_CRON_TOKEN"
  }
}

resource "aws_ssm_parameter" "secrets" {
  for_each = var.create_ssm_placeholders ? local.ssm_secrets : {}

  name  = "${var.ssm_parameter_prefix}/${each.key}"
  type  = "SecureString"
  value = "CHANGEME"

  tags = local.common_tags

  lifecycle {
    ignore_changes = [value]
  }
}

locals {
  agent_secret_refs = [
    for key, env_name in local.ssm_secrets : {
      name      = env_name
      valueFrom = aws_ssm_parameter.secrets[key].arn
    }
  ]

  node_secret_refs = [
    for key, env_name in local.ssm_secrets : {
      name      = env_name
      valueFrom = aws_ssm_parameter.secrets[key].arn
    } if contains(["github_token", "google_tts_api_key"], key)
  ]
}
