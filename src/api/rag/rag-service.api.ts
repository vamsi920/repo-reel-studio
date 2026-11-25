/**
 * Neo RAG client (specs/neo-rag.md).
 *
 * Two paths:
 * - Plain reads and small writes (collections, sources, documents, eval
 *   cases) go straight to Supabase tables under RLS: team members, viewers
 *   read only.
 * - Everything that needs a secret or the service role (embedding, ingest,
 *   search, answers, API keys, fetching URLs and GitHub repositories) goes
 *   to the `rag` Edge Function with the signed-in user's session.
 *
 * Edge calls use their own fetch with a long timeout: the shared Supabase
 * client aborts after 8 s, and embedding a batch or generating an answer
 * takes longer than that.
 */
import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";
import { resolveOrgId } from "#/lib/data-platform/repositories/repository-identity";

export type RagSourceKind =
  | "upload"
  | "text"
  | "url"
  | "github"
  | "kt"
  | "memory";
export type RagSourceStatus = "pending" | "syncing" | "ready" | "error";

export interface RagCollection {
  id: string;
  org_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  source_count: number;
  document_count: number;
  chunk_count: number;
  last_synced_at: string | null;
}

export interface RagSource {
  id: string;
  collection_id: string;
  org_id: string;
  kind: RagSourceKind;
  name: string;
  config: Record<string, unknown>;
  status: RagSourceStatus;
  error: string | null;
  document_count: number;
  chunk_count: number;
  last_synced_at: string | null;
  created_at: string;
}

export interface RagDocument {
  id: string;
  source_id: string;
  external_id: string;
  title: string;
  uri: string | null;
  mime: string | null;
  token_count: number;
  chunk_count: number;
  updated_at: string;
}

export interface RagHit {
  n: number;
  chunk_id: string;
  document_id: string;
  source_id: string;
  collection_id: string;
  title: string;
  uri: string | null;
  heading_path: string;
  source_kind: RagSourceKind;
  source_name: string;
  content: string;
  score: number;
  vector_rank: number | null;
  text_rank: number | null;
  vector_similarity: number | null;
  rerank_score: number | null;
}

export interface RagTimings {
  retrieve_ms?: number;
  expand_ms?: number;
  rerank_ms?: number;
  generate_ms?: number;
  total_ms?: number;
}

export interface RagSearchResponse {
  query: string;
  results: RagHit[];
  timings: RagTimings;
}

export interface RagAnswerResponse {
  query: string;
  answer: string;
  found: boolean;
  cited: number[];
  invalid_citations: number[];
  sources: RagHit[];
  timings: RagTimings;
}

export interface RagQueryOptions {
  k?: number;
  rerank?: boolean;
  expand?: boolean;
  history?: { role: "user" | "assistant"; content: string }[];
}

export interface RagApiKey {
  id: string;
  name: string;
  prefix: string;
  collection_ids: string[] | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface RagEvalCase {
  id: string;
  collection_id: string;
  question: string;
  expected: string;
  created_at: string;
}

export interface RagEvalRun {
  id: string;
  collection_id: string;
  metrics: Record<string, number>;
  cases: unknown[];
  created_at: string;
}

export interface IngestDocumentPayload {
  external_id: string;
  title: string;
  uri?: string | null;
  mime?: string | null;
  version_hash: string;
  meta?: Record<string, unknown>;
  chunks: { content: string; heading_path: string; tokens: number }[];
}

export class RagServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "RagServiceError";
  }
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "";
const RAG_FUNCTION_PATH = "/functions/v1/rag";
const EDGE_TIMEOUT_MS = 120_000;

export function isRagAvailable(): boolean {
  return isSupabaseConfigured && Boolean(supabase);
}

/** Base URL of the service, for API and MCP instructions. */
export function ragServiceUrl(): string {
  return `${SUPABASE_URL}${RAG_FUNCTION_PATH}`;
}

export function ragMcpUrl(): string {
  return `${ragServiceUrl()}/mcp`;
}

