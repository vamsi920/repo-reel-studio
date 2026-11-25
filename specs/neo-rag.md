# Neo RAG — retrieval as a platform service

Status: **built (2026-11-25)** — see "What shipped" below; the rest of this
page is the design it follows. Spec IDs are stable; never renumber. Tag
code and tests with `// @spec RAG-0xx`.

## What shipped

- **Module** `/rag` (sidebar "RAG"): collections per team; a collection page
  with Sources (add / re-sync / remove, per-document list, live progress),
  Ask (answer with clickable citations or search only, re-rank and deep
  search toggles, why-retrieved ranks and timings), Quality (golden
  questions, recall@1/3/5 and MRR, run history) and Connect (API keys,
  MCP URL, curl example, one-click "Connect to agents").
- **Database** `supabase/migrations/20261124120000_neo_rag.sql` (applied):
  `rag_collections`, `rag_sources`, `rag_documents`, `rag_chunks`
  (`vector(1536)` HNSW + weighted `tsvector` GIN), `rag_api_keys` (no
  browser policies), `rag_queries`, `rag_eval_cases`, `rag_eval_runs`; RLS
  by `has_org_role`; `rag_hybrid_search` (RRF, service role only) and
  `rag_collection_stats`.
- **Service** Edge Function `rag` (`verify_jwt = false`, own auth: session
  JWT or `nrag_` key): `ingest`, `finish_sync`, `search`, `answer`,
  `list_collections`, `fetch_url` (SSRF-guarded, redirects re-checked),
  `github_files` (tarball, the user's GitHub token for private repos, public
  fallback), `create_key` / `list_keys` / `revoke_key`, and MCP over
  streamable HTTP at `/rag/mcp` (`rag_search`, `rag_answer`,
  `rag_list_collections`).
- **Engine** `src/lib/rag/` (pure): `chunk.ts` (markdown by heading trail,
  code by declaration with line ranges, prose by paragraph), `text.ts`
  (content hash, secret redaction), `citations.ts`, `evaluate.ts`.
- **Ingest** `src/services/rag-sync.ts`: sources upload, text, url, github,
  kt (store or Supabase), memory (active workspace records); batches of 200
  chunks; unchanged documents skipped by hash; complete listings prune.
- **Agents** `src/services/rag-agents.ts`: registers `neo-rag` as an HTTP
  MCP server with an `x-rag-key` header in the agent-server settings.

Not built yet: Jira/Confluence/Slack/Drive connectors (RAG-009 phase 3),
scheduled re-sync (RAG-005 runs on demand only), per-document ACLs beyond
team membership (RAG-006), GraphRAG and the local-only fallback (RAG-012),
switching KT Ask and Neo Brain onto the service.

## What RAG is, in one paragraph

A language model only knows what is in its prompt. RAG (retrieval-augmented
generation) means: before the model answers, look up the few passages from
_your_ material that are most relevant to the question, put them in the
prompt, and make the model answer from them and cite them. Building it has
two halves. **Ingest** (offline): read sources, cut them into chunks, turn
each chunk into an embedding (a vector of numbers where similar meaning is
close together), store chunk + vector + metadata. **Query** (online): embed
the question, find the nearest chunks (vector search) plus exact-word matches
(keyword search), merge and re-rank them, keep the best few within a token
budget, and generate an answer with citations. "Full capabilities" means
doing each step well and measuring it, not just "vector search + LLM".

## Why Neo needs it as a service, not a feature

Today every module that needs context invents its own:

| Module                                 | How it finds context today                                                                                 | Limit                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Workspace memory / Neo Brain           | `WorkspaceContextService.buildContext`, keyword + kind scoring over records                                | facts only, no documents or code                                              |
| KT docs                                | whole `INDEX.md` + 1–2 pages pinned to the prompt                                                          | no search inside pages                                                        |
| DeepWiki (KT generation, KT Ask panel) | its own FAISS pickle per repo (`~/.adalflow/databases/`), 350-word splits, `vendor/deepwiki-open/api/rag/` | code only, no permissions, browser calls it directly, not reachable by agents |
| CodeGraph                              | symbol/import/call graph shards in the sandbox (`.neodevex/codegraph/out/<sha>/`), Fuse search             | structure, not text; no semantic search                                       |
| Neo Synth documents                    | whole document text in 12k-char chunks via `describe`                                                      | the agent pages through everything                                            |
| Agents in conversations                | `grep` and file reads                                                                                      | fine for code, blind to docs, tickets, Slack, Confluence                      |

