"""Score the self-hosted DeepSeek V4 Flash variant (neodevex-dsv4f) side by side
with round 1 (neodevex-qwen3), the best published Gemini run (neodevex-v3) and Devin.

    python3 dsv4f_results.py

Same scoring as case-studies/kt/bench/qwen3_results.py: build.py's own
mode_stats / wiki_metrics on the `-dsv4f` packets (two blind graders, correct 1,
partial 0.5, false claim if either grader flags it). Usage comes from the
metering gateway's log (case-studies/selfhosted/data/gateway/calls.jsonl),
calls tagged kt__gen-<repo>-<kind> and kt__ask-<repo>-<kind>; wall-clock
windows from .work/dsv4f-timeline.jsonl. Writes .work/dsv4f-results.json.
"""
import json
import os
import statistics
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
SELF = os.path.abspath(os.path.join(HERE, "..", ".."))
KT = os.path.abspath(os.path.join(SELF, "..", "kt"))
W = os.path.join(KT, ".work")
sys.path.insert(0, KT)
import build  # noqa: E402

TAG = "dsv4f"
SYS = f"neodevex-{TAG}"
REPOS = ["ky", "flask", "hono"]
GPU_USD_PER_HOUR = 10.58  # 2x H200 SXM Secure, Runpod (RUNLOG.md, AGENT_BRIEF.md)
PRICES = {"gemini-2.5-pro": (1.25, 10.00), "gemini-2.5-flash": (0.30, 2.50)}
GATEWAY_LOG = os.path.join(SELF, "data", "gateway", "calls.jsonl")


def load(*p):
    path = os.path.join(W, *p)
    return json.load(open(path)) if os.path.exists(path) else None


def per_repo(stats, system):
    out = {}
    for repo, rows in stats["ledger"].items():
        sc = [q[system]["score"] for q in rows]
        out[repo] = {
            "accuracy_pct": round(100 * sum(sc) / len(sc), 1),
            "false_claim_pct": round(100 * sum(q[system]["hallucination"] for q in rows) / len(rows), 1),
            "not_covered": sum(q[system]["verdict"] == "not_covered" for q in rows),
            "n": len(rows),
        }
    return out


def mode_block(mode, tag):
    s = build.mode_stats(W, mode, f"-{tag}")
    if not s["n"]:
        return None
    res = {}
    for system in ("neodevex", "devin"):
        res[system] = {"overall": {"accuracy_pct": s["accuracy"][system], "false_claim_pct": s["halluc_pct"][system],
                                   "not_covered": s["not_covered"][system], "n": s["n"]},
                       "per_repo": per_repo(s, system)}
    return res, s


def agreement(mode, tag):
    same = total = 0
    for r in REPOS:
        a = load("grading", f"{r}.{mode}-{tag}.graded.json")
        b = load("grading", f"{r}.{mode}-{tag}.graded-b.json")
        if not a or not b:
            continue
        bmap = {x["id"]: x for x in b}
        for x in a:
            for lab in ("X", "Y"):
                total += 1
                same += x[lab]["verdict"] == bmap[x["id"]][lab]["verdict"]
    return round(100 * same / total, 1) if total else None


def category_block(stats):
    """Accuracy per question category (architecture, behavior, edge_case, ...)."""
    out = defaultdict(lambda: {"neodevex": [], "devin": []})
    for rows in stats["ledger"].values():
        for q in rows:
            for s in ("neodevex", "devin"):
                out[q["category"]][s].append(q[s]["score"])
    return {c: {s: round(100 * sum(v) / len(v), 1) for s, v in d.items()} | {"n": len(d["neodevex"])}
            for c, d in sorted(out.items())}


def wiki_block(system):
    rows = {r: load("metrics", f"{r}.{system}.json") for r in REPOS}
    keys = ("pages", "words", "citations", "citations_valid", "citation_validity", "unique_files_cited",
            "inline_citations", "mermaid_diagrams", "links_pinned_to_commit", "error_pages")
    return {"per_repo": {r: {k: v[k] for k in keys} for r, v in rows.items() if v},
            "overall": build.wiki_metrics(W, system)}


