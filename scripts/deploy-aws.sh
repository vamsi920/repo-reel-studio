#!/usr/bin/env bash
# One-command AWS deploy (IAM user access keys — no root account).
#
# ONE-TIME SETUP (in your terminal):
#   1. Ask your AWS admin to create an IAM user and attach infra/iam-deploy-policy.json
#   2. aws configure
#        AWS Access Key ID:     <from admin>
#        AWS Secret Access Key: <from admin>
#        Default region:        us-east-1
#        Default output:        json
#   3. brew install awscli terraform docker colima   # if missing
#   4. colima start -f
#   5. export VITE_GEMINI_API_KEY=your_key
#   6. export GITHUB_TOKEN=ghp_...   # optional, for private repos + agent ops
#
# DEPLOY:
#   ./scripts/deploy-aws.sh
#
# Options:
#   --skip-infra   skip terraform (images + frontend only)
set -euo pipefail

SKIP_INFRA=0
[[ "${1:-}" == "--skip-infra" ]] && SKIP_INFRA=1

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

export PATH="/opt/homebrew/bin:$PATH"
export DOCKER_HOST="${DOCKER_HOST:-unix://${HOME}/.colima/default/docker.sock}"
AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_DEFAULT_REGION="$AWS_REGION"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1 — install with brew install $2"; exit 1; }
}

need aws awscli
need terraform terraform
need docker docker

if ! docker info >/dev/null 2>&1; then
  echo "Docker not running. Start with: colima start -f"
  exit 1
fi

echo "==> AWS identity (IAM user — not root)"
if ! aws sts get-caller-identity; then
  echo ""
  echo "Not logged in. Run:  aws configure"
  echo "Use IAM user Access Key + Secret from your admin (not root, not aws login)."
  exit 1
fi

if [[ "$SKIP_INFRA" -eq 0 ]]; then
  echo "==> Terraform (creates ECS, ALB, S3, CloudFront, ECR, EFS)..."
  terraform -chdir=infra init -input=false
  terraform -chdir=infra apply -auto-approve -input=false

  if [[ -n "${GITHUB_TOKEN:-}" || -n "${GEMINI_API_KEY:-}" || -n "${VITE_GEMINI_API_KEY:-}" ]]; then
  echo "==> SSM secrets..."
  ./scripts/set-aws-secrets.sh
  fi
fi

NODE_REPO="$(terraform -chdir=infra output -raw ecr_node_repository_url)"
AGENT_REPO="$(terraform -chdir=infra output -raw ecr_agent_repository_url)"
CLUSTER="$(terraform -chdir=infra output -raw ecs_cluster_name)"
NODE_SVC="$(terraform -chdir=infra output -raw ecs_node_service_name)"
AGENT_SVC="$(terraform -chdir=infra output -raw ecs_agent_service_name)"
BUCKET="$(terraform -chdir=infra output -raw frontend_bucket_name)"
CF_ID="$(terraform -chdir=infra output -raw cloudfront_distribution_id)"
API_URL="$(terraform -chdir=infra output -raw api_url)"
APP_URL="$(terraform -chdir=infra output -raw app_url)"

REGISTRY="${NODE_REPO%%/*}"
echo "==> Docker login ECR..."
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"

echo "==> Build + push backends..."
docker build -f Dockerfile -t "$NODE_REPO:latest" .
docker push "$NODE_REPO:latest"
docker build -f Dockerfile.agent -t "$AGENT_REPO:latest" .
docker push "$AGENT_REPO:latest"

echo "==> ECS redeploy..."
aws ecs update-service --cluster "$CLUSTER" --service "$AGENT_SVC" --force-new-deployment --region "$AWS_REGION" >/dev/null
aws ecs update-service --cluster "$CLUSTER" --service "$NODE_SVC" --force-new-deployment --region "$AWS_REGION" >/dev/null
echo "    waiting for services (2–5 min)..."
aws ecs wait services-stable --cluster "$CLUSTER" --services "$AGENT_SVC" "$NODE_SVC" --region "$AWS_REGION"

echo "==> Frontend build..."
export VITE_API_URL="$API_URL"
export VITE_GEMINI_MODEL="${VITE_GEMINI_MODEL:-gemini-2.5-flash}"
[[ -z "${VITE_GEMINI_API_KEY:-}" ]] && echo "WARN: set VITE_GEMINI_API_KEY for video generation"
npm ci --silent
npm run build

echo "==> Upload to S3 + invalidate CloudFront..."
aws s3 sync dist/ "s3://${BUCKET}/" --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "*.html"
aws s3 sync dist/ "s3://${BUCKET}/" --delete \
  --cache-control "public,max-age=0,must-revalidate" \
  --include "*.html" --exclude "*"
aws cloudfront create-invalidation --distribution-id "$CF_ID" --paths "/*" >/dev/null

echo ""
echo "============================================"
echo " LIVE"
echo "   App + API:  $APP_URL"
echo "   API health: $API_URL/api/health"
echo "============================================"
echo "Smoke:  ./scripts/smoke-aws.sh $API_URL"
