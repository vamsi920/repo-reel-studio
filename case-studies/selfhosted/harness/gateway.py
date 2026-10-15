"""Metering gateway between every case-study harness and the self-hosted vLLM pod.

    VLLM_UPSTREAM=https://<pod>-8000.proxy.runpod.net/v1 VLLM_API_KEY=... \
    SERVED_MODEL=deepseek-v4-flash python gateway.py 18800 calls.jsonl studies.json

Each harness points its OpenAI-compatible base URL at
http://127.0.0.1:18800/<study>/v1, so every call is tagged with the study that
made it (chat-nothink, chat-think, tokens, kt, automations, loadtest, ...).

- Adds the bearer key; harnesses only ever see a dummy key.
- Applies the study's sampling settings from studies.json (temperature, top_p,
  chat_template_kwargs for thinking, default max_tokens), so the harnesses run
  unchanged and every study's settings are written down in one place.
- Always streams upstream with usage included: the Runpod HTTP proxy cuts a
  response that is silent for ~100 s (HTTP 524), and streaming also gives the
  time to first token. Content, reasoning and tool calls are reassembled and
  returned as one JSON (or as SSE when the client asked to stream).
- Waits out pod restarts (connection errors, 404/5xx, HTML "waiting" page):
  polls /models every 20 s for up to 30 min, then re-sends. Logged as waits,
  never as model failures.
- One JSON line per call: study, tokens (prompt, cached, completion,
  reasoning chars), time to first token, total seconds, decode tokens/s,
  finish reason, tool calls and names, retries, errors. No prompt text and no
  keys are logged.
"""
import asyncio
import json
import os
import sys
import time

import aiohttp
from aiohttp import web

UPSTREAM = os.environ["VLLM_UPSTREAM"].rstrip("/")
KEY = os.environ["VLLM_API_KEY"]
MODEL = os.environ.get("SERVED_MODEL", "deepseek-v4-flash")
LOG = None
STUDIES: dict = {}
STATE = {"phase": "unset", "hold": False}


def log(rec):
    with open(LOG, "a") as fh:
        fh.write(json.dumps(rec) + "\n")


async def upstream_ready(session):
    try:
        async with session.get(f"{UPSTREAM}/models", headers={"Authorization": f"Bearer {KEY}"},
                               timeout=aiohttp.ClientTimeout(total=20)) as r:
            return r.status == 200 and MODEL in await r.text()
    except Exception:  # noqa: BLE001
        return False


async def wait_for_pod(session):
    t0 = time.time()
    while time.time() - t0 < 1800:
        if await upstream_ready(session):
            return time.time() - t0
        await asyncio.sleep(20)
    raise RuntimeError("pod did not come back within 30 min")


def merge_tool_delta(calls: dict, tc: dict):
    i = tc.get("index", 0)
    cur = calls.setdefault(i, {"id": None, "type": "function", "function": {"name": "", "arguments": ""}})
    if tc.get("id"):
        cur["id"] = tc["id"]
    fn = tc.get("function") or {}
    if fn.get("name"):
        cur["function"]["name"] += fn["name"]
    if fn.get("arguments"):
        cur["function"]["arguments"] += fn["arguments"]


