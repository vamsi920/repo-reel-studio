"""Blind citation-support packets for the dsv4f wiki, same shape as round 1's
<repo>.cites-qwen3.*: 40 inline citations from neodevex-dsv4f (metrics.py
sample, seed 7) + Devin's same 40 sampled citations, shuffled; packet items
{n, claim, cited}, key = list of systems."""
import json
import os
import random

W = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "kt", ".work"))
for repo in ("ky", "flask", "hono"):
    items = []
    for system in ("neodevex-dsv4f", "devin"):
        for c in json.load(open(os.path.join(W, "metrics", f"{repo}.{system}.cite_sample.json"))):
            items.append((system, {"claim": c["claim"], "cited": f"{c['path']}:{c['start']}-{c['end']}"}))
    random.Random(f"{repo}cites-dsv4f").shuffle(items)
    packet = [{"n": i, **it} for i, (_, it) in enumerate(items)]
    key = [s for s, _ in items]
    json.dump(packet, open(os.path.join(W, "grading", f"{repo}.cites-dsv4f.packet.json"), "w"), indent=1)
    json.dump(key, open(os.path.join(W, "grading", f"{repo}.cites-dsv4f.key.json"), "w"), indent=1)
    print(repo, len(packet), key.count("neodevex-dsv4f"), key.count("devin"))
