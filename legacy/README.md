# Legacy NeoDevEx app (pre-fork)

This is the original repo-reel-studio product: the deterministic video-KT
pipeline, proactive agent-ops, agent governance, requirements engine, and SME
Desk — preserved intact here after the repo root was forked to run
[OpenHands Agent Canvas](https://github.com/OpenHands/OpenHands) as the new
platform shell (see root `UPSTREAM.md`).

Nothing in this directory was changed by the fork besides being moved here
with `git mv` (history is preserved — `git log --follow` still works on any
file). It runs standalone, independent of the new root app.

See [FEATURES.md](FEATURES.md) for a checklist of what lives here and is
queued for one-at-a-time re-integration into the new shell.

## Running standalone

```bash
cd legacy
npm install
npm run start   # boots UI (Vite, :8080) + ingestion API (:8787) + agent-ops API (:8788) + requirements API (:8790)
```

Or run pieces individually — see `docs/BACKEND_RUN_COMMANDS.txt` and
`docs/START_COMMANDS.txt` in this directory.

Python backend deps: `pip install -r server/requirements.txt`.

Env: this app reads from the repo root `.env` (the "Legacy app" section),
same as before the fork.

## Auth

Firebase/Supabase auth (`src/context/AuthContext.tsx`, `src/lib/db.ts`) is
dormant relative to the new root shell — it only applies when running this
app standalone.
