# NeoDevEx AWS infrastructure (Terraform)

Provisions:

- ECR repositories for Node ingestion and Python Agent Ops images
- ECS Fargate cluster with two services (Node behind ALB, Agent internal via Cloud Map)
- EFS volume for persistent Agent Ops state
- S3 + CloudFront for the static Vite frontend
- Optional Route 53 + ACM for `app.` and `api.` subdomains
- SSM Parameter Store placeholders for secrets

## Prerequisites

- Terraform >= 1.5
- AWS CLI configured (`aws configure`)
- Docker images pushed to ECR before ECS services become healthy (see `docs/AWS_DEPLOYMENT.md`)

## Quick start

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — set domain_name, route53_zone_id, region

terraform init
terraform plan
terraform apply
```

After apply, set real values for SSM parameters (replace `CHANGEME`):

```bash
aws ssm put-parameter --name /neodevex/prod/github_token --type SecureString --value "ghp_..." --overwrite
aws ssm put-parameter --name /neodevex/prod/gemini_api_key --type SecureString --value "..." --overwrite
aws ssm put-parameter --name /neodevex/prod/google_tts_api_key --type SecureString --value "..." --overwrite
aws ssm put-parameter --name /neodevex/prod/github_webhook_secret --type SecureString --value "..." --overwrite
```

Push container images and deploy ECS services (or use GitHub Actions `deploy-aws.yml`).

## CORS

The Node ECS task receives `CORS_ORIGINS` built from:

- `var.cors_origins`
- `https://app.<domain>` when `domain_name` is set
- `var.cloudfront_url` when provided

Update `cloudfront_url` in tfvars after first apply if you deploy without a custom domain, then re-apply or set `CORS_ORIGINS` manually on the task definition.

## Destroy

```bash
terraform destroy
```

Empty the S3 frontend bucket first if `force_destroy` is insufficient for your account policy.