Already in the repo and never wired up (reuse, don't rebuild):

- `memory_embeddings(record_id, workspace_id, embedding vector(1536), model)`
  with an HNSW cosine index, RLS, and the `search_workspace_memory` RPC
  (SECURITY DEFINER, `is_workspace_member` inside). Nothing writes to it.
- `src/lib/data-platform/vector-store.ts` — a `VectorStore` interface
  (`searchWorkspaceMemory`, `upsertEmbedding`) with no callers.
- Environment registry `vector-store` connectors (Supabase pgvector default,
  Pinecone, Qdrant, Weaviate, Elasticsearch) through `connections-proxy` —
  the later "bring your own vector store" path.
- Synth document readers (`readDocument`, `toBlocks`, PII scrubbing).

One retrieval service, owned once, lets all of these ask the same question —
"what do we know about X in this team/workspace?" — and get ranked, cited,
permission-checked passages back.

## RAG-001 Where it lives (the placement decision)

Three layers, matching how the rest of Neo is built:

1. **Storage + search: Supabase Postgres.** `pgvector 0.8.2` (HNSW),
   `pgmq` (ingest queue) and `pg_cron` (re-sync schedule) are already
   installed on the NeoDevex project; Postgres full-text (`tsvector`) gives
   keyword search in the same query. No new database, no new vendor. Tables
   are org- and workspace-scoped and reuse `is_workspace_member` /
   `workspace_effective_role`, so team permissions apply to retrieval with no
   new rules (see Teams and Workspaces in AGENTS.md).
2. **Engine: a pure library, `src/lib/rag/`** (chunkers, query planning,
   fusion, re-rank, budget, citation checks), dependency-free like
   `src/lib/synth/`, so the browser, Edge Functions (Deno) and the Node
   sidecar can all import it and tests run without a network.
3. **Service: Edge Function `rag`** (`supabase/functions/rag/`) for
   `ingest`, `query`, `answer`, `delete`, `status`. Embedding keys stay
   server-side (same rule as `ai-guide`). Local stacks reach it through the
   same Supabase project; a local-only fallback is RAG-012.

Exposure (who can call it):

- **Agents**: an MCP server `neo-rag` registered into `mcp_config` the same
  way `ensureReaMcpServer` registers REA, with tools `rag_search`,
  `rag_answer`, `rag_sources`. Every conversation can then search team
  knowledge, not just the files on disk. A pointer line joins the KT/Brain
  pointers in the hidden memory block.
- **App modules**: `RagService` in `src/services/rag.ts` (browser), used by
  Neo Brain start context, KT Ask, Neo Test/ME/Synth `describe`.
- **People**: a **Knowledge ▸ Sources** page (not a new sidebar module):
  connect sources, see sync state and chunk counts, try a query and see
  exactly which passages were retrieved and why. Lives beside the existing
  Knowledge/KT pages because that is where users already look for "what Neo
  knows".

Not chosen: a separate vector DB (Qdrant/Weaviate/Pinecone) — another
service to run and secure for data that fits in Postgres at our scale;
reusing DeepWiki's FAISS — one index per DeepWiki server, no permissions, no
non-code sources.

## RAG-002 Data model

- `rag_sources(id, org_id, workspace_id null, kind, config jsonb, status,
last_synced_at, error)` — kind: `repo`, `kt`, `memory`, `upload`,
  `url`, `jira`, `confluence`, `github_issues`, `slack`, `gdrive`.
- `rag_documents(id, source_id, external_id, title, uri, mime, version_hash,
acl jsonb, updated_at)` — one row per file/page/ticket; `version_hash`
  makes re-sync incremental (unchanged documents are skipped).
- `rag_chunks(id, document_id, ordinal, text, tokens, heading_path,
embedding vector(1536), tsv tsvector, meta jsonb)` with an HNSW index on
  `embedding` and GIN on `tsv`.
- `rag_queries(id, org_id, query_hash, top_chunk_ids, latency_ms,
feedback)` — for evaluation and tuning; never the raw question if it was
  flagged by `scanForSecrets`.

Secrets are scrubbed before storage (`scanForSecrets`, `scrubFreeText` from
Synth's PII detector). A chunk never outlives its document: delete cascades.

## RAG-003 Ingest pipeline

`source → fetch → parse → chunk → enrich → embed → store`, one `pgmq` job per
document so a 5k-page Confluence space does not time out an Edge Function.

- **Parse**: reuse `src/lib/synth/documents/read.ts` (md, txt, html, docx,
  xlsx, pdf; `toBlocks` already gives heading-scoped blocks) for uploads; GitHub via the existing token path; Jira through
  `jira-api-proxy`; other connectors through `connections-proxy`.
- **Chunk by structure, not by character count**: markdown/docs by heading
  (keep `heading_path` like "Setup > Database"), code by symbol using KT's
  `extractSymbols` regions, tickets as title + description + comments,
  tables row-groups with their header repeated. Target ~400 tokens, 15%
  overlap only when a section must be split.
- **Enrich**: prepend a one-line context header to each chunk before
  embedding ("From repo acme/api, file src/auth.ts, function verifyToken") —
  the cheap version of contextual retrieval, measurably better recall.
- **Embed**: Gemini `gemini-embedding-001` at 1536 dims (matches the existing
  `memory_embeddings` column and stays under pgvector's 2000-dim HNSW limit;
  we already hold a Gemini key and DeepWiki's google embedder is the same
  model). Task types `RETRIEVAL_DOCUMENT` for chunks, `RETRIEVAL_QUERY` for
  questions. The model name and dimension are
  stored per chunk so a future model change re-embeds instead of mixing.

## RAG-004 Query pipeline

1. **Understand**: classify the question (lookup / how-to / why / compare),
   optionally rewrite it into 1–3 search queries (multi-query) — only when
   the first pass returns weak scores, to keep cost down.
2. **Retrieve, hybrid**: vector top-40 and full-text top-40 in one SQL
   function, filtered by org/workspace/source/ACL _inside_ the query.
3. **Fuse**: Reciprocal Rank Fusion of the two lists.
4. **Re-rank**: a cross-encoder or LLM re-rank of the top 20 (Gemini Flash,
   capped and cached), keep top 5–8.
5. **Expand**: pull neighbouring chunks of the same document when a hit is
   mid-section (small-to-big), dedupe overlaps.
6. **Budget**: fit into a caller-given token budget (default 2k), best first.
7. **Answer** (`answer` only): grounded prompt, every claim cites `[n]`;
   `src/lib/rag/citations.ts` checks each cited chunk was actually supplied
   and says "not found in the connected sources" instead of guessing.

## RAG-005 Freshness

`pg_cron` enqueues re-syncs per source (repos on push via the GitHub event
bridge, KT on every generation through `exportKtToWorkspace`'s hook, memory
on record write, connectors hourly). Only documents whose `version_hash`
changed are re-chunked and re-embedded.

## RAG-006 Permissions

A user or agent only retrieves chunks from workspaces they can reach
(`workspace_effective_role`) and documents whose source ACL allows them
(e.g. a private Confluence space). Enforced in SQL, never in the browser.

## RAG-007 Evaluation (how we know it is good)

A golden set per source type (question, expected document/chunk, expected
answer facts). `npm run rag:eval` reports recall@5, MRR, answer faithfulness
(every sentence supported by a cited chunk) and latency/cost per query. The
neo-qa-fixture repo (Taskly) and this repo's own `docs/kt` are the first
golden sets. A change to chunking or ranking ships only if recall@5 does not
drop.

## RAG-008 Observability

Each query records latency per stage, chunk ids, scores and cost; AgentOps
shows `rag.search` spans on runs that used the MCP tools (`tool.*`
conventions, no new instrumentor).

## RAG-009..011 Phases

- **Phase 1 — core (1 week)**: migration, `src/lib/rag` engine, Edge
  Function ingest/query for `upload`, `repo`, `kt`, `memory`; hybrid +
  RRF; fill the existing `memory_embeddings` and implement the idle
  `VectorStore`; Sources page with "try a query"; eval harness on the
  fixture. First consumer: the KT Ask panel answers from RAG with citations
  instead of DeepWiki's per-server index.
- **Phase 2 — agents (3–4 days)**: `neo-rag` MCP server, pointer in the
  memory block, Neo Brain/KT Ask/Test `describe` switched to `RagService`,
  AgentOps spans.
- **Phase 3 — connectors + quality (1 week)**: Jira, GitHub issues and
  Slack (manifests exist), then Confluence and Google Drive (no connector
  manifest yet; new manifests in `src/lib/environment/registry/`); re-rank, multi-query, small-to-big,
  grounded `answer` with citation check; scheduled re-sync.
- **Phase 4 — advanced**: GraphRAG over CodeGraph + KT (entity and
  relation hops for "what calls X / who owns Y"), per-team tuning from
  feedback, image/diagram captions.

## RAG-012 Local-only fallback

Desktop "Run on this computer" with no Supabase: same `src/lib/rag` engine
over SQLite + FTS5 with an in-process vector scan, in the AgentOps-style
sidecar pattern (`scripts/rag-server.mjs`, port in `config/defaults.json`,
mounted at `/api/rag` by `ingress.mjs`). Phase 4; not needed for launch.

## Open decisions

1. Embedding model: Gemini `gemini-embedding-001` (default) vs an open model
   (bge-m3 / nomic-embed) served locally — affects RAG-012 and cost.
2. Re-ranker: LLM re-rank (no new infra) vs a hosted cross-encoder
   (Cohere/Voyage/Jina, better quality, a new vendor key).
3. First connectors after repos/KT/uploads: Jira + Confluence or GitHub
   issues + Slack.
