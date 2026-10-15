#!/bin/bash
# Pod boot for the DeepSeek V4 Flash round (2x H200, one node; 3x had no stock).
# Passed to the pod base64-encoded in BOOT_SCRIPT_B64 and run by the
# entrypoint `bash -c 'echo "$BOOT_SCRIPT_B64" | base64 -d > /tmp/boot.sh && exec bash /tmp/boot.sh'`.
#
# 1. Hard auto-stop: the pod stops itself AUTO_STOP_SECONDS after every start
#    (runpodctl, then GraphQL podStop, then REST), whatever is running.
# 2. Downloads the weights once to the persistent volume and logs how long it took.
# 3. Serves the model with vLLM: data-parallel attention on both GPUs + expert
#    parallelism across them (256 experts, 128 per GPU), the layout NVIDIA's H200
#    recipe uses (DP + EP, TP1). Fallbacks, tried in order and logged: TP2 + EP,
#    then DP2 + EP in eager mode. vLLM has no pipeline parallelism for this model
#    (vllm#52761). DSpark speculative decoding is off: it fails to start on sm90 in
#    vLLM 0.27+ (vllm#52065) and has a DP sync bug (vllm#61806).
MODEL_REPO="${MODEL_REPO:-deepseek-ai/DeepSeek-V4-Flash-0731}"
MODEL_DIR="/workspace/hf/DeepSeek-V4-Flash-0731"
AUTO_STOP_SECONDS="${AUTO_STOP_SECONDS:-21600}"
ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
# Keep a copy of everything on the volume: container logs vanish when the pod stops.
mkdir -p /workspace/logs
exec > >(tee -a "/workspace/logs/boot-$(date -u +%Y%m%dT%H%M%SZ).log") 2>&1
# Serve the log folder on port 8001 (exposed as 8001/http) so startup errors can be
# read over the Runpod proxy while vLLM is still down. Logs hold no secrets.
(cd /workspace/logs && python3 -m http.server 8001 >/dev/null 2>&1 &)

stop_pod() {
  echo "[auto-stop] $(ts) ${AUTO_STOP_SECONDS}s elapsed, stopping pod ${RUNPOD_POD_ID}"
  if command -v runpodctl >/dev/null 2>&1; then
    runpodctl pod stop "$RUNPOD_POD_ID" && return 0
    runpodctl stop pod "$RUNPOD_POD_ID" && return 0
  fi
  python3 - <<'PY' && return 0
import json, os, urllib.request
pod = os.environ["RUNPOD_POD_ID"]
headers = {"Content-Type": "application/json", "Authorization": "Bearer " + os.environ["RUNPOD_API_KEY"]}
q = {"query": 'mutation { podStop(input: {podId: "%s"}) { id desiredStatus } }' % pod}
req = urllib.request.Request("https://api.runpod.io/graphql", data=json.dumps(q).encode(), headers=headers)
body = urllib.request.urlopen(req, timeout=30).read().decode()
print("[auto-stop] graphql:", body)
if '"errors"' in body:
    raise SystemExit(1)
PY
  curl -fsS -X POST -H "Authorization: Bearer $RUNPOD_API_KEY" "https://rest.runpod.io/v1/pods/${RUNPOD_POD_ID}/stop"
}
(
  sleep "$AUTO_STOP_SECONDS"
  for attempt in 1 2 3 4 5; do stop_pod && exit 0; echo "[auto-stop] attempt $attempt failed"; sleep 60; done
) &
echo "[auto-stop] $(ts) pod will stop in ${AUTO_STOP_SECONDS}s"

nvidia-smi --query-gpu=index,name,memory.total,driver_version --format=csv,noheader | sed 's/^/[gpu] /'
echo "[boot] $(ts) vllm $(python3 -c 'import vllm; print(vllm.__version__)' 2>/dev/null)"
# The image is built for CUDA 13.0; on a host driver older than that it relies on NVIDIA's
# forward-compatibility libraries (VLLM_ENABLE_CUDA_COMPATIBILITY=1 in the pod env).
echo "[boot] $(ts) cuda check: $(python3 -c 'import vllm, torch; print("torch", torch.__version__, "cuda", torch.version.cuda, "available", torch.cuda.is_available(), "devices", torch.cuda.device_count())' 2>&1 | tail -1)"

export HF_HOME=/workspace/hf HF_XET_HIGH_PERFORMANCE=1 HF_HUB_DOWNLOAD_TIMEOUT=60
if [ ! -f "$MODEL_DIR/.complete" ]; then
  echo "[download] $(ts) start $MODEL_REPO"
  t0=$(date +%s)
  python3 - <<PY
from huggingface_hub import snapshot_download
snapshot_download("$MODEL_REPO", local_dir="$MODEL_DIR", max_workers=16)
PY
  rc=$?
  echo "[download] $(ts) done rc=$rc in $(( $(date +%s) - t0 ))s size=$(du -sh "$MODEL_DIR" | cut -f1)"
  [ $rc -eq 0 ] && touch "$MODEL_DIR/.complete"
else
  echo "[download] $(ts) cached at $MODEL_DIR"
fi

# Safety net: vllm/vllm-openai:v0.30.0-cu129 turned out to carry a CUDA 13.0 torch with
# CUDA 12.9 torchvision/torchaudio, so every serve attempt died at import. The pod now
# uses the plain v0.30.0 image (CUDA 13.0 throughout) on a host whose driver supports
# CUDA 13; if torchvision is still broken, remove it (the model is text-only).
if ! python3 -c "import torch, torchvision; torch.ops.torchvision.nms" >/dev/null 2>&1; then
  echo "[boot] $(ts) torchvision broken in this image; uninstalling it (text-only model)"
  pip uninstall -y torchvision 2>&1 | tail -1
fi

COMMON=(
  "$MODEL_DIR" --served-model-name deepseek-v4-flash
  --trust-remote-code --kv-cache-dtype fp8 --block-size 256
  --tokenizer-mode deepseek_v4 --tool-call-parser deepseek_v4 --enable-auto-tool-choice
  --reasoning-parser deepseek_v4
  --max-model-len "${MAX_MODEL_LEN:-262144}" --gpu-memory-utilization 0.90
  --enable-prompt-tokens-details
  --host 0.0.0.0 --port 8000
)
attempt() {
  echo "[serve] $(ts) attempt: $*"
  vllm serve "${COMMON[@]}" "$@"
  echo "[serve] $(ts) exited rc=$?"
}
attempt --data-parallel-size 2 --enable-expert-parallel --tensor-parallel-size 1
attempt --tensor-parallel-size 2 --enable-expert-parallel
attempt --data-parallel-size 2 --enable-expert-parallel --tensor-parallel-size 1 --enforce-eager
# Nothing serves: keep the logs readable for 10 minutes, then stop instead of
# billing idle GPUs until the hard cap.
echo "[serve] $(ts) all attempts failed; stopping the pod in 900s"
sleep 900
stop_pod
sleep infinity
