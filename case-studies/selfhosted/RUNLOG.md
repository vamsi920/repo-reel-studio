# Run log, round 2 (DeepSeek V4 Flash, 3x H200)

Times are UTC.

- 2026-10-15 ~14:45: model chosen (DeepSeek V4 Flash 0731). 3x H200 Community had no stock; Secure
  had 3x in EUR-IS-4 at $15.87/h. User chose to wait for Community ($10.77/h).
- 2026-10-15 ~14:55: automation-bench `main` reset to 8ea8dd9 (removed the Qwen run's 2 commits).
  `automation-bench-missing` (created by the Qwen run) still exists: deleting it needs the
  `delete_repo` scope, pending the user.
- 2026-10-15 15:00-15:10: harness written and tested locally (gateway against a mock upstream:
  tool calls, reasoning, usage and study settings pass through in both stream modes).
- 2026-10-15 15:13: user switched to 2x H200 ("go ahead with 2x, don't stop till done"). Community had no
  2x stock; Secure 2x H200 at $10.58/h (below the approved $10.77/h). GitHub: stray repo deleted.
- 2026-10-15 15:15:49: pod `4irt4imcc8pm0m` created, 2x H200 SXM Secure, EUR-IS-4, host CUDA 13.2,
  image vllm/vllm-openai:v0.30.0-cu129, 250 GB volume, 6 h hard auto-stop.
- 2026-10-15 15:17: local gateway started on 127.0.0.1:18800.
- 2026-10-15 15:22-15:40: first pod's container started at 15:22:14 and the pod stopped itself at 15:40:21,
  i.e. all three serve attempts failed and the failure path stopped it after its 10-minute grace.
  Container logs are not retrievable after a stop, and the pod could not be restarted (its host's
  GPUs were taken). Fix: boot.sh now tees its log to /workspace/logs and serves that folder on
  port 8001 so errors can be read live; failure grace raised to 15 min. First pod terminated
  (~25 min billed, ~$4.4).
- 2026-10-15 15:49:24: second pod `s70qyxfibd4wr1`, 2x H200 SXM Secure, EUR-IS-4, host CUDA 12.8,
  ports 8000 (vLLM) + 8001 (logs). Gateway repointed.
- 2026-10-15 15:49:41-15:52:50: weights downloaded, 156 GB in 189 s (~0.83 GB/s).
- 2026-10-15 15:52:50-15:53:11: all three serve attempts died within ~6 s each with
  `RuntimeError: operator torchvision::nms does not exist`: the vllm/vllm-openai:v0.30.0-cu129 image
  ships a torchvision that does not match its torch. Almost certainly also what killed the first pod.
  Fix: boot.sh uninstalls torchvision when that import check fails (the model is text-only).
- 2026-10-15 15:54:20: pod restarted in place with the fix (weights cached on the volume).
- 2026-10-15 15:54:47: with torchvision gone, the next error showed the real cause: "PyTorch has CUDA
  version 13.0 whereas TorchAudio has CUDA version 12.9". The `-cu129` image carries a CUDA 13.0
  torch, and this host's driver (570, CUDA 12.8) cannot run CUDA 13 anyway. Pod terminated
  (~10 min billed). Next: plain `v0.30.0` image (CUDA 13.0) on a host with CUDA >= 13.0.
- 2026-10-15 15:57:55: third pod `4dheaef4lycxl8`, 2x H200 Secure, EUR-IS-4, host CUDA 12.8 (no CUDA 13
  host free), image `vllm/vllm-openai:v0.30.0` (CUDA 13.0) with VLLM_ENABLE_CUDA_COMPATIBILITY=1
  (NVIDIA forward-compatibility libs; the image declares driver 570 support). Gateway repointed.
- 2026-10-15 16:03: CUDA forward compatibility works (torch 2.13+cu130 sees both GPUs on driver 570),
  but NCCL init failed: "NCCL error: unhandled cuda error". Fix: NCCL_NVLS_ENABLE=0, NCCL_CUMEM_ENABLE=0.
- 2026-10-15 16:04-16:15: with the NCCL fix the model loaded (77.3 GiB per GPU in ~26 s, weights read in
  18 s; KV cache 1,495,404 tokens, 5.7x concurrency at 262k context), but the API server gave up at
  vLLM's default 600 s engine-ready timeout while the engine was still compiling / capturing graphs.
- 2026-10-15 16:25: restarted with VLLM_ENGINE_READY_TIMEOUT_S=3600 and VLLM_CACHE_ROOT on the volume
  (compiled kernels persist across restarts).
- 2026-10-15 16:44:09: endpoint READY. Smoke test OK (chat, tool call, 401 without key, thinking via gateway; ~111 tok/s decode single stream). Model reasons briefly by default; thinking=false disables it. 16:50 serving benchmark started (studies held).
- 2026-10-15 16:47: serving benchmark done (data/serving/loadtest.json); gateway hold released, all studies start.

## 2026-10-15, end of round 2

- 16:44Z model ready; 16:44-17:33Z study work (48.5 min, $8.55): serving sweep, tokens 15/15 runs, chat 14 of 36 runs (no thinking: F1x3, F2x3, H1x2, H2x1; thinking: F1x3, F2x2), automations 111 calls and KT 24 calls (neither finished).
- ~17:01Z a fan-out script (harness/fanout_chat.sh) read data/runs/pids.txt while appending to it and spawned hundreds of bench processes; the session then ended and all work stopped by 17:33Z. The pod idled until it was stopped by hand at ~18:12Z (39 min, ~$6.9 wasted). Bug: never read a file in the loop that appends to it.
- Grading: explain judge (chat/bench/judge.py, Gemini 2.5 Pro) on F1/H1. Mutation grading on F2/H2 with templates rebuilt at the pinned commits (flask via `uv sync --group tests`, run with PYTHONPATH=src so mutants in the copied source are what is imported; hono via npm install). Validated by re-grading Qwen r0 F2/H2: reproduced 2/3 and 2/3.
- Results: explain 96% (no thinking) / 100% (thinking, flask only); tests 17/18 bugs caught, 6/6 pass on real code; tokens 15/15 (T2 answers audited by hand).
- Billing: pods 4irt4imcc8pm0m $4.35, s70qyxfibd4wr1 $1.03, 4dheaef4lycxl8 ~$24 (RunPod showed $14.40 at 18:15Z, still posting). Pod 4dheaef4lycxl8 is stopped with a 250 GB volume (~$0.6/day while it is kept).
