"""Serving capacity of the self-hosted model, measured with real agent prompts.

    VLLM_UPSTREAM=https://<pod>-8000.proxy.runpod.net/v1 VLLM_API_KEY=... \
      python loadtest.py first_turn.json out.json

first_turn.json is a real first request of the NeoDevEx agent (system prompt,
tool schemas, a user task; ~12k tokens), dumped by dump_first_turn.py.

Phases:
1. concurrency sweep: 1, 2, 4, 8, 16, 32 parallel streams, each sending the
   agent prompt with a unique suffix (the shared prefix can hit vLLM's prefix
   cache, as real agent calls do) and generating exactly OUT tokens
   (min_tokens = max_tokens). Per level: time to first token (p50/p95), decode
   tokens/s per stream, aggregate output tokens/s, requests/min.
2. cold prefill: the same at concurrency 1 with a random prefix so nothing is
   cached, giving uncached prefill tokens/s.
3. long context: 32k, 64k and 128k-token prompts built from real repository
   source, concurrency 1, to measure prefill speed at the sizes long agent runs reach.

Everything goes straight to vLLM (not through the gateway) so the numbers are the
server's, plus the Runpod proxy's network hop, which every real call also pays.
"""
import asyncio
import json
import os
import random
import statistics
import string
import sys
import time
from pathlib import Path

import aiohttp

UP = os.environ["VLLM_UPSTREAM"].rstrip("/")
KEY = os.environ["VLLM_API_KEY"]
MODEL = os.environ.get("SERVED_MODEL", "deepseek-v4-flash")
OUT = int(os.environ.get("LOADTEST_OUT_TOKENS", "512"))
LEVELS = [int(x) for x in os.environ.get("LOADTEST_LEVELS", "1,2,4,8,16,32").split(",")]
SRC = Path("/private/tmp/claude-501/-Users-vamsi-Desktop-neodevex-repo-reel-studio/7e2ad96c-f0d8-4425-92cc-f30093517a99/scratchpad/chat-bench/templates")


def pct(xs, p):
    xs = sorted(x for x in xs if x is not None)
    if not xs:
        return None
    k = max(0, min(len(xs) - 1, round(p / 100 * (len(xs) - 1))))
    return round(xs[k], 3)


async def one(session, messages, tools, out_tokens):
    body = {"model": MODEL, "messages": messages, "max_tokens": out_tokens, "min_tokens": out_tokens,
            "temperature": 1.0, "top_p": 0.95, "stream": True, "stream_options": {"include_usage": True},
            "ignore_eos": True}
    if tools:
        body["tools"] = tools
    t0 = time.time()
    ttft, usage = None, {}
    async with session.post(f"{UP}/chat/completions", json=body, headers={"Authorization": f"Bearer {KEY}"}) as r:
        if r.status != 200:
            return {"error": f"HTTP {r.status}: {(await r.text())[:200]}"}
        buf = b""
        async for raw in r.content:
            buf += raw
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                line = line.strip()
                if not line.startswith(b"data:") or line[5:].strip() == b"[DONE]":
                    continue
                ev = json.loads(line[5:])
                if ev.get("usage"):
                    usage = ev["usage"]
                for ch in ev.get("choices") or []:
                    d = ch.get("delta") or {}
                    if ttft is None and (d.get("content") or d.get("reasoning_content") or d.get("reasoning") or d.get("tool_calls")):
                        ttft = time.time() - t0
    total = time.time() - t0
    comp = usage.get("completion_tokens") or 0
    return {"ttft": ttft, "total": total, "prompt_tokens": usage.get("prompt_tokens"),
            "cached_tokens": (usage.get("prompt_tokens_details") or {}).get("cached_tokens"),
            "completion_tokens": comp,
            "decode_tps": comp / (total - ttft) if ttft and total > ttft and comp else None}


def with_suffix(messages, cold=False):
    tag = "".join(random.choices(string.ascii_lowercase, k=12))
    msgs = json.loads(json.dumps(messages))
    if cold:  # unique text at the very start defeats the prefix cache
        msgs[0]["content"] = f"[run {tag}]\n" + (msgs[0]["content"] if isinstance(msgs[0]["content"], str) else json.dumps(msgs[0]["content"]))
    else:
        last = msgs[-1]
        last["content"] = (last["content"] if isinstance(last["content"], str) else json.dumps(last["content"])) + f"\n(ref {tag})"
    return msgs


async def level(session, messages, tools, n, cold=False, rounds=2):
    results = []
    t0 = time.time()
    for _ in range(rounds):
        results += await asyncio.gather(*[one(session, with_suffix(messages, cold), tools, OUT) for _ in range(n)])
    wall = time.time() - t0
    ok = [r for r in results if "error" not in r]
    out_tok = sum(r["completion_tokens"] for r in ok)
    return {"concurrency": n, "cold": cold, "requests": len(results), "errors": len(results) - len(ok),
            "error_sample": next((r["error"] for r in results if "error" in r), None),
            "prompt_tokens": ok[0]["prompt_tokens"] if ok else None,
            "cached_tokens_p50": pct([r["cached_tokens"] for r in ok], 50),
            "ttft_p50": pct([r["ttft"] for r in ok], 50), "ttft_p95": pct([r["ttft"] for r in ok], 95),
            "decode_tps_p50": pct([r["decode_tps"] for r in ok], 50),
            "latency_p50": pct([r["total"] for r in ok], 50),
            "aggregate_output_tps": round(out_tok / wall, 1), "wall_seconds": round(wall, 1),
            "requests_per_min": round(len(ok) / wall * 60, 1)}


def long_prompt(target_tokens):
    files = sorted(p for p in SRC.rglob("*") if p.suffix in {".py", ".ts"} and "node_modules" not in p.parts and ".venv" not in p.parts)
    text, chars = [], 0
    for f in files:
        try:
            t = f.read_text()
        except Exception:  # noqa: BLE001
            continue
        text.append(f"### {f.relative_to(SRC)}\n{t}")
        chars += len(t)
        if chars > target_tokens * 3.6:
            break
    body = "\n".join(text)[: int(target_tokens * 3.6)]
    tag = "".join(random.choices(string.ascii_lowercase, k=12))
    return [{"role": "user", "content": f"[{tag}] Summarise what this code does in 3 bullet points.\n\n{body}"}]


async def main():
    first = json.load(open(sys.argv[1]))
    messages, tools = first["messages"], first.get("tools")
    res = {"model": MODEL, "out_tokens": OUT, "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "sweep": [], "long": []}
    timeout = aiohttp.ClientTimeout(total=3600)
    async with aiohttp.ClientSession(timeout=timeout) as s:
        await one(s, with_suffix(messages), tools, 16)  # warm-up, also primes the prefix cache
        for n in LEVELS:
            r = await level(s, messages, tools, n, rounds=2 if n <= 8 else 1)
            res["sweep"].append(r); print(json.dumps(r), flush=True)
        r = await level(s, messages, tools, 1, cold=True, rounds=3)
        res["cold_prefill"] = r; print(json.dumps(r), flush=True)
        for t in (32000, 64000, 128000):
            rr = await one(s, long_prompt(t), None, 256)
            rr["target_tokens"] = t
            if rr.get("ttft") and rr.get("prompt_tokens"):
                rr["prefill_tps"] = round(rr["prompt_tokens"] / rr["ttft"], 1)
            res["long"].append(rr); print(json.dumps(rr), flush=True)
    res["finished"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    json.dump(res, open(sys.argv[2], "w"), indent=1)


if __name__ == "__main__":
    asyncio.run(main())
