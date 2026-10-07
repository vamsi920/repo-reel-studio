"""Export generated KT wikis from the service cache into .work/<folder>/.

    python export.py <folder> [repo ...]     e.g. python export.py ours-v3

Writes <repo>.md (pages in structure order, each under "# Page: <title>")
and <repo>.json (the raw cache entry, including measured usage).
"""
import json
import os
import sys

W = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".work")
KEYS = {
    "ky": "sindresorhus_ky_en_e0fcf780de2bd69af2528e4b7b87ccae6bb727b1",
    "flask": "pallets_flask_en_258d68b6ff5e2244386540f48b48bab90d6ab827",
    "hono": "honojs_hono_en_24547a6ed5e175f9326063efb657540162287973",
}

if __name__ == "__main__":
    folder, *repos = sys.argv[1:]
    os.makedirs(os.path.join(W, folder), exist_ok=True)
    for name in repos or KEYS:
        d = json.load(open(os.path.expanduser(f"~/.adalflow/wikicache/deepwiki_cache_github_{KEYS[name]}.json")))
        pages = [d["generated_pages"][p["id"]] for p in d["wiki_structure"]["pages"] if p["id"] in d["generated_pages"]]
        with open(os.path.join(W, folder, f"{name}.md"), "w") as fh:
            fh.write("\n".join(f"# Page: {p['title']}\n\n{p['content']}\n" for p in pages))
        json.dump(d, open(os.path.join(W, folder, f"{name}.json"), "w"))
        u = d.get("usage") or {}
        print(name, len(pages), "pages", u.get("total_cost_usd"), "USD", round(u.get("duration_ms", 0) / 60000, 1), "min")
