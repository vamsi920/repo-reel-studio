"""Score the self-hosted qwen3-coder-next variant against the published runs.

    python3 qwen3_results.py

Uses build.py's own scoring functions (two blind graders, correct 1 /
partial 0.5, false-claim flag) on the `-qwen3` packets, and the same
functions on the published `-v3` packets for the comparison columns.
Token counts and model time come from .work/qwen3-calls.jsonl (written by
the metering proxy in front of the vLLM endpoint). Writes
.work/qwen3-results.json.
"""
import json
import os
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
KT = os.path.dirname(HERE)
W = os.path.join(KT, ".work")
sys.path.insert(0, KT)
import build  # noqa: E402

REPOS = ["ky", "flask", "hono"]
GPU_USD_PER_HOUR = 1.69
# USD per 1M tokens, list price. Same figures as case-studies/chat/bench/summarize.py
# PRICES and vendor/deepwiki-open/api/usage.py MODEL_PRICES (Gemini 2.5 Pro has a
# higher tier above 200k prompt tokens; no qwen3 call came near it).
PRICES = {"gemini-2.5-pro": (1.25, 10.00), "gemini-2.5-flash": (0.30, 2.50)}


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
        res[system] = {
            "overall": {
                "accuracy_pct": s["accuracy"][system],
                "false_claim_pct": s["halluc_pct"][system],
                "not_covered": s["not_covered"][system],
                "n": s["n"],
            },
            "per_repo": per_repo(s, system),
        }
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


def wiki_block(system):
    rows = {r: load("metrics", f"{r}.{system}.json") for r in REPOS}
    keys = ("pages", "words", "citations", "citations_valid", "citation_validity", "unique_files_cited",
            "inline_citations", "mermaid_diagrams", "links_pinned_to_commit", "error_pages")
    return {"per_repo": {r: {k: v[k] for k in keys} for r, v in rows.items() if v},
            "overall": build.wiki_metrics(W, system)}


def usage():
    calls = [json.loads(l) for l in open(os.path.join(W, "qwen3-calls.jsonl"))]
    # "unset": page calls the KT service retried into a freshly restarted proxy
    # before its phase label was set (all during generation). Calls with a
    # tiny prompt are the proxy's own smoke test.
    for c in calls:
        if c.get("phase") == "unset":
            c["phase"] = "gen"
    calls = [c for c in calls if c.get("phase") in ("gen", "ask") and c.get("prompt_chars", 0) >= 100]
    agg = defaultdict(lambda: {"calls": 0, "errors": 0, "prompt_tokens": 0, "completion_tokens": 0,
                               "model_seconds_sum": 0.0, "pod_restart_wait_seconds": 0.0, "length_capped": 0})
    for c in calls:
        phase = "generation" if c["phase"] == "gen" else "ask"
        for key in (f"{phase}/{c.get('repo')}", f"{phase}/all", "all"):
            a = agg[key]
            a["calls"] += 1
            if c.get("error"):
                a["errors"] += 1
                continue
            a["prompt_tokens"] += c["prompt_tokens"] or 0
            a["completion_tokens"] += c["completion_tokens"] or 0
            a["model_seconds_sum"] += c["seconds"]
            a["pod_restart_wait_seconds"] += c.get("wait_seconds", 0)
            a["length_capped"] += c.get("finish_reason") == "length"

    # Busy wall-clock: union of [start, start+seconds] intervals per phase
    # (calls overlap; this is the GPU time actually spent serving us).
    def busy(sel):
        iv = sorted((c["ts"] + c.get("wait_seconds", 0), c["ts"] + c.get("wait_seconds", 0) + c["seconds"])
                    for c in sel if not c.get("error"))
        tot, cur_s, cur_e = 0.0, None, None
        for s, e in iv:
            if cur_e is None or s > cur_e:
                if cur_e is not None:
                    tot += cur_e - cur_s
                cur_s, cur_e = s, e
            else:
                cur_e = max(cur_e, e)
        if cur_e is not None:
            tot += cur_e - cur_s
        return round(tot, 1)

    for phase, label in (("gen", "generation"), ("ask", "ask")):
        sel = [c for c in calls if c["phase"] == phase]
        agg[f"{label}/all"]["busy_wall_seconds"] = busy(sel)
        for r in REPOS:
            agg[f"{label}/{r}"]["busy_wall_seconds"] = busy([c for c in sel if c.get("repo") == r])
    agg["all"]["busy_wall_seconds"] = busy(calls)

    def frontier_cost(sel):
        cost = 0.0
        for c in sel:
            if c.get("error"):
                continue
            # The published runs used 2.5 Flash for the ask file-planner and 2.5 Pro for everything else.
            model = "gemini-2.5-flash" if c["phase"] == "ask" and c["kind"] == "planner" else "gemini-2.5-pro"
            pi, po = PRICES[model]
            cost += ((c["prompt_tokens"] or 0) * pi + (c["completion_tokens"] or 0) * po) / 1e6
        return round(cost, 4)

    for key, a in agg.items():
        a["model_seconds_sum"] = round(a["model_seconds_sum"], 1)
        phase, _, repo = key.partition("/")
        sel = [c for c in calls if (phase == "all" or c["phase"] == ("gen" if phase == "generation" else "ask"))
               and (repo in ("", "all") or c.get("repo") == repo)]
        a["gemini_list_price_usd_same_tokens"] = frontier_cost(sel)
        a["gpu_cost_usd_busy_time"] = round(a.get("busy_wall_seconds", 0) / 3600 * GPU_USD_PER_HOUR, 4)
    return dict(sorted(agg.items()))


def main():
    out = {"variant": "neodevex-qwen3", "model": "qwen3-coder-next (RedHatAI/Qwen3-Coder-Next-NVFP4, vLLM 0.30.0, 1x RTX PRO 6000 Blackwell, Runpod)",
           "compared_with": {"best_published_neodevex": "neodevex-v3 (Gemini 2.5 Pro pages/answers, 2.5 Flash ask planner)", "devin": "Devin (DeepWiki / Ask Devin)"}}
    for mode, label in (("wiki", "docs_only_reading"), ("ask", "repository_qa")):
        q = mode_block(mode, "qwen3")
        v3 = mode_block(mode, "v3")
        out[label] = {
            "neodevex-qwen3": q[0]["neodevex"] if q else None,
            "neodevex-v3": v3[0]["neodevex"] if v3 else None,
            "devin_published_v3_packets": v3[0]["devin"] if v3 else None,
            "devin_regraded_in_qwen3_packets": q[0]["devin"] if q else None,
            "grader_agreement_pct": {"qwen3": agreement(mode, "qwen3"), "v3": agreement(mode, "v3")},
        }
    out["wiki_structure_and_citations"] = {s: wiki_block(s) for s in ("neodevex-qwen3", "neodevex-v3", "devin")}
    out["mermaid_render_pct"] = {"published": load("mermaid.json"), "qwen3": load("mermaid-qwen3.json")}
    out["citations_semantic"] = load("citations_semantic.json")
    out["usage"] = usage()
    extra = load("qwen3-notes.json") or {}
    out.update(extra)
    json.dump(out, open(os.path.join(W, "qwen3-results.json"), "w"), indent=1)
    print(json.dumps({k: out[k] for k in ("docs_only_reading", "repository_qa")}, indent=1)[:4000])


if __name__ == "__main__":
    main()
