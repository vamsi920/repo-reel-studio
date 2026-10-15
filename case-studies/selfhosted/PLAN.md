# Self-hosted model study, round 2: DeepSeek V4 Flash on 3x H200

Round 1 (2026-10-13) ran the case studies on Qwen3-Coder-Next (80B / 3B active) on one RTX PRO 6000;
results are on the case-studies site at /selfhosted/. Round 2 repeats every study on a much
stronger open-weight model and measures speed, quality and cost in more detail.

## Model and why

| | |
|---|---|
| Model | `deepseek-ai/DeepSeek-V4-Flash-0731` (official July 31 release), MIT licence |
| Size | 284B total, 13B active per token (MoE, 256 routed experts, 6 per token), 43 layers, 64 attention heads |
| Weights | FP4 experts + FP8 everything else, 167 GB on disk (includes the DSpark draft module, unused here) |
| Context | 1M native; served with 262,144 |
| Vendor scores | SWE-bench Verified 79.0, SWE-bench Pro 52.6, Terminal-Bench 2.1 82.7 (DeepSeek-reported, DeepSeek harness, max reasoning) |
| Chosen over | GLM-5.2 (needs 8x H200, no stock), MiniMax M3 (licence unclear), Kimi K3 / Qwen3.8-Max / DeepSeek V4 Pro (1.6-2.8T, need 8x B200+) |

## Hardware and serving

- 3x H200 SXM (141 GB each), one node, Runpod Community Cloud, $3.59/GPU/h = **$10.77/h**.
  The user asked for exactly three GPUs.
- vLLM `v0.30.0-cu129`. Layout: data-parallel attention on all three GPUs plus expert parallelism
  across them (`--data-parallel-size 3 --enable-expert-parallel`, experts split 85/85/86).
  - TP=3 is impossible (64 heads are not divisible by 3).
  - vLLM has no pipeline parallelism for this model (vllm#52761).
  - DSpark speculative decoding is off: it fails to start on sm90 in vLLM 0.27+ (vllm#52065) and
    has a DP sync bug (vllm#61806). Decode speed is therefore without speculation.
- Known model issues to watch: repetition / garbled output (vllm#60771), reasoning missing on
  some multi-turn tool-calling turns (vllm#51651).
- Parsers: `--tokenizer-mode deepseek_v4 --tool-call-parser deepseek_v4 --enable-auto-tool-choice
  --reasoning-parser deepseek_v4`; fp8 KV cache, block size 256, prompt-token details on (cached tokens).
- Sampling (model card): temperature 1.0, top_p 0.95 for agent work, top_p 1.0 for KT docs.
- The pod stops itself 4 h after each start (hard cap), and is stopped as soon as the research is done.
  See `harness/boot.sh`.

## Measurement plumbing

- `harness/gateway.py`: every model call from every study goes through one local gateway, tagged
  `<study>__<task>-r<rep>`. Logs per call: prompt / cached / completion tokens, reasoning size,
  time to first token, total time, decode tokens/s, finish reason, tool calls and names, retries.
  It streams upstream (the Runpod proxy cuts responses silent for ~100 s) and waits out pod restarts.
- `harness/sampler.py`: vLLM /metrics every 15 s (requests running/waiting, KV-cache use, token
  counters, prefix-cache hits, preemptions).
- Pod lifecycle times (create, image pull, weight download, model load, first token, stop) from the
  pod logs, and the Runpod bill per hour.

## Scenarios

| # | Scenario | What | Runs | Graded by |
|---|---|---|---|---|
| S0 | Bring-up | image pull, 167 GB download, load time, GPU memory, what config started | 1 | pod logs |
| S1 | Serving capacity | real 12k-token agent prompt at 1/2/4/8/16/32 concurrent streams; cold prefill; 32k/64k/128k prompts | 1 sweep | `harness/loadtest.py` |
| S2 | Chat agent, no thinking | 6 tasks (explain + write tests on flask, hono, ky) | x3 | blind checklist judge (Gemini 2.5 Pro), mutation grading |
| S3 | Chat agent, thinking high | same 6 tasks with `reasoning_effort: high` | x3 | same |
| S4 | Token benchmark | 5 agent tasks on the automation-bench fixture with the app's settings | x3 | the bench's own checks + manual audit |
| S5 | KT docs | 3 wikis (ky, flask, hono) + 75 repository Q&A, same graders as the published study | 1 | blind graders, citation checks |
| S6 | Automations | 11 scheduled / event / webhook / chat-created automations on a real GitHub repo, isolated app stack | 1 | suite checks + GitHub artifacts |

## Metrics reported per scenario

- Quality: the study's own score (explain %, planted bugs caught, pass rate, Q&A accuracy, false
  claims, citations), plus failure modes with examples.
- Speed: wall time per task, model calls per task, time to first token, decode tokens/s,
  prefill tokens/s, queueing.
- Volume: prompt / cached / completion / reasoning tokens per task; lines of code written
  (test files, diffs of delivered PRs); doc words.
- Cost, three ways, per task, per 1M tokens and per 10,000 lines of code:
  1. our GPU, by the hour (as billed, and at full load from S1);
  2. the same model through a per-token API;
  3. Gemini 2.5 Flash and Gemini 4 Argon (our current default) from the original runs.
  Plus the break-even GPU utilization against each.
- Comparison with round 1 (Qwen3-Coder-Next) and with Devin where the original study has it.

## Run log

Kept in `RUNLOG.md` as the run happens (times in UTC).
