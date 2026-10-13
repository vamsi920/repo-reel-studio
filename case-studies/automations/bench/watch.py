"""Poll NeoDevEx automation runs and GitHub PRs; log timestamped changes.

    python3 watch.py <neodevex-automation-id> [...]

Appends one JSON line per observed change to .work/watch.jsonl:
  - NeoDevEx run status transitions (from /api/automation/v1/{id}/runs)
  - pull requests opened on the fixture repo (title, author, branch, created_at)
Stops after WATCH_MINUTES (default 60).
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

W = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".work")
REPO = "vamsi920/automation-bench"
BASE = os.environ.get("NEO_URL", "http://localhost:8000")
KEY = open(os.path.expanduser("~/.openhands/agent-canvas/api-key.txt")).read().strip()


def log(**rec):
    rec["t"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with open(os.path.join(W, "watch.jsonl"), "a") as fh:
        fh.write(json.dumps(rec) + "\n")
    print(json.dumps(rec), flush=True)


def neo_runs(aid):
    req = urllib.request.Request(f"{BASE}/api/automation/v1/{aid}/runs?limit=20", headers={"X-Session-API-Key": KEY})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.load(r)
    return data.get("runs", data.get("items", [])) if isinstance(data, dict) else data


def prs():
    out = subprocess.run(
        ["gh", "pr", "list", "-R", REPO, "--state", "all", "--limit", "100",
         "--json", "number,title,author,headRefName,createdAt,state"],
        capture_output=True, text=True, timeout=60,
    )
    return json.loads(out.stdout or "[]")


def main(ids):
    seen_runs, seen_prs = {}, {p["number"] for p in prs()}
    deadline = time.time() + 60 * int(os.environ.get("WATCH_MINUTES", 60))
    while time.time() < deadline:
        for aid in ids:
            try:
                for run in neo_runs(aid):
                    key = run["id"]
                    state = (run.get("status"), run.get("started_at"), run.get("completed_at"), run.get("error_detail"))
                    if seen_runs.get(key) != state:
                        seen_runs[key] = state
                        log(kind="neo_run", automation=aid, run=key, status=run.get("status"),
                            created_at=run.get("created_at"), started_at=run.get("started_at"),
                            completed_at=run.get("completed_at"), conversation_id=run.get("conversation_id"),
                            error=run.get("error_detail"))
            except Exception as e:  # noqa: BLE001
                log(kind="neo_error", automation=aid, error=str(e)[:200])
        try:
            for p in prs():
                if p["number"] not in seen_prs:
                    seen_prs.add(p["number"])
                    log(kind="pr", number=p["number"], title=p["title"], author=p["author"]["login"],
                        branch=p["headRefName"], created_at=p["createdAt"])
        except Exception as e:  # noqa: BLE001
            log(kind="gh_error", error=str(e)[:200])
        time.sleep(15)


if __name__ == "__main__":
    main(sys.argv[1:])
