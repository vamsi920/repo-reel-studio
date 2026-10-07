"""Answer every ground-truth question with one system, one way.

    python answer.py <repo> <system> <mode> [workers]

system: devin | neodevex-<tag>   (e.g. neodevex-v3)
mode:   wiki  a neutral reader (Gemini 2.5 Flash, temperature 0, same prompt
              for both systems) answers from the generated wiki text only
        ask   the product's own repository Q&A
              devin    -> DeepWiki MCP ask_wiki_question
              neodevex -> KT service /chat/completions/stream at $DW_URL

Reads .work/groundtruth/<repo>.json and .work/<devin|ours-tag>/<repo>.md,
writes .work/answers/<repo>.<system>.<mode>.json. Re-running only redoes
missing or errored answers.
"""
import concurrent.futures as cf
import json
import os
import sys
import time
import urllib.request

import devin_mcp

W = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".work")
REPOS = {"ky": ("sindresorhus", "ky"), "flask": ("pallets", "flask"), "hono": ("honojs", "hono")}
DW_URL = os.environ.get("DW_URL", "http://localhost:8011")
READER_MODEL = "gemini-2.5-flash"
READER_PROMPT = """You are a new engineer onboarding to a codebase. You have ONLY the documentation below.
Answer the question using ONLY this documentation. Do not use prior knowledge of the project.
If the documentation does not contain the answer, reply exactly: NOT COVERED
Be concise (max 120 words). Include file paths if the documentation gives them.

<documentation>
{doc}
</documentation>

Question: {q}"""
ERROR_PREFIXES = ("ERROR", "Error processing question")


def reader(doc, q):
    import google.generativeai as genai

    genai.configure(api_key=os.environ["GOOGLE_API_KEY"])
    model = genai.GenerativeModel(READER_MODEL, generation_config={"temperature": 0})
    err = None
    for attempt in range(6):
        try:
            return model.generate_content(READER_PROMPT.format(doc=doc, q=q)).text.strip()
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(10 * (attempt + 1))
    return f"ERROR: {err}"


def devin_ask(owner, repo, q):
    err = None
    for attempt in range(5):
        try:
            text = devin_mcp.call("ask_wiki_question", {"repoName": f"{owner}/{repo}", "question": q})
            if text.startswith("Error processing question"):
                raise RuntimeError(text[:200])
            return text
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(30 * (attempt + 1))
    return f"ERROR: {err}"


def ours_ask(owner, repo, q):
    body = json.dumps({
        "repo_url": f"https://github.com/{owner}/{repo}", "type": "github", "provider": "google",
        "model": "gemini-2.5-pro", "messages": [{"role": "user", "content": q}],
    }).encode()
    err = None
    for _ in range(3):
        try:
            req = urllib.request.Request(f"{DW_URL}/chat/completions/stream", body, {"content-type": "application/json"})
            with urllib.request.urlopen(req, timeout=600) as r:
                return r.read().decode().strip()
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(10)
    return f"ERROR: {err}"


def main(name, system, mode, workers=3):
    owner, repo = REPOS[name]
    gt = json.load(open(os.path.join(W, "groundtruth", f"{name}.json")))
    out = os.path.join(W, "answers", f"{name}.{system}.{mode}.json")
    done = json.load(open(out)) if os.path.exists(out) else {}
    if mode == "wiki":
        folder = "devin" if system == "devin" else "ours-" + system.split("-", 1)[1]
        doc = open(os.path.join(W, folder, f"{name}.md")).read()

    def one(item):
        t0 = time.time()
        if mode == "wiki":
            ans = reader(doc, item["question"])
        elif system == "devin":
            ans = devin_ask(owner, repo, item["question"])
        else:
            ans = ours_ask(owner, repo, item["question"])
        return item["id"], {"answer": ans, "seconds": round(time.time() - t0, 1)}

    todo = [q for q in gt["questions"] if q["id"] not in done or done[q["id"]]["answer"].startswith(ERROR_PREFIXES)]
    with cf.ThreadPoolExecutor(workers) as ex:
        for qid, res in ex.map(one, todo):
            done[qid] = res
            json.dump(done, open(out, "w"), indent=1)
    bad = sum(v["answer"].startswith(ERROR_PREFIXES) for v in done.values())
    print(name, system, mode, len(done), "answers,", bad, "errors")


if __name__ == "__main__":
    main(*sys.argv[1:4], *(int(x) for x in sys.argv[4:5]))
