<!-- GENERATED FILE -- edit config/environment-requirements.json instead.
     Regenerate with: npm run docs:env -->

# Environment variables

Every variable this deployment reads, grouped by where it is set. Generated from the requirement graph that also drives the Environment section in the app (`/environment`) and `npm run preflight`.

## Frontend build (Netlify environment variables)

`VITE_*` variables are baked into the bundle at build time and are visible to anyone who loads the app. Never put a service-role key or any other server secret here. Changing one of these requires a redeploy, not just a restart.

| Variable | Secret | Expected | Notes |
| --- | --- | --- | --- |
| `VITE_BACKEND_BASE_URL` | no | — |  |
| `VITE_SESSION_API_KEY` | yes | — |  |
| `VITE_SUPABASE_URL` | no | — |  |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | no | — |  |
| `VITE_DEEPWIKI_SERVICE_URL` | no | — |  |

## Agent-server container (Fly secrets / Docker env)

Set with `fly secrets set` on the agent-server app. `OH_SECRET_KEY` is generated and persisted automatically on first boot if unset.

| Variable | Secret | Expected | Notes |
| --- | --- | --- | --- |
| `LOCAL_BACKEND_API_KEY` | yes | — |  |
| `OH_SECRET_KEY` | yes | — | Auto-generated on first boot if unset. |
| `FILE_STORE` | no | `local` |  |

## Supabase Edge Function secrets

Set with `supabase secrets set`. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform and do not need to be set by hand.

| Variable | Secret | Expected | Notes |
| --- | --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | — |  |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | yes | — |  |
| `CONNECTION_SECRET_ENCRYPTION_KEY` | yes | — |  |
| `APP_ORIGIN` | no | — |  |

## Variables that must match each other

Nothing syncs these automatically. Drift is the single most common cause of a broken install, and it does not look like a configuration error — it looks like intermittent authentication failures.

- `VITE_SESSION_API_KEY` (netlify) **must equal** `LOCAL_BACKEND_API_KEY` (fly).
  Nothing syncs these. Drift produces 401s on authenticated endpoints ONLY, so /health still returns 200 and the failure looks random. Verified by the backend-key probe hitting an authenticated endpoint.

## Outbound network

Required from the host running the agent-server. `npm run preflight` verifies these from that host — an egress check run anywhere else describes a different network.

| Host | Port | Mirrorable |
| --- | --- | --- |
| `api.github.com` | 443 | no |
| `github.com` | 443 | no |
| `registry.npmjs.org` | 443 | yes |
| `nodejs.org` | 443 | yes |
| `pypi.org` | 443 | yes |
| `astral.sh` | 443 | yes |
| `ghcr.io` | 443 | yes |
| `fonts.googleapis.com` | 443 | yes |

Feature-dependent hosts (needed only when the listed feature is used):

| Host | Port | Required for |
| --- | --- | --- |
| `generativelanguage.googleapis.com` | 443 | `conversation.start`, `knowledge.deepwiki` |
| `api.openai.com` | 443 | `conversation.start` |
| `auth.atlassian.com` | 443 | `automations.jira-trigger` |
| `api.atlassian.com` | 443 | `automations.jira-trigger` |
| `us.i.posthog.com` | 443 | `telemetry` |
| `app.all-hands.dev` | 443 | `backend.cloud` |

Hosts marked mirrorable can be pointed at an internal registry through `ENVIRONMENT_MIRRORS`, e.g. `{"registry.npmjs.org":"nexus.corp/npm"}`. The rest cannot; an air-gapped install must replace the capability instead (for example, a self-hosted LLM in place of `generativelanguage.googleapis.com`).

## Host prerequisites

| Binary | Minimum | Required |
| --- | --- | --- |
| `node` | 22.12.0 | yes |
| `git` | — | yes |
| `uvx` | — | yes |
| `python3` | 3.11.0 | yes |
| `npx` | — | yes |
| `docker` | — | optional |

## Postgres extensions

| Extension | Required |
| --- | --- |
| `vector` | yes |
| `pgcrypto` | yes |
| `pg_cron` | yes |
| `pg_net` | yes |
| `pgmq` | optional |
| `supabase_vault` | yes |

