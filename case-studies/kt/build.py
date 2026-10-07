"""Assemble the KT-vs-Devin case study page from the raw benchmark data.

    python3 case-studies/kt/build.py <data-dir>

<data-dir> holds groundtruth/, answers/, grading/, metrics/, usage.json and
mermaid.json as produced by the scripts in case-studies/kt/bench/. Writes
case-studies/site/kt/index.html plus the downloadable data under
case-studies/site/kt/data/.

Scoring: each answer is graded by two independent blind graders; a
question's score is the mean of their points (correct 1, partial 0.5,
otherwise 0). Devin's answers appear in both the baseline and after-fixes
packets, so Devin's score is the mean over every grading it received.
"""
import json
import os
import shutil
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(os.path.dirname(HERE), "site")
REPOS = [
    {"id": "ky", "name": "sindresorhus/ky", "commit": "e0fcf780de2bd69af2528e4b7b87ccae6bb727b1", "commitExact": True},
    {"id": "flask", "name": "pallets/flask", "commit": "258d68b6ff5e2244386540f48b48bab90d6ab827", "commitExact": False},
    {"id": "hono", "name": "honojs/hono", "commit": "24547a6ed5e175f9326063efb657540162287973", "commitExact": False},
]
POINTS = {"correct": 1.0, "partial": 0.5}
# The "after fixes" round shown against the baseline (round tags v2, v3, ...).
AFTER = os.environ.get("KT_AFTER", "v2")
RANK = {"wrong": 0, "not_covered": 0, "partial": 1, "correct": 2}


def load(d, *p):
    path = os.path.join(d, *p)
    return json.load(open(path)) if os.path.exists(path) else None


def gradings(d, repo, mode, tag):
    """Unblinded per-question gradings: {qid: {system: [grade, ...]}}."""
    key = load(d, "grading", f"{repo}.{mode}{tag}.key.json")
    out = {}
    for suffix in ("graded", "graded-b"):
        g = load(d, "grading", f"{repo}.{mode}{tag}.{suffix}.json")
        if not g or not key:
            continue
        for item in g:
            for label in ("X", "Y"):
                system = key[item["id"]][label]
                out.setdefault(item["id"], {}).setdefault(system, []).append(item[label])
    return out


def combine(grades):
    """One displayed verdict per answer: graders agree, or the stricter one."""
    score = sum(POINTS.get(g["verdict"], 0) for g in grades) / len(grades)
    shown = min(grades, key=lambda g: RANK[g["verdict"]])
    notes = " / ".join(dict.fromkeys(g["note"] for g in grades))
    return {
        "verdict": shown["verdict"],
        "hallucination": any(g.get("hallucination") for g in grades),
        "score": score,
        "split": len({g["verdict"] for g in grades}) > 1,
        "note": notes,
    }


def mode_stats(d, mode, tag):
    per = {"neodevex": [], "devin": [], "hall": {"neodevex": 0, "devin": 0}, "nc": {"neodevex": 0, "devin": 0}}
    ledger = {}
    for r in REPOS:
        gt = load(d, "groundtruth", f"{r['id']}.json")
        gr = gradings(d, r["id"], mode, tag)
        if not gt or not gr:
            continue
        rows = []
        for q in gt["questions"]:
            if q["id"] not in gr:
                continue
            row = {"id": q["id"], "category": q["category"].replace("gotcha", "edge_case"), "question": q["question"], "reference": q["answer"]}
            for s in ("neodevex", "devin"):
                c = combine(gr[q["id"]][s])
                row[s] = c
                per[s].append(c["score"])
                per["hall"][s] += c["hallucination"]
                per["nc"][s] += c["verdict"] == "not_covered"
            rows.append(row)
        ledger[r["id"]] = rows
    acc = {s: round(100 * sum(v) / len(v), 1) if v else None for s, v in per.items() if s in ("neodevex", "devin")}
    n = len(per["neodevex"]) or 1
    return {"accuracy": acc, "halluc_pct": {s: round(100 * per["hall"][s] / n, 1) for s in per["hall"]},
            "not_covered": per["nc"], "ledger": ledger, "n": len(per["neodevex"])}


def devin_overall(d, mode):
    vals = []
    for tag in ("", f"-{AFTER}"):
        for r in REPOS:
            for qid, s in gradings(d, r["id"], mode, tag).items():
                vals += [POINTS.get(g["verdict"], 0) for g in s.get("devin", [])]
    return round(100 * sum(vals) / len(vals), 1) if vals else None


def devin_head_adjusted(d, v2_ask):
    """Devin Ask score when answers verified true at the repo's latest commit count as correct."""
    recheck = load(d, "grading", "devin-head-recheck.result.json")
    if not recheck or not v2_ask["n"]:
        return None
    credited = {(x["repo"], x["id"]) for x in recheck if x["true_at_head"] == "yes"}
    scores, false_claims = [], 0
    for repo, rows in v2_ask["ledger"].items():
        for q in rows:
            ok = (repo, q["id"]) in credited
            scores.append(1.0 if ok else q["devin"]["score"])
            false_claims += q["devin"]["hallucination"] and not ok
    return {"accuracy": round(100 * sum(scores) / len(scores), 1),
            "halluc_pct": round(100 * false_claims / len(scores), 1), "credited": len(credited)}


