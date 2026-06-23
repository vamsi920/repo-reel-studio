# AWS deploy (simple — IAM user, one script)

No root account. No `aws login`. Use an **IAM user** with access keys.

## What gets deployed

| Piece | AWS service |
|-------|-------------|
| React app | S3 + CloudFront |
| Ingestion API | ECS Fargate + ALB |
| Agent Ops API | ECS Fargate (internal) |
| Secrets | SSM Parameter Store |

Without a custom domain, **app and API share one CloudFront URL** (`/api/*` → ALB). No mixed-content issues.

---

## Step 1 — IAM user (your admin does this once)

1. AWS Console → **IAM** → Users → **Create user**
2. Attach policy from [`infra/iam-deploy-policy.json`](../infra/iam-deploy-policy.json)  
   (or attach `AdministratorAccess` for a personal sandbox only)
3. **Security credentials** → **Create access key** → Application running outside AWS
4. Send you: **Access key ID** + **Secret access key**

---

## Step 2 — Your machine (one time)

```bash
# Tools
brew install awscli terraform docker colima
colima start -f

# IAM credentials (paste keys when prompted)
aws configure
# Region: us-east-1
# Output: json

# Verify — should show your IAM user ARN, NOT root
aws sts get-caller-identity
```

---

## Step 3 — Deploy (one command)

```bash
cd /path/to/repo-reel-studio

export VITE_GEMINI_API_KEY=your_gemini_key
export GITHUB_TOKEN=ghp_xxx          # optional: private repos + agent ops

chmod +x scripts/deploy-aws.sh scripts/set-aws-secrets.sh scripts/smoke-aws.sh
./scripts/deploy-aws.sh
```

First run takes **~15–20 min** (Terraform + Docker + ECS).

Output:

```
App + API:  https://d1234abcd.cloudfront.net
API health: https://d1234abcd.cloudfront.net/api/health
```

---

## Step 4 — Smoke test

```bash
./scripts/smoke-aws.sh https://d1234abcd.cloudfront.net
```

Open the CloudFront URL in a browser → paste a public GitHub repo → Processing → Studio.

---

## Re-deploy after code changes

```bash
./scripts/deploy-aws.sh --skip-infra
```

Skips Terraform; rebuilds images + frontend only.

---

## Secrets only (no full deploy)

```bash
export GITHUB_TOKEN=ghp_...
export GEMINI_API_KEY=...
export GOOGLE_TTS_API_KEY=...
./scripts/set-aws-secrets.sh
./scripts/deploy-aws.sh --skip-infra
```

---

## Optional: custom domain later

Edit `infra/terraform.tfvars`:

```hcl
domain_name     = "yourdomain.com"
route53_zone_id = "Z0123456789ABC"
```

Then `./scripts/deploy-aws.sh` again.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Unable to locate credentials` | Run `aws configure` with IAM keys |
| `AccessDenied` on terraform | Admin must attach `iam-deploy-policy.json` |
| `Docker not running` | `colima start -f` |
| ECS tasks not healthy | Push images first; check CloudWatch logs `/ecs/gitflick-prod-*` |
| Blank app / CORS | Use CloudFront URL only (not raw ALB URL) |

---

## Cost

~$50–90/month idle (ALB + 2 Fargate tasks + EFS + CloudFront).

## Destroy everything

```bash
cd infra && terraform destroy
```
