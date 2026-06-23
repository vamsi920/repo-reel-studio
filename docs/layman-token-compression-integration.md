# Layman token compression integration (pass 01/40)

**Scope:** Planning only — no runtime behavior changes in this pass.  
**Source:** [vamsi920/layman](https://github.com/vamsi920/layman) (`layman-compress/` scripts + SKILL), inspected 2026-05-27. Do **not** vendor the full layman repo; reuse ideas and optional CLI/skill install.

---

## Core ideas to reuse (from layman-compress)

| Piece | Role | Token cost |
|-------|------|------------|
| `detect.py` | Extension + line heuristics → compress only natural-language `.md`/`.txt` | **Zero** (local) |
| `compress.py` | Claude simplifies prose; backs up `FILE.original.md`; overwrites source on success | **High** (LLM) |
| `validate.py` | Deterministic checks: headings, fenced code, URLs, paths, bullet drift | **Zero** |
| Retry loop | Up to 2 validation failures → targeted `build_fix_prompt` cherry-picks, not full recompress | Medium |
| Sensitive refuse | Denylist paths/names (`.env`, keys, `credentials`, `.ssh`, etc.) before any API send | — |

**Layman vs Caveman (README):**

- **Layman Summary / Explain** — human handoffs (Done, Why, What changed, Check this).
- **Brief modes** (`lite`, `full`, `ultra`, `wenyan`) — token-saving agent replies; built on Caveman-style compression.

**Compression rules (SKILL):** strip filler/hedging; preserve code fences, inline backticks, URLs, paths, commands, headings, tables; simplify prose only.

---

## Reel Studio integration points (high token spend)

Already partially optimized:

- `server/caveman_helper.py` — local regex prose compression for prompts/PR bodies when `CAVEMAN_HELPER_*` enabled.
- `server/opendevin_runner.py` — `compress_prompt_sections()` on OpenDevin task prompts.
- `server/agent_runs.py` — `measure_prompt()` on legacy plan/critique + Gemini JSON calls.

**Additional expensive surfaces:**

| Area | Files / flows | Why tokens hurt |
|------|----------------|-----------------|
| Agent task prompts | `opendevin_runner._build_task_prompt`, `agent_runs` plan/critique | Large issue bodies + repo context per run |
| Proactive discovery | `proactive_discovery_scan.py`, `proactive_ai_console.py` | Gemini prompts with scan summaries |
| Video / script pipeline | `src/lib/videoPipelineV2.ts` | Long generation + readability prompts |
| Studio UI copy | `AgentRunsPanel.tsx` reviewer prompts, run transcripts | Large rendered strings (UI only unless sent upstream) |
| Docs / audits | `docs/*.md`, agent-ops audits | Fed into agent context when attached |
| Run persistence | `server/.agent-runs/*/run.json`, proactive workspaces | Bloated handoffs if stored verbatim |

**Pass 01 recommendation:** treat layman-compress as **offline/docs + memory-file** tool first; extend `caveman_helper` or a thin `layman_compress_helper.py` for **online** prompt sections only after validate parity on samples.

---

## Risks

1. **Third-party API** — `compress.py` sends full file to Anthropic; must keep sensitive refuse + never compress `.env` / key material (align with layman `is_sensitive_path`).
2. **Validation gaps** — path regex is heuristic; false warnings on bullet count; heading text may change with warnings only.
3. **Dual systems** — Caveman-lite (local) vs Layman-compress (LLM) vs Layman Summary (agent skill) can fight each other; define precedence: local first, LLM for docs only unless flag set.
4. **Destructive overwrite** — failed runs restore original; existing `.original.md` blocks re-run (data-loss guard).
5. **Meaning loss** — aggressive brief modes bad for billing/compliance strings; exclude structured JSON and API payloads from compression.
6. **No vendoring** — pin skill install version (`npx skills add vamsi920/layman`) or copy only `detect.py` + `validate.py` if offline validation needed without full package.

---

## 39-step implementation checklist (passes 02–40)

1. Document env vars: `LAYMAN_MODEL`, `ANTHROPIC_API_KEY`, optional CLI fallback.
2. Add `docs/LAYMAN_COMPRESSION_POLICY.md` — what may be compressed vs forbidden.
3. Inventory top 10 largest prompts in `agent_runs.py` / `opendevin_runner.py` (log sampling).
4. Map each inventory item to local (`caveman_helper`) vs LLM (`layman-compress`) vs neither.
5. Install layman skill for Cursor/Codex devs only (`npx skills add vamsi920/layman -a cursor`) — not in prod bundle.
6. Add npm/pnpm script `compress:doc` wrapping `python3 -m scripts` with path arg (external layman clone or submodule path in dev).
7. Pilot compress `docs/agent-ops-ui-redesign-audit.md` → validate with `validate.py`.
8. Pilot compress `docs/proactive-agent-stability-audit.md` → same.
9. Compare token count before/after for one OpenDevin task prompt built from compressed audits.
10. Extend `caveman_helper.compress_prose` with layman filler list from SKILL (no new dependency).
11. Add `compress_markdown_file(path)` wrapper calling detect → skip if not NL.
12. Wire optional post-run hook: compress run summary markdown artifact only.
13. Add metrics field `laymanCompressRatio` next to existing `caveman` metrics in run JSON.
14. Gate LLM compress behind `LAYMAN_COMPRESS_ENABLED=1` default off in production.
15. Unit test: `detect.py` logic ported or subprocess on fixture files.
16. Unit test: sensitive path refuse (`.env`, `id_rsa`, `secrets.yaml`).
17. Unit test: code fence preserved through validate on golden pair.
18. Never call compress on `run.json` or structured API bodies.
19. Add allowlist for compressible doc paths under `docs/`.
20. Exclude `server/.agent-runs/**` from compress CLI glob.
21. Exclude `server/.proactive-agent-ops/**` workspaces from compress.
22. Add Layman Summary template to agent completion messages (skill-only, no code).
23. Document `/layman brief` for internal Slack handoffs from studio operators.
24. Review `videoPipelineV2.ts` prompts — mark sections safe for `compress_prose` only.
25. Add max input size guard (500KB) consistent with layman `compress.py`.
26. Implement bullet-drift warning threshold policy (15%) for auto-accept vs human review.
27. Add CI check: no `.original.md` committed (gitignore `*.original.md`).
28. Add CI check: compressed docs still pass markdown link check.
29. Benchmark one proactive discovery scan with shortened context hints.
30. Benchmark one full agent run wall-clock with caveman-only vs caveman+layman sample.
31. Security review: confirm no compress path logs file contents at info level.
32. Add operator rollback doc: restore from `FILE.original.md`.
33. Integrate `validate.py` into optional pre-commit for `docs/*.md` when `LAYMAN_PRECOMMIT=1`.
34. Add feature flag in studio UI to show Layman-formatted run summary (read-only).
35. Pass 20–30: repeat rendered/token audit per major studio surface (mirror restaurant-agent responsive discipline).
36. Pass 35: compress remaining long `docs/*.md` with human sign-off.
37. Pass 38: align naming — Layman handoff vs Caveman metrics in UI labels.
38. Pass 39: full regression `npm run verify:proactive` + agent run smoke.
39. Pass 40: final audit doc — token savings table, blockers, rollout recommendation.

---

## Pass 01 deliverable

This file only. No changes to `server/caveman_helper.py`, agents, or UI until pass 02.
