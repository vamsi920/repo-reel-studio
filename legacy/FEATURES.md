# Legacy feature registry

Checklist for re-integrating each pre-fork feature into the new OpenHands-based
shell (root `src/`), one at a time. Nothing here is wired into the new shell yet.

| Feature | Legacy location | Status | Notes |
|---|---|---|---|
| Video KT / deterministic video pipeline | `legacy/src/lib/deterministicManifest.ts`, `legacy/src/lib/videoPipelineV2.ts`, `legacy/src/lib/videoPipelineEpic.ts`, `legacy/src/lib/videoTree.ts`, `legacy/src/lib/tutorialBlueprint.ts`, `legacy/src/lib/geminiDirector.ts`, `legacy/src/components/studio/RemotionVideo.tsx` + `VideoPreview.tsx`, `VideoTreeNavigator.tsx` | Dormant, standalone-runnable | Core differentiator — code-first manifest generation with source-cited narration. Remotion + Three.js rendering. |
| Proactive agent-ops | `legacy/server/proactive_*.py` (20+ modules), `legacy/server/opendevin_runner.py` / `opendevin_fallback.py`, `legacy/server/agent_runs.py`, `legacy/src/components/studio/agent-ops/**` | Dormant, standalone-runnable | Uses **OpenDevin** as the agent brain — a *different, older* integration than the new OpenHands Agent Canvas fork at repo root. Don't conflate the two. |
| Agent governance | `legacy/server/governance/` (`kernel.py`, `policy_engine.py`, `audit.py`), `legacy/server/governance_api.py` | Dormant, standalone-runnable | Policy engine + tamper-evident audit log for proactive agent actions. |
| Requirements engine / SME Desk | `legacy/server/requirements_engine.py`, `legacy/server/requirements_engine_app.py`, `legacy/src/pages/RequirementsOnboarding.tsx`, `legacy/src/components/requirements-onboarding/**`, `legacy/src/components/sme/**`, `legacy/src/lib/smeAgent.ts` | Dormant, standalone-runnable | Idea-to-project chat onboarding, separate from the repo-link flow. Routed at `/requirements/new`. |
| Journey strip / project memory | `legacy/src/components/journey/ProjectJourney.tsx`, `legacy/src/lib/projectMemory.ts`, `legacy/src/components/studio/ProjectMemoryPanel.tsx` | Dormant, standalone-runnable | Per-project memory surfaced in Studio. |
| Docker sandbox runner | `legacy/server/sandbox_runner.py`, `legacy/server/env_builder.py`, `legacy/server/proactive_sandbox_policy.py` | Dormant, standalone-runnable | Real per-run container isolation for agent-ops runs; degrades to host subprocess when Docker unavailable. |

## Not yet re-integrated, and no plan to touch automatically

Firebase/Supabase auth, AWS/Fly/Netlify deploy configs, Terraform (`infra/`
at repo root, untouched by the fork) — all still reference the legacy app
and were intentionally left alone this pass.