async def call_upstream(body: dict):
    """Returns (response_json, metrics)."""
    wait_total, restarts = 0.0, 0
    timeout = aiohttp.ClientTimeout(total=7200, sock_connect=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        for _ in range(10):
            t0 = time.time()
            ttft = None
            got = 0
            try:
                sbody = {**body, "stream": True, "stream_options": {"include_usage": True}}
                async with session.post(f"{UPSTREAM}/chat/completions", json=sbody,
                                        headers={"Authorization": f"Bearer {KEY}"}) as r:
                    if r.status == 200:
                        content, reasoning, calls = [], [], {}
                        usage, finish, rid = None, None, None
                        buf = b""
                        async for raw in r.content:
                            buf += raw
                            while b"\n" in buf:
                                line, buf = buf.split(b"\n", 1)
                                line = line.strip()
                                if not line.startswith(b"data:"):
                                    continue
                                payload = line[5:].strip()
                                if payload == b"[DONE]":
                                    continue
                                ev = json.loads(payload)
                                if "error" in ev:
                                    raise RuntimeError(f"stream error: {str(ev['error'])[:200]}")
                                rid = ev.get("id", rid)
                                if ev.get("usage"):
                                    usage = ev["usage"]
                                for ch in ev.get("choices") or []:
                                    d = ch.get("delta") or {}
                                    piece = d.get("content") or d.get("reasoning_content") or d.get("reasoning") or d.get("tool_calls")
                                    if piece and ttft is None:
                                        ttft = time.time() - t0
                                    if d.get("content"):
                                        content.append(d["content"]); got += len(d["content"])
                                    r_piece = d.get("reasoning_content") or d.get("reasoning")
                                    if r_piece:
                                        reasoning.append(r_piece); got += len(r_piece)
                                    for tc in d.get("tool_calls") or []:
                                        merge_tool_delta(calls, tc); got += 1
                                    if ch.get("finish_reason"):
                                        finish = ch["finish_reason"]
                        if finish is None:
                            raise RuntimeError("stream ended without finish_reason")
                        secs = time.time() - t0
                        msg = {"role": "assistant", "content": "".join(content) or None}
                        if reasoning:
                            msg["reasoning_content"] = "".join(reasoning)
                        if calls:
                            msg["tool_calls"] = [calls[i] for i in sorted(calls)]
                        data = {"id": rid or "gw", "object": "chat.completion", "created": int(time.time()),
                                "model": MODEL, "usage": usage or {},
                                "choices": [{"index": 0, "message": msg, "finish_reason": finish}]}
                        return data, {"seconds": secs, "ttft": ttft, "wait_seconds": wait_total,
                                      "restarts": restarts, "reasoning_chars": sum(map(len, reasoning))}
                    text = await r.text()
                    if r.status == 400:
                        raise ValueError(f"upstream 400: {text[:400]}")
                    reason = f"HTTP {r.status}"
            except ValueError:
                raise
            except Exception as e:  # noqa: BLE001 - connection drop / pod restart
                reason = f"{repr(e)[:160]} after {time.time() - t0:.0f}s, {got} chars"
            restarts += 1
            print(f"[gateway] upstream unavailable ({reason}); waiting for pod", flush=True)
            wait_total += await wait_for_pod(session)
        raise RuntimeError("upstream failed after retries")


def apply_study(body: dict, study: str) -> dict:
    # A tag is "<study>" or "<study>__<run id>"; settings come from the study part.
    cfg = STUDIES.get(study.split("__")[0], STUDIES.get("default", {}))
    body = dict(body)
    body["model"] = MODEL
    for k in ("temperature", "top_p"):
        if k in cfg:
            body[k] = cfg[k]
    if "chat_template_kwargs" in cfg:
        body["chat_template_kwargs"] = {**(body.get("chat_template_kwargs") or {}), **cfg["chat_template_kwargs"]}
    if cfg.get("max_tokens") and not body.get("max_tokens") and not body.get("max_completion_tokens"):
        body["max_tokens"] = cfg["max_tokens"]
    # Provider knobs vLLM does not serve for this model.
    for k in ("reasoning_effort", "thinking", "store", "metadata", "service_tier", "prompt_cache_key"):
        body.pop(k, None)
    return body


async def chat(request: web.Request):
    study = request.match_info["study"]
    held = 0.0
    # While the serving benchmark runs, every other study waits here so the
    # benchmark sees an idle GPU (the wait is logged, not counted as model time).
    while STATE["hold"] and not study.startswith("loadtest"):
        await asyncio.sleep(5)
        held += 5
    body = await request.json()
    stream = bool(body.pop("stream", False))
    body.pop("stream_options", None)
    body = apply_study(body, study)
    rec = {"ts": round(time.time(), 3), "study": study, "phase": STATE["phase"],
           "n_messages": len(body.get("messages", [])), "n_tools_offered": len(body.get("tools") or []),
           "temperature": body.get("temperature"), "top_p": body.get("top_p"),
           "thinking": (body.get("chat_template_kwargs") or {}).get("thinking", False),
           "effort": (body.get("chat_template_kwargs") or {}).get("reasoning_effort"),
           "held_seconds": held}
    task = asyncio.create_task(call_upstream(body))

    resp = None
    if stream:
        resp = web.StreamResponse(headers={"Content-Type": "text/event-stream", "Cache-Control": "no-cache"})
        await resp.prepare(request)
        while not task.done():
            await asyncio.wait({task}, timeout=15)
            if not task.done():
                await resp.write(b": keepalive\n\n")
    try:
        data, m = await task
    except Exception as e:  # noqa: BLE001
        rec.update(error=str(e)[:400]); log(rec)
        if stream:
            await resp.write(("data: " + json.dumps({"error": {"message": str(e)[:300]}}) + "\n\n").encode())
            await resp.write_eof()
            return resp
        return web.json_response({"error": {"message": str(e)}}, status=502 if "400" not in str(e)[:20] else 400)

    u = data.get("usage") or {}
    choice = data["choices"][0]
    msg = choice["message"]
    comp = u.get("completion_tokens") or 0
    decode_s = (m["seconds"] - (m["ttft"] or 0)) or None
    rec.update(prompt_tokens=u.get("prompt_tokens"), completion_tokens=comp,
               cached_tokens=((u.get("prompt_tokens_details") or {}).get("cached_tokens")),
               reasoning_chars=m["reasoning_chars"], content_chars=len(msg.get("content") or ""),
               ttft=round(m["ttft"], 3) if m["ttft"] is not None else None, seconds=round(m["seconds"], 3),
               decode_tps=round(comp / decode_s, 1) if comp and decode_s else None,
               wait_seconds=round(m["wait_seconds"], 1), restarts=m["restarts"],
               finish_reason=choice.get("finish_reason"),
               tool_calls=len(msg.get("tool_calls") or []),
               tool_names=[t["function"]["name"] for t in msg.get("tool_calls") or []])
    log(rec)
    if not stream:
        return web.json_response(data)
    base = {"id": data["id"], "object": "chat.completion.chunk", "created": data["created"], "model": MODEL}
    delta = {"role": "assistant"}
    if msg.get("reasoning_content"):
        delta["reasoning_content"] = msg["reasoning_content"]
    if msg.get("content"):
        delta["content"] = msg["content"]
    if msg.get("tool_calls"):
        delta["tool_calls"] = [{**tc, "index": i} for i, tc in enumerate(msg["tool_calls"])]
    for c in ({**base, "choices": [{"index": 0, "delta": delta, "finish_reason": None}]},
              {**base, "choices": [{"index": 0, "delta": {}, "finish_reason": choice.get("finish_reason")}], "usage": u}):
        await resp.write(("data: " + json.dumps(c) + "\n\n").encode())
    await resp.write(b"data: [DONE]\n\n")
    await resp.write_eof()
    return resp


async def models(request):
    return web.json_response({"object": "list", "data": [{"id": MODEL, "object": "model"}]})


async def set_phase(request):
    STATE.update(await request.json())
    return web.json_response(STATE)


if __name__ == "__main__":
    port, LOG = int(sys.argv[1]), sys.argv[2]
    STUDIES = json.load(open(sys.argv[3]))
    app = web.Application(client_max_size=128 * 1024 * 1024)
    app.router.add_post("/{study}/v1/chat/completions", chat)
    app.router.add_get("/{study}/v1/models", models)
    app.router.add_post("/admin/phase", set_phase)
    web.run_app(app, host="127.0.0.1", port=port, print=None)
