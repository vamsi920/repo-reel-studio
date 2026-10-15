"""Round 2 KT study (scenario S5) on DeepSeek V4 Flash, the same pipeline as round 1.

    python3 run_dsv4f.py gen|post|ask|wiki|all

gen   start one KT service per repo (tag kt__gen-<repo>), submit forced
      comprehensive generation for all three repos at once, wait, export the
      wikis to .work/ours-dsv4f/, stop the services
post  metrics.py (structure + citations) and the mermaid render check
ask   one KT service per repo (tag kt__ask-<repo>); answer.py <repo>
      neodevex-dsv4f ask, three repos in parallel, 2 workers each (round 1's
      settings); stop the services
wiki  the neutral docs reader (Gemini 2.5 Flash, unchanged) on the exported wikis

Every phase/repo start and end (epoch seconds) is appended to
.work/dsv4f-timeline.jsonl. Env: KT_HOME_ROOT, KT_LOG_DIR (see start-kt.sh).
"""
import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
KT = os.path.join(ROOT, "case-studies", "kt")
W = os.path.join(KT, ".work")
BENCH = os.path.join(KT, "bench")
DWPY = os.environ.get("DWVENV", "/private/tmp/claude-501/-Users-vamsi-Desktop-neodevex-repo-reel-studio/"
                      "5349578c-0629-4c1e-9576-1e147dc9d821/scratchpad/dwvenv") + "/bin/python"
HOMES = os.environ["KT_HOME_ROOT"]
LOGS = os.environ["KT_LOG_DIR"]
TAG = "dsv4f"
SYSTEM = f"neodevex-{TAG}"
FOLDER = f"ours-{TAG}"
REPOS = ["ky", "flask", "hono"]
PORTS = {"ky": 18851, "flask": 18852, "hono": 18853}
TASK = {
    "ky": "github_sindresorhus_ky_e0fcf780de2bd69af2528e4b7b87ccae6bb727b1",
    "flask": "github_pallets_flask_258d68b6ff5e2244386540f48b48bab90d6ab827",
    "hono": "github_honojs_hono_24547a6ed5e175f9326063efb657540162287973",
}
KEYS = {
    "ky": "sindresorhus_ky_en_e0fcf780de2bd69af2528e4b7b87ccae6bb727b1",
    "flask": "pallets_flask_en_258d68b6ff5e2244386540f48b48bab90d6ab827",
    "hono": "honojs_hono_en_24547a6ed5e175f9326063efb657540162287973",
}
TIMELINE = os.path.join(W, f"{TAG}-timeline.jsonl")


def mark(phase, repo, event, **extra):
    rec = {"ts": round(time.time(), 1), "phase": phase, "repo": repo, "event": event, **extra}
    with open(TIMELINE, "a") as fh:
        fh.write(json.dumps(rec) + "\n")
    print(json.dumps(rec), flush=True)


def gemini_key():
    for line in open(os.path.join(ROOT, ".env")):
        if line.startswith("VITE_GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("no VITE_GEMINI_API_KEY in .env")


def start(repo, phase):
    subprocess.run([os.path.join(HERE, "start-kt.sh"), repo, phase, str(PORTS[repo])], check=True,
                   env={**os.environ, "KT_HOME_ROOT": HOMES, "KT_LOG_DIR": LOGS})
    for _ in range(120):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{PORTS[repo]}/", timeout=3)
            return
        except Exception:  # noqa: BLE001
            time.sleep(2)
    raise SystemExit(f"{repo} service did not come up")


def stop(repo, phase):
    pidf = os.path.join(LOGS, f"kt-{TAG}-{phase}-{repo}.pid")
    if os.path.exists(pidf):
        pid = int(open(pidf).read().strip())
        try:
            os.kill(pid, signal.SIGTERM)  # only the PID this script started
        except ProcessLookupError:
            pass
        os.remove(pidf)


def task_status(repo):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORTS[repo]}/wiki/tasks/{TASK[repo]}", timeout=15) as r:
            return json.load(r)
    except Exception as e:  # noqa: BLE001
        return {"status": f"unreachable: {e}"}


