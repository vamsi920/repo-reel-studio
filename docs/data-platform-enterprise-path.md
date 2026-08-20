# Data platform: enterprise path

Brief notes on what the current Supabase integration buys for a future enterprise deployment, and what would actually need to change.

## What changes for enterprise

- **SSO/SAML** via Supabase Auth's enterprise features, replacing simple email/password sign-in — additive to the existing `orgs`/`workspaces`/`workspace_members` model, not a schema change.
- **Data residency / customer-owned project** — a customer requiring their own Supabase project (or eventually their own Postgres) is a configuration change, not a rewrite, provided the interface boundary below is respected.

## What doesn't change

Every feature in `src/` depends on the interfaces in `src/lib/data-platform/` (`WorkspaceRepository`, `MemoryRepository`, `ActivityStore`, `AgentOpsRepository`, `KnowledgePersistenceRepository`, `AutomationMetadataRepository`, `UsageRepository`, `ArtifactStore`, `VectorStore`, `JobQueue`) — never on `@supabase/supabase-js` directly. This is the same pattern `src/lib/knowledge/knowledge-engine.ts` already uses to keep DeepWiki swappable behind `RepositoryKnowledgeEngine`. A future enterprise backend is a new set of implementations behind these same interfaces, not a rewrite of every consumer.

## Concrete follow-up: runtime config resolution

Today, `src/lib/data-platform/client.ts` resolves `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` at **build time** (standard Vite `import.meta.env` behavior). That's correct for a single-tenant SaaS deployment, but a white-label/multi-project future (each customer pointed at their own Supabase project from the same static bundle) needs this resolved at **runtime** instead — the same shape `src/api/backend-registry/` already uses to resolve the agent-server host at runtime rather than build time. This is the one concrete piece of follow-up work; nothing else in the current design assumes build-time-only configuration.

## Bring-your-own-Postgres path

Because the interface layer never leaks `supabase.from()` outside `src/lib/data-platform/`, and the schema itself is standard PostgreSQL (RLS, `pgvector`, `pgmq` — no Supabase-proprietary syntax beyond `auth.uid()`, which any Postgres-compatible auth layer can provide), a future non-Supabase Postgres-compatible backend is a swap of the `Supabase*` implementation classes for a different backend's implementations, not a schema rewrite or a caller rewrite.
