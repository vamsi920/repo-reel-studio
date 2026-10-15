"""Grade one variant's chat-bench runs with the study's own graders, writing to
per-variant files so other sessions' shared grade files are never touched.

    python grade_chat.py judge <variant>   # blind checklist judge (Gemini 2.5 Pro)
    CHAT_BENCH_TEMPLATES=... python grade_chat.py tests <variant>   # mutation grading

Outputs: chat/bench/out/<variant>-judge-grades.jsonl, chat/bench/out/<variant>-test-grades.json
"""
import os
import sys
from pathlib import Path

BENCH = Path("/Users/vamsi/Desktop/neodevex/repo-reel-studio/case-studies/chat/bench")
sys.path.insert(0, str(BENCH))
os.chdir(BENCH)
mode, variant = sys.argv[1], sys.argv[2]
sys.argv = sys.argv[:1]
if mode == "judge":
    import judge
    judge.OUT = BENCH / "out" / f"{variant}-judge-grades.jsonl"
    _answers = judge.answers
    judge.answers = lambda: (a for a in _answers() if a[2] == variant)
    judge.main()
else:
    import grade_all
    grade_all.GRADES = BENCH / "out" / f"{variant}-test-grades.json"
    _jobs = grade_all.jobs
    grade_all.jobs = lambda: (j for j in _jobs() if j["variant"] == variant)
    grade_all.main()