def cites_block(tag, system):
    per, allv = {}, {"neodevex": [], "devin": []}
    for r in REPOS:
        g = load("grading", f"{r}.cites-{tag}.graded.json")
        k = load("grading", f"{r}.cites-{tag}.key.json")
        if not g or not k:
            continue
        vs = {"neodevex": [], "devin": []}
        for x in g:
            vs["neodevex" if k[x["n"]] == system else "devin"].append(x["verdict"])
        per[r] = round(100 * vs["neodevex"].count("supported") / len(vs["neodevex"]), 1)
        for s in vs:
            allv[s] += vs[s]
    if not allv["neodevex"]:
        return None
    pct = lambda v, w: round(100 * v.count(w) / len(v), 1)
    return {SYS: {"supported_pct": pct(allv["neodevex"], "supported"), "partial_pct": pct(allv["neodevex"], "partial"),
                  "unsupported_pct": pct(allv["neodevex"], "unsupported"), "n": len(allv["neodevex"]),
                  "per_repo_supported_pct": per},
            "devin_same_packets": {"supported_pct": pct(allv["devin"], "supported"),
                                   "unsupported_pct": pct(allv["devin"], "unsupported"), "n": len(allv["devin"])},
            "note": "Single blind verifier (Claude Opus 5.5, round-1 prompt), 40 dsv4f + the same 40 Devin citations per repo, shuffled. Partial counts as not supported."}


def parse_tag(study):
    # kt__gen-ky-page -> ("gen", "ky", "page")
    if not study.startswith("kt__"):
        return None
    rest = study[4:]
    parts = rest.split("-")
    if len(parts) != 3 or parts[0] not in ("gen", "ask") or parts[1] not in REPOS:
        return None
    return tuple(parts)


def busy(sel):
    iv = sorted((c["ts"] + (c.get("wait_seconds") or 0), c["ts"] + (c.get("wait_seconds") or 0) + c["seconds"])
                for c in sel if not c.get("error") and c.get("seconds") is not None)
    tot, cs, ce = 0.0, None, None
    for s, e in iv:
        if ce is None or s > ce:
            if ce is not None:
                tot += ce - cs
            cs, ce = s, e
        else:
            ce = max(ce, e)
    if ce is not None:
        tot += ce - cs
    return round(tot, 1)


def run_start():
    # Calls before the first recorded gen start belong to an aborted attempt
    # (default-thinking run, killed after ~6 min); they are excluded.
    p = os.path.join(W, f"{TAG}-timeline.jsonl")
    ev = [json.loads(l) for l in open(p)] if os.path.exists(p) else []
    return min((e["ts"] for e in ev if e["event"] == "start"), default=0) - 5


def usage():
    calls = []
    t0 = run_start()
    for line in (open(GATEWAY_LOG) if os.path.exists(GATEWAY_LOG) else []):
        c = json.loads(line)
        t = parse_tag(c.get("study", ""))
        if t and c["ts"] >= t0:
            c["phase"], c["repo"], c["kind"] = t
            calls.append(c)

    def agg(sel):
        ok = [c for c in sel if not c.get("error")]
        comp = [c["completion_tokens"] or 0 for c in ok]
        a = {"calls": len(sel), "errors": len(sel) - len(ok),
             "prompt_tokens": sum(c.get("prompt_tokens") or 0 for c in ok),
             "cached_prompt_tokens": sum(c.get("cached_tokens") or 0 for c in ok),
             "completion_tokens": sum(comp),
             "model_seconds_sum": round(sum(c["seconds"] for c in ok), 1),
             "pod_restart_wait_seconds": round(sum(c.get("wait_seconds") or 0 for c in ok), 1),
             "restarts": sum(c.get("restarts") or 0 for c in ok),
             "length_capped": sum(c.get("finish_reason") == "length" for c in ok),
             "busy_wall_seconds": busy(sel)}
        tt = [c["ttft"] for c in ok if c.get("ttft") is not None]
        tps = [c["decode_tps"] for c in ok if c.get("decode_tps")]
        if tt:
            a["ttft_s_median"] = round(statistics.median(tt), 2)
            a["ttft_s_p90"] = round(sorted(tt)[int(0.9 * (len(tt) - 1))], 2)
        if tps:
            a["decode_tps_median"] = round(statistics.median(tps), 1)
        if comp:
            a["completion_tokens_median"] = int(statistics.median(comp))
            a["completion_tokens_max"] = max(comp)
        cost = 0.0
        for c in ok:
            model = "gemini-2.5-flash" if c["phase"] == "ask" and c["kind"] == "planner" else "gemini-2.5-pro"
            pi, po = PRICES[model]
            cost += ((c.get("prompt_tokens") or 0) * pi + (c.get("completion_tokens") or 0) * po) / 1e6
        a["gemini_list_price_usd_same_tokens"] = round(cost, 4)
        a["gpu_cost_usd_busy_time"] = round(a["busy_wall_seconds"] / 3600 * GPU_USD_PER_HOUR, 4)
        return a

    out = {"all": agg(calls)}
    for ph, label in (("gen", "generation"), ("ask", "ask")):
        sel = [c for c in calls if c["phase"] == ph]
        out[f"{label}/all"] = agg(sel)
        for r in REPOS:
            out[f"{label}/{r}"] = agg([c for c in sel if c["repo"] == r])
        for k in sorted({c["kind"] for c in sel}):
            out[f"{label}/kind/{k}"] = agg([c for c in sel if c["kind"] == k])
    capped = [{"tag": c["study"], "ts": c["ts"], "completion_tokens": c["completion_tokens"], "prompt_tokens": c.get("prompt_tokens")}
              for c in calls if c.get("finish_reason") == "length"]
    errors = [{"tag": c["study"], "ts": c["ts"], "error": c.get("error")} for c in calls if c.get("error")]
    return out, capped, errors


