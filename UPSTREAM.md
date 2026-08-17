# Upstream: OpenHands Agent Canvas

This repo's root app (`src/`, `public/`, `config/`, etc.) is a vendored fork of
OpenHands' **Agent Canvas** — a self-hosted developer control center for
coding agents and automations.

- Upstream: https://github.com/OpenHands/OpenHands
- Vendored tag: `v1.13.0`
- Vendored commit: `4f465f3ccada5271a3bbe4a0148941b0c40d243b`
- Vendoring method: plain copy (not `git subtree`) of the full repo root —
  the npm package `@openhands/agent-canvas` is published from the monorepo
  root itself, not a subpath.
- Date vendored: 2026-08-17

## What changed from upstream

- NeoDevEx theming (colors, fonts, brand strings) — see `src/themes/color-themes.ts`,
  `hero.ts`, `src/tailwind.css`.
- A default Gemini LLM profile is seeded automatically when `VITE_GEMINI_API_KEY`
  is present in the environment (see `src/` Gemini-seed integration — grep
  `neodevex` or `gemini-default-profile` for the entry point).
- A repo-link/project onboarding surface extending the stock landing screen.

## Pulling future upstream updates

This is a plain vendored copy, not a subtree, so updates aren't automatic.
To port a future upstream release:

1. Clone upstream fresh, checkout the new tag.
2. Diff it against the commit recorded above to see what changed upstream.
3. Manually port relevant changes into this repo's root, being careful to
   preserve the NeoDevEx-specific modifications listed above.
4. Update the "Vendored tag" / "Vendored commit" fields in this file.

## What's still using the old (pre-fork) stack

Everything under [`legacy/`](legacy/README.md) — the original video-KT app,
Python/Node backend, and its own deploy configs — is untouched and unrelated
to this vendoring.
