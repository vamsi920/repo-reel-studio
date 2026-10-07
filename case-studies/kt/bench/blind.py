"""Blinded grading packets.

    python blind.py prep <repo> <mode> <tag>

Pairs .work/answers/<repo>.neodevex-<tag>.<mode>.json with
<repo>.devin.<mode>.json, shuffles the two per question as X / Y, and writes
.work/grading/<repo>.<mode>-<tag>.packet.json plus the matching .key.json
(label -> system). Graders write <name>.graded.json and <name>.graded-b.json
next to the packet; case-studies/kt/build.py unblinds and scores them.
"""
import json
import os
import random
import sys

W = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".work")


def prep(repo, mode, tag):
    gt = json.load(open(os.path.join(W, "groundtruth", f"{repo}.json")))
    ours = json.load(open(os.path.join(W, "answers", f"{repo}.neodevex-{tag}.{mode}.json")))
    devin = json.load(open(os.path.join(W, "answers", f"{repo}.devin.{mode}.json")))
    rng = random.Random(f"{repo}{mode}{tag}")
    packet, key = [], {}
    for q in gt["questions"]:
        pair = [("neodevex", ours[q["id"]]["answer"]), ("devin", devin[q["id"]]["answer"])]
        rng.shuffle(pair)
        key[q["id"]] = {"X": pair[0][0], "Y": pair[1][0]}
        packet.append({
            "id": q["id"], "category": q["category"], "question": q["question"],
            "reference_answer": q["answer"], "key_facts": q["key_facts"],
            "wrong_but_plausible": q.get("wrong_but_plausible"), "evidence": q["evidence"],
            "X": pair[0][1], "Y": pair[1][1],
        })
    name = f"{repo}.{mode}-{tag}"
    json.dump(packet, open(os.path.join(W, "grading", f"{name}.packet.json"), "w"), indent=1)
    json.dump(key, open(os.path.join(W, "grading", f"{name}.key.json"), "w"), indent=1)
    print(name, len(packet))


if __name__ == "__main__":
    assert sys.argv[1] == "prep"
    prep(*sys.argv[2:5])