def wall_clock():
    if not os.path.exists(os.path.join(W, f"{TAG}-timeline.jsonl")):
        return None
    ev = [json.loads(l) for l in open(os.path.join(W, f"{TAG}-timeline.jsonl"))]
    out = {}
    for ph in ("gen", "ask", "wiki"):
        per = {}
        for r in REPOS:
            st = [e["ts"] for e in ev if e["phase"] == ph and e["repo"] == r and e["event"] == "start"]
            en = [e["ts"] for e in ev if e["phase"] == ph and e["repo"] == r and e["event"] == "end"]
            if st and en:
                per[r] = {"start_epoch": min(st), "end_epoch": max(en), "minutes": round((max(en) - min(st)) / 60, 1)}
        if per:
            s = min(v["start_epoch"] for v in per.values())
            e = max(v["end_epoch"] for v in per.values())
            out[ph] = {"per_repo": per, "start_epoch": s, "end_epoch": e, "minutes": round((e - s) / 60, 1)}
    return out


def main():
    out = {"variant": SYS,
           "model": "deepseek-v4-flash (deepseek-ai/DeepSeek-V4-Flash-0731, FP4 experts + FP8, vLLM 0.30.0, 2x H200 SXM, Runpod Secure, pod 4irt4imcc8pm0m), non-thinking",
           "compared_with": {"round_1": "neodevex-qwen3 (Qwen3-Coder-Next, 1x RTX PRO 6000)",
                             "best_published_neodevex": "neodevex-v3 (Gemini 2.5 Pro pages/answers, 2.5 Flash ask planner)",
                             "devin": "Devin (DeepWiki / Ask Devin)"}}
    for mode, label in (("wiki", "docs_only_reading"), ("ask", "repository_qa")):
        d = mode_block(mode, TAG)
        q = mode_block(mode, "qwen3")
        v3 = mode_block(mode, "v3")
        out[label] = {
            SYS: d[0]["neodevex"] if d else None,
            "neodevex-qwen3": q[0]["neodevex"] if q else None,
            "neodevex-v3": v3[0]["neodevex"] if v3 else None,
            "devin_published_v3_packets": v3[0]["devin"] if v3 else None,
            "devin_regraded_in_qwen3_packets": q[0]["devin"] if q else None,
            "devin_regraded_in_dsv4f_packets": d[0]["devin"] if d else None,
            "grader_agreement_pct": {TAG: agreement(mode, TAG), "qwen3": agreement(mode, "qwen3"), "v3": agreement(mode, "v3")},
            "by_category_pct": {TAG: category_block(d[1]) if d else None, "qwen3": category_block(q[1]) if q else None,
                                "v3": category_block(v3[1]) if v3 else None},
        }
    out["wiki_structure_and_citations"] = {s: wiki_block(s) for s in (SYS, "neodevex-qwen3", "neodevex-v3", "devin")}
    out["mermaid_render_pct"] = {"published": load("mermaid.json"),
                                 "qwen3": (load("qwen3-results.json") or {}).get("mermaid_render_pct", {}).get("qwen3"),
                                 TAG: (load(f"mermaid-{TAG}.json") or {}).get("_summary")}
    out["citations_semantic"] = {"published": load("citations_semantic.json"),
                                 "qwen3": (load("qwen3-results.json") or {}).get("citations_semantic_qwen3"),
                                 TAG: cites_block(TAG, SYS)}
    u, capped, errors = usage()
    out["usage"] = u
    out["length_capped_calls"] = capped
    out["error_calls"] = errors
    out["usage_qwen3_round1"] = (load("qwen3-results.json") or {}).get("usage")
    out["wall_clock"] = wall_clock()
    out.update(load(f"{TAG}-notes.json") or {})
    json.dump(out, open(os.path.join(W, f"{TAG}-results.json"), "w"), indent=1)
    print(json.dumps({k: {kk: (vv or {}).get("overall") for kk, vv in out[k].items() if kk.startswith("neodevex") or kk.startswith("devin")}
                      for k in ("docs_only_reading", "repository_qa")}, indent=1))


if __name__ == "__main__":
    main()