def export(repo):
    os.makedirs(os.path.join(W, FOLDER), exist_ok=True)
    src = os.path.join(HOMES, f"khome-{repo}", ".adalflow", "wikicache", f"deepwiki_cache_github_{KEYS[repo]}.json")
    d = json.load(open(src))
    pages = [d["generated_pages"][p["id"]] for p in d["wiki_structure"]["pages"] if p["id"] in d["generated_pages"]]
    with open(os.path.join(W, FOLDER, f"{repo}.md"), "w") as fh:
        fh.write("\n".join(f"# Page: {p['title']}\n\n{p['content']}\n" for p in pages))
    shutil.copy(src, os.path.join(W, FOLDER, f"{repo}.json"))
    u = d.get("usage") or {}
    return {"pages": len(pages), "structure_pages": len(d["wiki_structure"]["pages"]),
            "service_duration_min": round(u.get("duration_ms", 0) / 60000, 1)}


def gen():
    for r in REPOS:
        start(r, "gen")
    for r in REPOS:
        mark("gen", r, "start")
        subprocess.run([os.path.join(HERE, "submit.sh"), r, str(PORTS[r])], check=True)
    pending = set(REPOS)
    while pending:
        time.sleep(20)
        for r in sorted(pending):
            s = task_status(r)
            if s.get("status") in ("completed", "failed"):
                mark("gen", r, "end", status=s.get("status"), pages_done=s.get("pages_done"),
                     pages_total=s.get("pages_total"), error=s.get("error"))
                pending.discard(r)
    for r in REPOS:
        try:
            mark("gen", r, "exported", **export(r))
        except Exception as e:  # noqa: BLE001
            mark("gen", r, "export_failed", error=str(e)[:300])
        stop(r, "gen")


def post():
    subprocess.run([sys.executable, os.path.join(BENCH, "metrics.py"), SYSTEM, FOLDER], check=True)
    out = subprocess.run(["node", os.path.join(BENCH, "mermaid-check.mjs")] +
                         [os.path.join(W, FOLDER, f"{r}.md") for r in REPOS],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    res = json.loads(out)
    tot = sum(v["total"] for v in res.values())
    ok = sum(v["valid"] for v in res.values())
    res["_summary"] = {SYSTEM: round(100 * ok / tot, 1) if tot else None,
                       f"{SYSTEM}_by_repo": {k.split("/")[-1][:-3]: [v["valid"], v["total"]] for k, v in res.items() if k != "_summary"}}
    json.dump(res, open(os.path.join(W, f"mermaid-{TAG}.json"), "w"), indent=1)
    print(json.dumps(res["_summary"]))


def run_answers(repo, mode, workers, dw_url=None):
    env = {**os.environ, "GOOGLE_API_KEY": gemini_key(), "KT_ASK_PROVIDER": "litellm", "KT_ASK_MODEL": "deepseek-v4-flash"}
    if dw_url:
        env["DW_URL"] = dw_url
    log = open(os.path.join(LOGS, f"answers-{mode}-{repo}.log"), "a")
    mark(mode, repo, "start")
    subprocess.run([DWPY, "-W", "ignore", "answer.py", repo, SYSTEM, mode, str(workers)], cwd=BENCH, env=env,
                   stdout=log, stderr=subprocess.STDOUT)
    a = json.load(open(os.path.join(W, "answers", f"{repo}.{SYSTEM}.{mode}.json")))
    bad = sum(v["answer"].startswith(("ERROR", "Error processing question")) for v in a.values())
    mark(mode, repo, "end", answers=len(a), errors=bad)


def parallel(fn, *args):
    ts = [threading.Thread(target=fn, args=(r, *args)) for r in REPOS]
    for t in ts:
        t.start()
    for t in ts:
        t.join()


def ask():
    for r in REPOS:
        start(r, "ask")
    ts = [threading.Thread(target=run_answers, args=(r, "ask", 2, f"http://localhost:{PORTS[r]}")) for r in REPOS]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    for r in REPOS:
        stop(r, "ask")


def wiki():
    parallel(run_answers, "wiki", 3)


if __name__ == "__main__":
    steps = {"gen": [gen], "post": [post], "ask": [ask], "wiki": [wiki], "all": [gen, post, ask, wiki]}[sys.argv[1]]
    for s in steps:
        s()