function client() {
  if (!supabase) throw new RagServiceError("not_configured", 503);
  return supabase;
}

async function callRag<T>(
  action: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data } = await client().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new RagServiceError("unauthorized", 401);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EDGE_TIMEOUT_MS);
  try {
    const res = await fetch(ragServiceUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        apikey: PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ action, ...body }),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!res.ok) {
      throw new RagServiceError(
        String(json.error ?? "request_failed"),
        res.status,
        typeof json.detail === "string" ? json.detail : undefined,
      );
    }
    return json as T;
  } catch (error) {
    if (error instanceof RagServiceError) throw error;
    throw new RagServiceError(
      controller.signal.aborted ? "timeout" : "network_error",
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}

function check<T>(result: {
  data: T | null;
  error: { message: string } | null;
}): T {
  if (result.error)
    throw new RagServiceError("db_error", 500, result.error.message);
  return result.data as T;
}

async function requireOrgId(): Promise<string> {
  const orgId = await resolveOrgId();
  if (!orgId) throw new RagServiceError("no_team", 403);
  return orgId;
}

export const RagService = {
  async activeOrgId(): Promise<string> {
    return requireOrgId();
  },

  async listCollections(): Promise<RagCollection[]> {
    const orgId = await requireOrgId();
    const rows = check(
      await client()
        .from("rag_collections")
        .select("id, org_id, name, description, created_at, updated_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false }),
    ) as Omit<
      RagCollection,
      "source_count" | "document_count" | "chunk_count" | "last_synced_at"
    >[];
    const stats = check(
      await client().rpc("rag_collection_stats", { p_org_id: orgId }),
    ) as {
      collection_id: string;
      source_count: number;
      document_count: number;
      chunk_count: number;
      last_synced_at: string | null;
    }[];
    const byId = new Map(stats.map((s) => [s.collection_id, s]));
    return rows.map((row) => {
      const s = byId.get(row.id);
      return {
        ...row,
        source_count: Number(s?.source_count ?? 0),
        document_count: Number(s?.document_count ?? 0),
        chunk_count: Number(s?.chunk_count ?? 0),
        last_synced_at: s?.last_synced_at ?? null,
      };
    });
  },

  async getCollection(id: string): Promise<RagCollection | null> {
    const all = await RagService.listCollections();
    return all.find((c) => c.id === id) ?? null;
  },

  async createCollection(
    name: string,
    description: string,
  ): Promise<{ id: string }> {
    const orgId = await requireOrgId();
    return check(
      await client()
        .from("rag_collections")
        .insert({
          org_id: orgId,
          name: name.trim(),
          description: description.trim(),
        })
        .select("id")
        .single(),
    ) as { id: string };
  },

  async updateCollection(
    id: string,
    patch: { name?: string; description?: string },
  ) {
    check(
      await client()
        .from("rag_collections")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id),
    );
  },

  async deleteCollection(id: string): Promise<void> {
    check(await client().from("rag_collections").delete().eq("id", id));
  },

  async listSources(collectionId: string): Promise<RagSource[]> {
    return check(
      await client()
        .from("rag_sources")
        .select("*")
        .eq("collection_id", collectionId)
        .order("created_at", { ascending: true }),
    ) as RagSource[];
  },

  async createSource(
    collectionId: string,
    orgId: string,
    kind: RagSourceKind,
    name: string,
    config: Record<string, unknown>,
  ): Promise<RagSource> {
    return check(
      await client()
        .from("rag_sources")
        .insert({
          collection_id: collectionId,
          org_id: orgId,
          kind,
          name: name.slice(0, 300),
          config,
        })
        .select("*")
        .single(),
    ) as RagSource;
  },

  async markSourceSyncing(id: string): Promise<void> {
    check(
      await client()
        .from("rag_sources")
        .update({ status: "syncing", error: null })
        .eq("id", id),
    );
  },

  async deleteSource(id: string): Promise<void> {
    check(await client().from("rag_sources").delete().eq("id", id));
  },

  async listDocuments(sourceId: string): Promise<RagDocument[]> {
    return check(
      await client()
        .from("rag_documents")
        .select(
          "id, source_id, external_id, title, uri, mime, token_count, chunk_count, updated_at",
        )
        .eq("source_id", sourceId)
        .order("title")
        .limit(500),
    ) as RagDocument[];
  },

  ingest(sourceId: string, documents: IngestDocumentPayload[]) {
    return callRag<{ written: number; skipped: number; chunks: number }>(
      "ingest",
      {
        source_id: sourceId,
        documents,
      },
    );
  },

  finishSync(
    sourceId: string,
    keepExternalIds: string[] | null,
    error?: string,
  ) {
    return callRag<{ removed: number; documents: number; chunks: number }>(
      "finish_sync",
      {
        source_id: sourceId,
        ...(keepExternalIds ? { keep_external_ids: keepExternalIds } : {}),
        ...(error ? { error } : {}),
      },
    );
  },

  search(
    collectionIds: string[],
    query: string,
    options: RagQueryOptions = {},
  ) {
    return callRag<RagSearchResponse>("search", {
      collection_ids: collectionIds,
      query,
      ...options,
    });
  },

  answer(
    collectionIds: string[],
    query: string,
    options: RagQueryOptions = {},
  ) {
    return callRag<RagAnswerResponse>("answer", {
      collection_ids: collectionIds,
      query,
      ...options,
    });
  },

  fetchUrl(url: string) {
    return callRag<{ url: string; mime: string; title: string; text: string }>(
      "fetch_url",
      { url },
    );
  },

  githubFiles(repository: string, ref?: string) {
    return callRag<{
      repository: string;
      ref: string | null;
      files: { path: string; content: string; sha: string }[];
      skipped: number;
      private_access: boolean;
    }>("github_files", { repository, ...(ref ? { ref } : {}) });
  },

  async createApiKey(name: string, collectionIds: string[] | null) {
    const orgId = await requireOrgId();
    return callRag<RagApiKey & { key: string }>("create_key", {
      org_id: orgId,
      name,
      collection_ids: collectionIds,
    });
  },

  async listApiKeys(): Promise<RagApiKey[]> {
    const orgId = await requireOrgId();
    return (
      await callRag<{ keys: RagApiKey[] }>("list_keys", { org_id: orgId })
    ).keys;
  },

  revokeApiKey(id: string) {
    return callRag<{ revoked: boolean }>("revoke_key", { id });
  },

  async listEvalCases(collectionId: string): Promise<RagEvalCase[]> {
    return check(
      await client()
        .from("rag_eval_cases")
        .select("id, collection_id, question, expected, created_at")
        .eq("collection_id", collectionId)
        .order("created_at"),
    ) as RagEvalCase[];
  },

  async addEvalCase(
    collectionId: string,
    orgId: string,
    question: string,
    expected: string,
  ) {
    check(
      await client().from("rag_eval_cases").insert({
        collection_id: collectionId,
        org_id: orgId,
        question: question.trim(),
        expected: expected.trim(),
      }),
    );
  },

  async deleteEvalCase(id: string): Promise<void> {
    check(await client().from("rag_eval_cases").delete().eq("id", id));
  },

  async listEvalRuns(collectionId: string): Promise<RagEvalRun[]> {
    return check(
      await client()
        .from("rag_eval_runs")
        .select("id, collection_id, metrics, cases, created_at")
        .eq("collection_id", collectionId)
        .order("created_at", { ascending: false })
        .limit(10),
    ) as RagEvalRun[];
  },

  async saveEvalRun(
    collectionId: string,
    orgId: string,
    metrics: object,
    cases: unknown[],
  ) {
    check(
      await client()
        .from("rag_eval_runs")
        .insert({ collection_id: collectionId, org_id: orgId, metrics, cases }),
    );
  },
};
