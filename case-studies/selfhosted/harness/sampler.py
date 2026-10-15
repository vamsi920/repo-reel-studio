"""Samples vLLM's Prometheus /metrics every INTERVAL seconds into JSONL, so the
write-up can show GPU-side load over the whole run: requests running/waiting,
KV-cache use, prompt/generation token counters (summed over the 3 data-parallel
engines), prefix-cache hits, preemptions.

    VLLM_UPSTREAM=https://<pod>-8000.proxy.runpod.net/v1 VLLM_API_KEY=... python sampler.py metrics.jsonl
"""
import json
import os
import re
import sys
import time
import urllib.request

BASE = os.environ["VLLM_UPSTREAM"].rstrip("/").removesuffix("/v1")
KEY = os.environ["VLLM_API_KEY"]
INTERVAL = int(os.environ.get("SAMPLER_INTERVAL", "15"))
WANT = {
    "vllm:num_requests_running": "running", "vllm:num_requests_waiting": "waiting",
    "vllm:kv_cache_usage_perc": "kv_usage", "vllm:gpu_cache_usage_perc": "kv_usage",
    "vllm:prompt_tokens_total": "prompt_tokens_total", "vllm:generation_tokens_total": "generation_tokens_total",
    "vllm:prefix_cache_hits_total": "prefix_hits_total", "vllm:prefix_cache_queries_total": "prefix_queries_total",
    "vllm:num_preemptions_total": "preemptions_total", "vllm:request_success_total": "requests_ok_total",
}
LINE = re.compile(r"^([a-zA-Z_:]+)(\{[^}]*\})?\s+([-0-9.eE+]+)$")

out = sys.argv[1]
while True:
    rec = {"ts": round(time.time(), 1)}
    try:
        req = urllib.request.Request(f"{BASE}/metrics", headers={"Authorization": f"Bearer {KEY}"})
        text = urllib.request.urlopen(req, timeout=20).read().decode()
        sums, kv = {}, []
        for line in text.splitlines():
            m = LINE.match(line)
            if not m or m.group(1) not in WANT:
                continue
            key, val = WANT[m.group(1)], float(m.group(3))
            if key == "kv_usage":
                kv.append(val)
            else:
                sums[key] = sums.get(key, 0) + val
        rec.update(sums)
        if kv:
            rec["kv_usage_max"] = round(max(kv), 4)
            rec["kv_usage_mean"] = round(sum(kv) / len(kv), 4)
    except Exception as e:  # noqa: BLE001
        rec["error"] = repr(e)[:160]
    with open(out, "a") as fh:
        fh.write(json.dumps(rec) + "\n")
    time.sleep(INTERVAL)
