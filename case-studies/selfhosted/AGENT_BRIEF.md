# Brief for agents running a study in round 2 (DeepSeek V4 Flash)

- Model: `deepseek-ai/DeepSeek-V4-Flash-0731` served by vLLM on 2x H200 (pod `4irt4imcc8pm0m`),
  served name `deepseek-v4-flash`. Tool calling and the deepseek_v4 reasoning parser are on.
- **Always call it through the local metering gateway**, never the pod URL:
  `http://127.0.0.1:18800/<tag>/v1` (OpenAI-compatible; any api key string works, e.g. `gateway`;
  model name `deepseek-v4-flash`, or `openai/deepseek-v4-flash` for litellm / the OpenHands SDK).
  - `<tag>` is `<study>` or `<study>__<run id>`, e.g. `kt__ky`, `automations__A3`.
  - Study settings are in `harness/studies.json` (temperature 1.0; top_p 0.95 agentic / 1.0 KT;
    non-thinking). Do not send your own sampling overrides unless the study needs them.
  - The gateway logs every call to `data/gateway/calls.jsonl` and waits out pod restarts itself.
  - Per-run tags are what let the write-up attribute tokens and time to each task, so use one
    tag per task / scenario / repo.
- Cost model: the GPUs cost $10.58/h flat, with no per-token price. Record wall-clock start/end
  (epoch seconds) for every task you run.
- Round 1 used Qwen3-Coder-Next. Its scripts are in
  `/private/tmp/claude-501/-Users-vamsi-Desktop-neodevex-repo-reel-studio/5349578c-0629-4c1e-9576-1e147dc9d821/scratchpad/`
  (KT: `kt_qwen_launch.py`, `start-kt-qwen.sh`, `run-answers.sh`, `dwvenv/`; tokens: `qwen_token_bench.py`).
  Its results files are the template for this round's: `kt/.work/qwen3-results.json`,
  `automations/.work/qwen3-results.json`.
- Other Claude sessions work in this repo. Never touch their processes or files. Never kill
  processes by a broad name pattern (`pkill -f run_chat` killed another session's runs in round 1);
  kill only PIDs you started.
- Never print or write API keys into the repo. Do not commit, push or deploy.
- Record everything: failure modes with concrete examples, tool-name errors, loops, refusals,
  anything a reader would need to judge the numbers.
