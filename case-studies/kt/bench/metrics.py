"""Structural and citation metrics for generated wikis.

    python metrics.py <system> <folder> [repo ...]

e.g. `python metrics.py devin devin` or `python metrics.py neodevex-v3 ours-v3`.
A citation is valid when the cited path exists at the pinned commit and the
line range lies inside the file. Also writes a random sample of inline
citations (claim text + cited range) for blind semantic checking.
Output: .work/metrics/<repo>.<system>.json and <repo>.<system>.cite_sample.json
"""
import json
import os
import random
import re
import subprocess
import sys

W = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".work")
CITE = re.compile(r"\[([^\]\s]+?):(\d+)(?:-(\d+))?\]\(([^)]*)\)")
COMMITS = {"ky": "e0fcf780", "flask": "258d68b6", "hono": "24547a6e"}
SAMPLE = int(os.environ.get("CITE_SAMPLE", 40))
_cache = {}


def file_lines(repo, commit, path):
    key = (repo, path)
    if key not in _cache:
        r = subprocess.run(["git", "-C", os.path.join(W, "repos", repo), "show", f"{commit}:{path}"], capture_output=True)
        _cache[key] = None if r.returncode else r.stdout.decode("utf-8", "replace").splitlines()
    return _cache[key]


def pages_of(md):
    parts = re.split(r"^# Page: (.+)$", md, flags=re.M)
    return [(parts[i].strip(), parts[i + 1]) for i in range(1, len(parts), 2)]


def measure(repo, system, folder):
    md = open(os.path.join(W, folder, f"{repo}.md")).read()
    commit = COMMITS[repo]
    cites, bad = [], []
    for title, body in pages_of(md):
        for m in CITE.finditer(body):
            path, a, b, link = m.group(1), int(m.group(2)), int(m.group(3) or m.group(2)), m.group(4)
            lines = file_lines(repo, commit, path)
            ok = lines is not None and 1 <= a <= b <= max(len(lines), 1)
            line = body[body.rfind("\n", 0, m.start()) + 1:m.start()]
            inline = not re.match(r"\s*(\*\*)?Sources?:", line) and not re.fullmatch(r"[\s,\[\]():\w./-]*", line)
            claim = body[max(0, m.start() - 400):m.start()].split("\n\n")[-1][-400:]
            cites.append({"page": title, "path": path, "start": a, "end": b, "link": link, "ok": ok, "inline": inline, "claim": claim})
            if not ok:
                bad.append(f"{path}:{a}-{b}" + ("" if lines is not None else " (missing file)"))
    words = len(re.findall(r"\w+", md))
    valid = sum(c["ok"] for c in cites)
    out = {
        "repo": repo, "system": system, "pages": len(pages_of(md)), "words": words,
        "citations": len(cites), "citations_valid": valid,
        "citation_validity": round(valid / len(cites), 4) if cites else None,
        "unique_files_cited": len({c["path"] for c in cites if c["ok"]}),
        "inline_citations": sum(c["inline"] for c in cites),
        "mermaid_diagrams": md.count("```mermaid"),
        "links_pinned_to_commit": sum(commit[:7] in c["link"] for c in cites),
        "error_pages": len(re.findall(r"Error with \w+ API|Error generating content", md)),
        "invalid_examples": bad[:15],
    }
    json.dump(out, open(os.path.join(W, "metrics", f"{repo}.{system}.json"), "w"), indent=1)
    pool = [c for c in cites if c["ok"] and c["inline"] and len(c["claim"]) > 60]
    random.seed(7)
    json.dump(random.sample(pool, min(SAMPLE, len(pool))),
              open(os.path.join(W, "metrics", f"{repo}.{system}.cite_sample.json"), "w"), indent=1)
    print(json.dumps({k: v for k, v in out.items() if k != "invalid_examples"}))


if __name__ == "__main__":
    system, folder, *repos = sys.argv[1:]
    for r in repos or COMMITS:
        measure(r, system, folder)