def wiki_metrics(d, system):
    rows = [load(d, "metrics", f"{r['id']}.{system}.json") for r in REPOS]
    rows = [x for x in rows if x]
    tot = lambda k: sum(x[k] for x in rows)
    return {
        "pages": tot("pages"), "words": tot("words"), "files": tot("unique_files_cited"),
        "cite_valid": round(100 * tot("citations_valid") / max(tot("citations"), 1), 1),
        "pinned": tot("links_pinned_to_commit"), "citations": tot("citations"),
    }


def call(ours, devin, better):
    if ours is not None and devin is None:
        return "tie", "Devin doesn't publish this"
    if ours is None or devin is None:
        return "tie", "Not measured"
    diff = ours - devin if better == "higher" else devin - ours
    if abs(diff) < 1e-9 or abs(diff) / max(abs(devin), 1e-9) < 0.03:
        return "tie", "About even"
    return ("win", "NeoDevEx ahead") if diff > 0 else ("lose", "Devin ahead")


def main(d):
    base_wiki, v2_wiki = mode_stats(d, "wiki", ""), mode_stats(d, "wiki", f"-{AFTER}")
    base_ask, v2_ask = mode_stats(d, "ask", ""), mode_stats(d, "ask", f"-{AFTER}")
    usage = load(d, "usage.json") or {}
    mermaid = load(d, "mermaid.json") or {}
    cites = load(d, "citations_semantic.json") or {}
    m_base, m_v2, m_dev = wiki_metrics(d, "neodevex"), wiki_metrics(d, f"neodevex-{AFTER}"), wiki_metrics(d, "devin")
    # Devin is scored from the same graded packets as our after-fixes run,
    # so both columns come from the same graders at the same time.
    devin_wiki_acc = v2_wiki["accuracy"]["devin"] if v2_wiki["n"] else devin_overall(d, "wiki")
    devin_ask_acc = v2_ask["accuracy"]["devin"] if v2_ask["n"] else devin_overall(d, "ask")

    metrics = []

    def add(label, help_, base, ours, devin, better, fmt="{}", bars=True):
        c, t = call(ours, devin, better)
        metrics.append({"label": label, "help": help_, "base": base, "ours": ours, "devin": devin, "call": c, "callText": t, "fmt": fmt, "bars": bars})

    add("Answer accuracy from the docs", "A reader that sees only the wiki answers all 75 questions.",
        base_wiki["accuracy"]["neodevex"], v2_wiki["accuracy"]["neodevex"], devin_wiki_acc, "higher", "{}%")
    add("Answer accuracy, asking the repo", "Each product's own Q&A over the repository.",
        base_ask["accuracy"]["neodevex"], v2_ask["accuracy"]["neodevex"], devin_ask_acc, "higher", "{}%")
    add("Answers with a false claim", "Share of Q&A answers stating a file, value or behaviour the code contradicts.",
        base_ask["halluc_pct"]["neodevex"], v2_ask["halluc_pct"]["neodevex"],
        v2_ask["halluc_pct"]["devin"] if v2_ask["n"] else base_ask["halluc_pct"]["devin"],
        "lower", "{}%")
    adj = devin_head_adjusted(d, v2_ask)
    if adj:
        add("Asking the repo, Devin credited for newer code",
            "Devin's Ask answers from the latest code, not the commit its wiki shows; answers that are right for the latest code count as correct here.",
            None, v2_ask["accuracy"]["neodevex"], adj["accuracy"], "higher", "{}%")
    add("Questions the docs don't cover", "Out of 75, the reader found no answer in the wiki.",
        base_wiki["not_covered"]["neodevex"], v2_wiki["not_covered"]["neodevex"] if v2_wiki["n"] else None,
        v2_wiki["not_covered"]["devin"] if v2_wiki["n"] else base_wiki["not_covered"]["devin"], "lower")
    add("Citations that resolve", "Cited file exists at the commit and the line range is inside it.",
        m_base["cite_valid"], m_v2["cite_valid"], m_dev["cite_valid"], "higher", "{}%")
    if cites:
        add("Citations that support the claim", "Random sample of up to 40 inline citations per wiki, read against the cited lines by a blind grader.",
            cites.get("neodevex"), cites.get(f"neodevex-{AFTER}"), cites.get("devin"), "higher", "{}%")
    if mermaid:
        add("Diagrams that render", "Mermaid blocks that parse with mermaid 11.",
            mermaid.get("neodevex"), mermaid.get(f"neodevex-{AFTER}"), mermaid.get("devin"), "higher", "{}%")
    add("Source files cited", "Distinct files referenced across the three wikis.", m_base["files"], m_v2["files"], m_dev["files"], "higher")
    add("Wiki pages", "Across the three repositories.", m_base["pages"], m_v2["pages"], m_dev["pages"], "higher")
    add("Source links pinned to the commit", "Links that open the exact code a page was written from. Devin's export carries line references without links, so there is nothing to compare.",
        m_base["pinned"], m_v2["pinned"], None, "higher", bars=False)
    if usage:
        add("Cost to generate a wiki", "Mean across the three repos, measured from provider-reported tokens at list price.",
            usage.get("base_cost"), usage.get("after_cost"), None, "lower", "${}")
        add("Time to generate a wiki", "Mean wall-clock minutes from submit to finished wiki.",
            usage.get("base_minutes"), usage.get("after_minutes"), None, "lower", "{} min")
        add("Cost per answered question", "Measured mean for our Q&A.", usage.get("ask_base_cost"), usage.get("ask_after_cost"), None, "lower", "${}")

    case = load(HERE, "narrative.json")
    case.update({
        "date": date.today().strftime("%-d %B %Y"),
        "questionCount": str(base_wiki["n"] or 75),
        "labels": {"neodevex": "NeoDevEx", "devin": "Devin"},
        "repos": [{**r, **(load(d, "repo_sizes.json") or {}).get(r["id"], {"files": "", "loc": 0})} for r in REPOS],
        "metrics": metrics,
        "ledger": {"wiki": (v2_wiki if v2_wiki["n"] else base_wiki)["ledger"], "ask": (v2_ask if v2_ask["n"] else base_ask)["ledger"]},
    })

    out_dir = os.path.join(SITE, "kt")
    data_dir = os.path.join(out_dir, "data")
    os.makedirs(data_dir, exist_ok=True)
    for name in ("groundtruth", "grading", "metrics"):
        src = os.path.join(d, name)
        dst = os.path.join(data_dir, name)
        shutil.rmtree(dst, ignore_errors=True)
        shutil.copytree(src, dst, ignore=shutil.ignore_patterns("*.py", "*.txt", "*.ts", "*_g.json", "*.md", "b_*", "*.zip"))
    # Devin's answer text stays out of the published packets: verdicts and
    # grader notes are published, the text itself can be re-collected from
    # the public DeepWiki MCP with bench/answer.py.
    pub_grading = os.path.join(data_dir, "grading")
    for f in os.listdir(pub_grading):
        if not f.endswith(".packet.json") or ".cites" in f or "head-recheck" in f:
            continue
        key = load(pub_grading, f.replace(".packet.json", ".key.json"))
        packet = load(pub_grading, f)
        for item in packet:
            for label in ("X", "Y"):
                if key and key[item["id"]][label] == "devin":
                    item[label] = "[Devin answer not redistributed; re-collect with bench/answer.py]"
        json.dump(packet, open(os.path.join(pub_grading, f), "w"), indent=1)
    recheck = os.path.join(pub_grading, "devin-head-recheck.packet.json")
    if os.path.exists(recheck):
        items = json.load(open(recheck))
        for it in items:
            it["answer"] = "[Devin answer not redistributed]"
        json.dump(items, open(recheck, "w"), indent=1)

    ans_dst = os.path.join(data_dir, "answers")
    shutil.rmtree(ans_dst, ignore_errors=True)
    os.makedirs(ans_dst)
    # Our own outputs are published; Devin's raw answers and wiki text are
    # not redistributed (they can be re-collected with bench/answer.py).
    for f in os.listdir(os.path.join(d, "answers")):
        if ".neodevex" in f:
            shutil.copy(os.path.join(d, "answers", f), ans_dst)
    for sub in ("ours", f"ours-{AFTER}"):
        src = os.path.join(d, sub)
        if os.path.isdir(src):
            dst = os.path.join(data_dir, "wiki-" + sub)
            shutil.rmtree(dst, ignore_errors=True)
            shutil.copytree(src, dst, ignore=shutil.ignore_patterns("*.json"))
    for extra in ("usage.json", "mermaid.json", "citations_semantic.json"):
        if os.path.exists(os.path.join(d, extra)):
            shutil.copy(os.path.join(d, extra), data_dir)
    json.dump(case, open(os.path.join(data_dir, "case.json"), "w"), indent=1)
    bundle = os.path.join(data_dir, "kt-benchmark-data")
    if os.path.exists(bundle + ".zip"):
        os.remove(bundle + ".zip")
    shutil.make_archive(bundle, "zip", data_dir)

    html = open(os.path.join(out_dir, "template.html")).read()
    payload = json.dumps(case).replace("</", "<\\/")
    open(os.path.join(out_dir, "index.html"), "w").write(html.replace("/*DATA*/null", payload))
    print("built", os.path.join(out_dir, "index.html"))
    for m in metrics:
        print(f"  {m['label']:<40} base={m['base']} ours={m['ours']} devin={m['devin']} -> {m['callText']}")


if __name__ == "__main__":
    main(sys.argv[1])
