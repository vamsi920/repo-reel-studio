/**
 * Neo RAG service (specs/neo-rag.md).
 *
 * One Edge Function, three audiences:
 * - the Neo app (Supabase session JWT in `Authorization`),
 * - any HTTP client (`x-rag-key: nrag_...` API key),
 * - agents over MCP (`POST .../rag/mcp`, JSON-RPC, same API key).
 *
 * The browser parses and chunks documents (src/lib/rag); this function owns
 * everything that needs a secret or the service role: embeddings, writes to
 * rag_chunks, hybrid search, re-ranking, grounded answers, API keys, URL and
 * GitHub fetching. Every action checks the caller's team role itself before
 * touching a collection, because the service role bypasses RLS.
 *
 * verify_jwt is off for this function (it accepts API keys), so an absent or
 * invalid credential is rejected here, never by the gateway.
 */
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * SSRF guard for `fetch_url`, same list as `_shared/template.ts`
 * (kept inline so this function deploys as a single file). Every redirect
 * hop is re-checked by the caller.
 */
const BLOCKED_HOSTS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^0\./,
  /^169\.254\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /\.internal$/i,
  /\.local$/i,
  /^metadata(\.|$)/i,
];
function assertHostAllowed(urlString: string): void {
  const host = new URL(urlString).hostname.toLowerCase();
  if (host.startsWith("[")) throw new Error("blocked_host"); // no IPv6 literals
  if (BLOCKED_HOSTS.some((p) => p.test(host))) throw new Error("blocked_host");
}

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMS = 1536;
const GEN_MODEL = Deno.env.get("RAG_MODEL") ?? "gemini-2.5-flash";
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_REQUEST_BYTES = 3_000_000;
const MAX_CHUNKS_PER_INGEST = 250;
const MAX_CHUNK_CHARS = 8000;
const MAX_QUERY_CHARS = 2000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
const KEY_PREFIX = "nrag_";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-rag-key, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

class RagError extends Error {
  constructor(public code: string, public status = 400, message?: string) {
    super(message ?? code);
  }
}

// ---------------------------------------------------------------- clients --

function admin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function geminiKey(): string {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new RagError("not_configured", 503);
  return key;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ------------------------------------------------------------------- auth --

const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

interface Caller {
  kind: "user" | "key";
  userId: string | null;
  /** Set for API keys: the only team the key can reach. */
  keyOrgId: string | null;
  /** Set for API keys limited to some collections. */
  keyCollections: string[] | null;
  keyId: string | null;
  actor: string;
}

function presentedKey(req: Request): string | null {
  const header = req.headers.get("x-rag-key");
  if (header?.startsWith(KEY_PREFIX)) return header.trim();
  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  return bearer.startsWith(KEY_PREFIX) ? bearer : null;
}

async function authenticate(req: Request, db: SupabaseClient): Promise<Caller> {
  const key = presentedKey(req);
  if (key) {
    const { data } = await db
      .from("rag_api_keys")
      .select("id, org_id, collection_ids, revoked_at")
      .eq("key_hash", await sha256Hex(key))
      .maybeSingle();
    if (!data || data.revoked_at) throw new RagError("invalid_api_key", 401);
    await db
      .from("rag_api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id);
    return {
      kind: "key",
      userId: null,
      keyOrgId: data.org_id,
      keyCollections: data.collection_ids ?? null,
      keyId: data.id,
      actor: `key:${data.id}`,
    };
  }
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new RagError("unauthorized", 401);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) throw new RagError("unauthorized", 401);
  return {
    kind: "user",
    userId: user.id,
    keyOrgId: null,
    keyCollections: null,
    keyId: null,
    actor: `user:${user.id}`,
  };
}

async function roleIn(
  db: SupabaseClient,
  caller: Caller,
  orgId: string,
): Promise<number> {
  if (caller.kind === "key") return caller.keyOrgId === orgId ? 2 : 0;
  const { data } = await db
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", caller.userId)
    .maybeSingle();
  return ROLE_RANK[data?.role ?? ""] ?? 0;
}

async function requireOrgRole(
  db: SupabaseClient,
  caller: Caller,
  orgId: string,
  min: "viewer" | "member",
): Promise<void> {
  if ((await roleIn(db, caller, orgId)) < ROLE_RANK[min]) {
    throw new RagError("forbidden", 403);
  }
}

/** Collections the caller may read, from the ids it asked for. */
async function readableCollections(
  db: SupabaseClient,
  caller: Caller,
  ids: unknown,
): Promise<{ id: string; org_id: string; name: string }[]> {
  let query = db.from("rag_collections").select("id, org_id, name");
  if (Array.isArray(ids) && ids.length > 0) {
    query = query.in("id", ids.map(String).slice(0, 20));
  } else if (caller.kind === "key") {
    query = query.eq("org_id", caller.keyOrgId!);
  } else {
    throw new RagError("collection_ids_required");
  }
  const { data, error } = await query;
  if (error) throw new RagError("db_error", 500, error.message);
  const allowed = [];
  for (const row of data ?? []) {
    if (
      caller.kind === "key" &&
      caller.keyCollections &&
      !caller.keyCollections.includes(row.id)
    ) {
      continue;
    }
    if ((await roleIn(db, caller, row.org_id)) >= ROLE_RANK.viewer) {
      allowed.push(row);
    }
  }
  if (allowed.length === 0) throw new RagError("no_accessible_collections", 403);
  return allowed;
}

async function writableSource(
  db: SupabaseClient,
  caller: Caller,
  sourceId: unknown,
) {
  if (typeof sourceId !== "string") throw new RagError("source_id_required");
  const { data } = await db
    .from("rag_sources")
    .select("id, collection_id, org_id, name, kind")
    .eq("id", sourceId)
    .maybeSingle();
  if (!data) throw new RagError("source_not_found", 404);
  if (caller.kind === "key") throw new RagError("forbidden", 403);
  await requireOrgRole(db, caller, data.org_id, "member");
  return data;
}

// ------------------------------------------------------------ rate limits --

const recent = new Map<string, number[]>();
function rateLimited(actor: string): boolean {
  const now = Date.now();
  const calls = (recent.get(actor) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  calls.push(now);
  recent.set(actor, calls);
  return calls.length > RATE_MAX;
}

// ----------------------------------------------------------------- gemini --

async function embed(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await fetch(`${GEMINI}/${EMBED_MODEL}:batchEmbedContents`, {
      method: "POST",
      headers: { "x-goog-api-key": geminiKey(), "content-type": "application/json" },
      body: JSON.stringify({
        requests: batch.map((text) => ({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: EMBED_DIMS,
        })),
      }),
    });
    if (!res.ok) {
      throw new RagError("embedding_failed", 502, `${res.status} ${(await res.text()).slice(0, 300)}`);
    }
    const body = await res.json();
    for (const e of body.embeddings ?? []) out.push(normalize(e.values));
  }
  return out;
}

/** Truncated Gemini embeddings are not unit length; cosine does not care, but keep them tidy. */
function normalize(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0)) || 1;
  return values.map((v) => v / norm);
}

async function generate(
  prompt: string,
  opts: { json?: boolean; thinking?: number; maxTokens?: number } = {},
): Promise<string> {
  const res = await fetch(`${GEMINI}/${GEN_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": geminiKey(), "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: opts.maxTokens ?? 2048,
        ...(opts.json ? { responseMimeType: "application/json" } : {}),
        thinkingConfig: { thinkingBudget: opts.thinking ?? 0 },
      },
    }),
  });
  if (!res.ok) {
    throw new RagError("generation_failed", 502, `${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const body = await res.json();
  return (body.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("");
}

// ----------------------------------------------------------------- ingest --

interface IngestChunk {
  content: string;
  heading_path?: string;
  tokens?: number;
}
interface IngestDocument {
  external_id: string;
  title: string;
  uri?: string | null;
  mime?: string | null;
  version_hash: string;
  meta?: Record<string, unknown>;
  chunks: IngestChunk[];
}

function contextualText(title: string, heading: string, content: string): string {
  const where = heading ? `${title} > ${heading}` : title;
  return `${where}\n\n${content}`;
}

async function ingest(db: SupabaseClient, caller: Caller, body: Record<string, unknown>) {
  const source = await writableSource(db, caller, body.source_id);
  const documents = (Array.isArray(body.documents) ? body.documents : []) as IngestDocument[];
  const total = documents.reduce((n, d) => n + (d.chunks?.length ?? 0), 0);
  if (total > MAX_CHUNKS_PER_INGEST) throw new RagError("too_many_chunks", 413);

  await db.from("rag_sources").update({ status: "syncing", error: null }).eq("id", source.id);

  let written = 0;
  let skipped = 0;
  let chunksWritten = 0;
  for (const doc of documents) {
    if (!doc?.external_id || !doc.title || !doc.version_hash) {
      throw new RagError("invalid_document");
    }
    const { data: existing } = await db
      .from("rag_documents")
      .select("id, version_hash, chunk_count")
      .eq("source_id", source.id)
      .eq("external_id", doc.external_id)
      .maybeSingle();
    if (existing && existing.version_hash === doc.version_hash && existing.chunk_count > 0) {
      skipped += 1;
      continue;
    }
    const chunks = (doc.chunks ?? [])
      .map((c) => ({
        content: String(c.content ?? "").slice(0, MAX_CHUNK_CHARS),
        heading_path: String(c.heading_path ?? "").slice(0, 500),
        tokens: Number(c.tokens) || Math.ceil(String(c.content ?? "").length / 4),
      }))
      .filter((c) => c.content.trim().length > 0);
    const vectors = chunks.length
      ? await embed(
          chunks.map((c) => contextualText(doc.title, c.heading_path, c.content)),
          "RETRIEVAL_DOCUMENT",
        )
      : [];
    const docRow = {
      source_id: source.id,
      collection_id: source.collection_id,
      org_id: source.org_id,
      external_id: String(doc.external_id).slice(0, 1000),
      title: String(doc.title).slice(0, 500),
      uri: doc.uri ?? null,
      mime: doc.mime ?? null,
      version_hash: String(doc.version_hash).slice(0, 128),
      token_count: chunks.reduce((n, c) => n + c.tokens, 0),
      chunk_count: chunks.length,
      meta: doc.meta ?? {},
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error: docError } = await db
      .from("rag_documents")
      .upsert(docRow, { onConflict: "source_id,external_id" })
      .select("id")
      .single();
    if (docError || !saved) throw new RagError("db_error", 500, docError?.message);
    await db.from("rag_chunks").delete().eq("document_id", saved.id);
    if (chunks.length) {
      const { error } = await db.from("rag_chunks").insert(
        chunks.map((c, i) => ({
          document_id: saved.id,
          source_id: source.id,
          collection_id: source.collection_id,
          org_id: source.org_id,
          ordinal: i,
          content: c.content,
          heading_path: c.heading_path,
          tokens: c.tokens,
          embedding: JSON.stringify(vectors[i]),
          embed_model: `${EMBED_MODEL}@${EMBED_DIMS}`,
        })),
      );
      if (error) throw new RagError("db_error", 500, error.message);
    }
    written += 1;
    chunksWritten += chunks.length;
  }
  return { written, skipped, chunks: chunksWritten };
}

async function finishSync(db: SupabaseClient, caller: Caller, body: Record<string, unknown>) {
  const source = await writableSource(db, caller, body.source_id);
  let removed = 0;
  if (Array.isArray(body.keep_external_ids)) {
    const keep = new Set(body.keep_external_ids.map(String));
    const { data: docs } = await db
      .from("rag_documents")
      .select("id, external_id")
      .eq("source_id", source.id);
    const stale = (docs ?? []).filter((d) => !keep.has(d.external_id)).map((d) => d.id);
    for (let i = 0; i < stale.length; i += 200) {
      await db.from("rag_documents").delete().in("id", stale.slice(i, i + 200));
    }
    removed = stale.length;
  }
  const { count: documentCount } = await db
    .from("rag_documents")
    .select("id", { count: "exact", head: true })
    .eq("source_id", source.id);
  const { count: chunkCount } = await db
    .from("rag_chunks")
    .select("id", { count: "exact", head: true })
    .eq("source_id", source.id);
  const error = typeof body.error === "string" && body.error ? body.error.slice(0, 1000) : null;
  await db
    .from("rag_sources")
    .update({
      status: error ? "error" : "ready",
      error,
      document_count: documentCount ?? 0,
      chunk_count: chunkCount ?? 0,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", source.id);
  return { removed, documents: documentCount ?? 0, chunks: chunkCount ?? 0 };
}

// ----------------------------------------------------------------- search --

interface Hit {
  chunk_id: string;
  document_id: string;
  source_id: string;
  collection_id: string;
  ordinal: number;
  content: string;
  heading_path: string;
  tokens: number;
  title: string;
  uri: string | null;
  source_kind: string;
  source_name: string;
  vector_rank: number | null;
  text_rank: number | null;
  vector_similarity: number | null;
  score: number;
  rerank_score?: number;
}

async function hybrid(
  db: SupabaseClient,
  collectionIds: string[],
  query: string,
  count: number,
): Promise<Hit[]> {
  const [vector] = await embed([query], "RETRIEVAL_QUERY");
  const { data, error } = await db.rpc("rag_hybrid_search", {
    p_collection_ids: collectionIds,
    p_query_embedding: JSON.stringify(vector),
    p_query_text: query,
    p_match_count: count,
    p_candidates: Math.max(40, count * 3),
  });
  if (error) throw new RagError("search_failed", 500, error.message);
  return (data ?? []) as Hit[];
}

/** Multi-query: a few rephrasings fused with RRF across the lists. */
async function rephrase(query: string): Promise<string[]> {
  try {
    const raw = await generate(
      `Rewrite this search question into 2 alternative search queries that use different words (synonyms, likely identifiers, the underlying concept). Return a JSON array of 2 strings only.\n\nQuestion: ${query}`,
      { json: true, maxTokens: 200 },
    );
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).slice(0, 2) : [];
  } catch {
    return [];
  }
}

function fuseLists(lists: Hit[][], count: number): Hit[] {
  const byId = new Map<string, Hit & { fused: number }>();
  for (const list of lists) {
    list.forEach((hit, rank) => {
      const prev = byId.get(hit.chunk_id);
      const add = 1 / (60 + rank + 1);
      if (prev) prev.fused += add;
      else byId.set(hit.chunk_id, { ...hit, fused: add });
    });
  }
  return [...byId.values()]
    .sort((a, b) => b.fused - a.fused)
    .slice(0, count)
    .map(({ fused, ...hit }) => ({ ...hit, score: fused }));
}

/** LLM re-rank: scores each candidate 0..3 for how well it answers. */
async function rerank(query: string, hits: Hit[]): Promise<Hit[]> {
  if (hits.length < 2) return hits;
  try {
    const passages = hits
      .map((h, i) => `[${i}] ${h.title}${h.heading_path ? ` > ${h.heading_path}` : ""}\n${h.content.slice(0, 700)}`)
      .join("\n\n");
    const raw = await generate(
      `Score how useful each passage is for answering the question: 3 = directly answers it, 2 = clearly relevant, 1 = loosely related, 0 = unrelated. Return a JSON array of objects {"i": number, "s": number} covering every passage.\n\nQuestion: ${query}\n\nPassages:\n${passages}`,
      { json: true, maxTokens: 800 },
    );
    const scores = new Map<number, number>();
    for (const item of JSON.parse(raw)) scores.set(Number(item.i), Number(item.s));
    return hits
      .map((h, i) => ({ ...h, rerank_score: scores.get(i) ?? 0 }))
      .sort((a, b) => (b.rerank_score! - a.rerank_score!) || b.score - a.score);
  } catch {
    return hits;
  }
}

async function retrieve(
  db: SupabaseClient,
  caller: Caller,
  body: Record<string, unknown>,
  defaults: { k: number; rerank: boolean },
) {
  const query = String(body.query ?? "").trim().slice(0, MAX_QUERY_CHARS);
  if (query.length < 2) throw new RagError("query_required");
  const collections = await readableCollections(db, caller, body.collection_ids ?? (body.collection_id ? [body.collection_id] : undefined));
  const ids = collections.map((c) => c.id);
  const k = Math.min(Math.max(Number(body.k) || defaults.k, 1), 20);
  const useRerank = body.rerank === undefined ? defaults.rerank : Boolean(body.rerank);
  const timings: Record<string, number> = {};
  let t = Date.now();

  const pool = useRerank ? Math.max(k * 3, 15) : k;
  let hits = await hybrid(db, ids, query, pool);
  timings.retrieve_ms = Date.now() - t;
  if (body.expand) {
    t = Date.now();
    const alternatives = await rephrase(query);
    const lists = [hits];
    for (const alt of alternatives) lists.push(await hybrid(db, ids, alt, pool));
    hits = fuseLists(lists, pool);
    timings.expand_ms = Date.now() - t;
  }
  if (useRerank) {
    t = Date.now();
    hits = await rerank(query, hits);
    timings.rerank_ms = Date.now() - t;
  }
  return { query, collections, hits: hits.slice(0, k), timings };
}

/** Small-to-big: the chunks just before and after a hit, from the same document. */
async function withNeighbours(db: SupabaseClient, hits: Hit[], top = 3): Promise<Map<string, string>> {
  const expanded = new Map<string, string>();
  for (const hit of hits.slice(0, top)) {
    const { data } = await db
      .from("rag_chunks")
      .select("ordinal, content")
      .eq("document_id", hit.document_id)
      .gte("ordinal", hit.ordinal - 1)
      .lte("ordinal", hit.ordinal + 1)
      .order("ordinal");
    if (data && data.length > 1) {
      expanded.set(hit.chunk_id, data.map((r) => r.content).join("\n"));
    }
  }
  return expanded;
}

function publicHit(hit: Hit, n: number) {
  return {
    n,
    chunk_id: hit.chunk_id,
    document_id: hit.document_id,
    source_id: hit.source_id,
    collection_id: hit.collection_id,
    title: hit.title,
    uri: hit.uri,
    heading_path: hit.heading_path,
    source_kind: hit.source_kind,
    source_name: hit.source_name,
    content: hit.content,
    score: Number(hit.score.toFixed(5)),
    vector_rank: hit.vector_rank,
    text_rank: hit.text_rank,
    vector_similarity: hit.vector_similarity === null ? null : Number(hit.vector_similarity.toFixed(4)),
    rerank_score: hit.rerank_score ?? null,
  };
}

const NOT_FOUND = "I could not find this in the connected sources.";

async function answer(db: SupabaseClient, caller: Caller, body: Record<string, unknown>) {
  const result = await retrieve(db, caller, body, { k: 6, rerank: true });
  let t = Date.now();
  const relevant = result.hits.filter((h) => h.rerank_score === undefined || h.rerank_score > 0);
  if (relevant.length === 0) {
    return { ...result, answer: NOT_FOUND, found: false, sources: [], cited: [], invalid_citations: [] };
  }
  const expanded = await withNeighbours(db, relevant);
  const sources = relevant
    .map((h, i) => `[${i + 1}] ${h.title}${h.heading_path ? ` > ${h.heading_path}` : ""}${h.uri ? ` (${h.uri})` : ""}\n${expanded.get(h.chunk_id) ?? h.content}`)
    .join("\n\n---\n\n");
  const history = Array.isArray(body.history)
    ? (body.history as { role?: string; content?: string }[])
        .slice(-6)
        .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${String(m.content ?? "").slice(0, 1500)}`)
        .join("\n")
    : "";
  const text = await generate(
    [
      "You answer questions for a software team using ONLY the numbered sources below.",
      "Rules:",
      "- Every sentence that states a fact must end with the source number(s) in brackets, like [1] or [2][3].",
      "- Use only facts that appear in the sources. Do not use outside knowledge.",
      `- If the sources do not contain the answer, reply exactly: ${NOT_FOUND}`,
      "- If the sources only partly answer, answer that part and say what is missing.",
      "- Be concise. Quote identifiers, commands and paths exactly as written in the sources.",
      history ? `\nConversation so far:\n${history}` : "",
      `\nSources:\n${sources}`,
      `\nQuestion: ${result.query}`,
    ].join("\n"),
    { thinking: 512, maxTokens: 2048 },
  );
  result.timings.generate_ms = Date.now() - t;
  t = Date.now();
  const cited = [...new Set([...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))];
  const invalid = cited.filter((n) => n < 1 || n > relevant.length);
  const found = !text.includes(NOT_FOUND);
  return {
    ...result,
    hits: relevant,
    answer: text.trim(),
    found,
    cited: cited.filter((n) => !invalid.includes(n)),
    invalid_citations: invalid,
  };
}

async function logQuery(
  db: SupabaseClient,
  caller: Caller,
  channel: "app" | "api" | "mcp",
  mode: "search" | "answer",
  result: { query: string; collections: { id: string; org_id: string }[]; hits: Hit[]; timings: Record<string, number> },
  started: number,
) {
  try {
    await db.from("rag_queries").insert({
      org_id: result.collections[0].org_id,
      collection_ids: result.collections.map((c) => c.id),
      actor: caller.actor,
      channel,
      mode,
      query_hash: await sha256Hex(result.query),
      query_chars: result.query.length,
      result_count: result.hits.length,
      top_chunk_ids: result.hits.slice(0, 10).map((h) => h.chunk_id),
      latency_ms: Date.now() - started,
      timings: result.timings,
    });
  } catch {
    // Logging must never fail a query.
  }
}

// ------------------------------------------------------------------- keys --

async function createKey(db: SupabaseClient, caller: Caller, body: Record<string, unknown>) {
  if (caller.kind !== "user") throw new RagError("forbidden", 403);
  const orgId = String(body.org_id ?? "");
  await requireOrgRole(db, caller, orgId, "member");
  const name = String(body.name ?? "").trim().slice(0, 120) || "API key";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const secret = KEY_PREFIX + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const collectionIds = Array.isArray(body.collection_ids) && body.collection_ids.length
    ? body.collection_ids.map(String)
    : null;
  const { data, error } = await db
    .from("rag_api_keys")
    .insert({
      org_id: orgId,
      name,
      prefix: secret.slice(0, 12),
      key_hash: await sha256Hex(secret),
      collection_ids: collectionIds,
      created_by: caller.userId,
    })
    .select("id, name, prefix, collection_ids, created_at")
    .single();
  if (error) throw new RagError("db_error", 500, error.message);
  return { key: secret, ...data };
}

async function listKeys(db: SupabaseClient, caller: Caller, body: Record<string, unknown>) {
  if (caller.kind !== "user") throw new RagError("forbidden", 403);
  const orgId = String(body.org_id ?? "");
  await requireOrgRole(db, caller, orgId, "member");
  const { data } = await db
    .from("rag_api_keys")
    .select("id, name, prefix, collection_ids, created_at, last_used_at, revoked_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  return { keys: data ?? [] };
}

async function revokeKey(db: SupabaseClient, caller: Caller, body: Record<string, unknown>) {
  if (caller.kind !== "user") throw new RagError("forbidden", 403);
  const { data } = await db.from("rag_api_keys").select("id, org_id").eq("id", String(body.id ?? "")).maybeSingle();
  if (!data) throw new RagError("key_not_found", 404);
  await requireOrgRole(db, caller, data.org_id, "member");
  await db.from("rag_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", data.id);
  return { revoked: true };
}

// --------------------------------------------------------------- fetchers --

function htmlToText(html: string): { title: string; text: string } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const text = html
    .replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level, inner) => `\n\n${"#".repeat(Number(level))} ${inner.replace(/<[^>]+>/g, "").trim()}\n\n`)
    .replace(/<(br|\/p|\/div|\/li|\/tr)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
  return { title, text };
}

async function fetchUrl(caller: Caller, body: Record<string, unknown>) {
  if (caller.kind !== "user") throw new RagError("forbidden", 403);
  let url = String(body.url ?? "");
  for (let hop = 0; hop < 4; hop += 1) {
    if (!/^https?:\/\//i.test(url)) throw new RagError("invalid_url");
    try {
      assertHostAllowed(url);
    } catch {
      throw new RagError("blocked_host", 400);
    }
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": "NeoRAG/1.0 (+https://neodevex.com)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    if (!res.ok) throw new RagError("fetch_failed", 502, `HTTP ${res.status}`);
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    const raw = (await res.text()).slice(0, 2_000_000);
    if (mime.includes("html")) {
      const page = htmlToText(raw);
      return { url, mime, title: page.title || url, text: page.text };
    }
    if (mime.startsWith("text/") || mime.includes("json") || mime.includes("markdown")) {
      return { url, mime, title: url.split("/").pop() || url, text: raw };
    }
    throw new RagError("unsupported_content_type", 415, mime);
  }
  throw new RagError("too_many_redirects");
}

const CODE_EXT = /\.(md|mdx|markdown|txt|rst|adoc|ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|kt|cs|php|rs|swift|scala|sql|sh|yaml|yml|toml|json|ini|cfg|html|css|scss|vue|svelte|c|h|cpp|hpp|proto|graphql|tf|dockerfile)$/i;
const SKIP_DIR = /(^|\/)(node_modules|vendor|dist|build|out|coverage|\.git|\.next|target|__pycache__|\.venv|venv)\//;
const SKIP_FILE = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.(js|css)|\.map)$/i;

async function githubToken(db: SupabaseClient, caller: Caller): Promise<string | null> {
  try {
    const { data: connection } = await db
      .from("github_connections")
      .select("encrypted_access_token")
      .eq("user_id", caller.userId)
      .maybeSingle();
    const encryptionKey = Deno.env.get("GITHUB_TOKEN_ENCRYPTION_KEY");
    if (!connection || !encryptionKey) return null;
    const { data } = await db.rpc("decrypt_github_token", {
      ciphertext: connection.encrypted_access_token,
      encryption_key: encryptionKey,
    });
    return (data as string) || null;
  } catch {
    return null;
  }
}

/** Minimal ustar reader over a gunzipped tarball. */
function* tarEntries(bytes: Uint8Array): Generator<{ path: string; data: Uint8Array }> {
  const decoder = new TextDecoder();
  let offset = 0;
  let longName: string | null = null;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start: number, len: number) =>
      decoder.decode(header.subarray(start, start + len)).replace(/\0.*$/s, "");
    const size = Number.parseInt(field(124, 12).trim() || "0", 8);
    const type = field(156, 1);
    const prefix = field(345, 155);
    const name = longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    longName = null;
    const dataStart = offset + 512;
    const data = bytes.subarray(dataStart, dataStart + size);
    if (type === "L") longName = decoder.decode(data).replace(/\0.*$/s, "");
    else if (type === "0" || type === "") yield { path: name, data };
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
}

async function githubFiles(db: SupabaseClient, caller: Caller, body: Record<string, unknown>) {
  if (caller.kind !== "user") throw new RagError("forbidden", 403);
  const repo = String(body.repository ?? "").trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new RagError("invalid_repository");
  const ref = String(body.ref ?? "").trim();
  const maxFiles = Math.min(Number(body.max_files) || 400, 800);
  const token = await githubToken(db, caller);
  const headers: Record<string, string> = {
    "user-agent": "NeoRAG/1.0",
    accept: "application/vnd.github+json",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  let res = await fetch(`https://api.github.com/repos/${repo}/tarball${ref ? `/${encodeURIComponent(ref)}` : ""}`, {
    headers,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok && token) {
    // A revoked OAuth token must not hide a public repository.
    delete headers.authorization;
    res = await fetch(`https://api.github.com/repos/${repo}/tarball${ref ? `/${encodeURIComponent(ref)}` : ""}`, {
      headers,
      signal: AbortSignal.timeout(60_000),
    });
  }
  if (!res.ok || !res.body) {
    throw new RagError(res.status === 404 ? "repository_not_found" : "github_failed", res.status === 404 ? 404 : 502);
  }
  const gunzipped = res.body.pipeThrough(new DecompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(gunzipped).arrayBuffer());
  const files: { path: string; content: string; sha: string }[] = [];
  let totalChars = 0;
  let skipped = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const entry of tarEntries(bytes)) {
    const path = entry.path.split("/").slice(1).join("/");
    if (!path || SKIP_DIR.test(path) || SKIP_FILE.test(path)) continue;
    const base = path.split("/").pop() ?? "";
    if (!CODE_EXT.test(path) && !/^(readme|license|changelog|dockerfile|makefile)/i.test(base)) continue;
    if (entry.data.length > 200_000 || entry.data.length === 0) {
      skipped += 1;
      continue;
    }
    let content: string;
    try {
      content = decoder.decode(entry.data);
    } catch {
      continue;
    }
    if (files.length >= maxFiles || totalChars + content.length > 6_000_000) {
      skipped += 1;
      continue;
    }
    totalChars += content.length;
    files.push({ path, content, sha: await sha256Hex(content) });
  }
  return { repository: repo, ref: ref || null, files, skipped, private_access: Boolean(token) };
}

// --------------------------------------------------------- list / status --

async function listCollections(db: SupabaseClient, caller: Caller) {
  let query = db.from("rag_collections").select("id, org_id, name, description");
  if (caller.kind === "key") {
    query = query.eq("org_id", caller.keyOrgId!);
    if (caller.keyCollections) query = query.in("id", caller.keyCollections);
  } else {
    const { data: orgs } = await db.from("org_members").select("org_id").eq("user_id", caller.userId);
    query = query.in("org_id", (orgs ?? []).map((o) => o.org_id));
  }
  const { data } = await query.order("name");
  return { collections: data ?? [] };
}

// -------------------------------------------------------------------- MCP --

const MCP_TOOLS = [
  {
    name: "rag_search",
    description:
      "Search the team's connected knowledge (docs, KT pages, repositories, decisions, uploaded files) and return the most relevant passages with their source. Use it before answering questions about this team's systems, decisions or conventions that the checked-out files do not settle.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for, in plain words." },
        collection_ids: { type: "array", items: { type: "string" }, description: "Optional: limit to these collections (see rag_list_collections)." },
        k: { type: "integer", minimum: 1, maximum: 20, description: "How many passages (default 6)." },
      },
      required: ["query"],
    },
  },
  {
    name: "rag_answer",
    description:
      "Answer a question from the team's connected knowledge with numbered citations. Says so when the sources do not contain the answer.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string" },
        collection_ids: { type: "array", items: { type: "string" } },
      },
      required: ["question"],
    },
  },
  {
    name: "rag_list_collections",
    description: "List the knowledge collections this key can search.",
    inputSchema: { type: "object", properties: {} },
  },
];

function formatHitsForAgent(hits: Hit[]): string {
  if (!hits.length) return "No matching passages in the connected sources.";
  return hits
    .map((h, i) => `[${i + 1}] ${h.title}${h.heading_path ? ` > ${h.heading_path}` : ""} (${h.source_kind}: ${h.source_name}${h.uri ? `, ${h.uri}` : ""})\n${h.content}`)
    .join("\n\n---\n\n");
}

async function handleMcp(req: Request, db: SupabaseClient): Promise<Response> {
  if (req.method === "GET") return new Response(null, { status: 405, headers: corsHeaders });
  if (req.method === "DELETE") return new Response(null, { status: 204, headers: corsHeaders });
  let message: { id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    message = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  if (Array.isArray(message)) {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batching is not supported" } }, 400);
  }
  const reply = (result: unknown) => json({ jsonrpc: "2.0", id: message.id ?? null, result });
  const fail = (code: number, text: string) => json({ jsonrpc: "2.0", id: message.id ?? null, error: { code, message: text } });

  if (message.method === "initialize") {
    const response = reply({
      protocolVersion: (message.params?.protocolVersion as string) ?? "2025-03-26",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "neo-rag", version: "1.0.0" },
      instructions:
        "Neo RAG searches the team's connected knowledge. Call rag_search (or rag_answer) before answering questions about this team's systems, decisions or docs; cite the [n] sources you used.",
    });
    response.headers.set("Mcp-Session-Id", crypto.randomUUID());
    return response;
  }
  if (message.method?.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers: corsHeaders });
  }
  if (message.method === "ping") return reply({});
  if (message.method === "tools/list") return reply({ tools: MCP_TOOLS });
  if (message.method !== "tools/call") return fail(-32601, "Method not found");

  let caller: Caller;
  try {
    caller = await authenticate(req, db);
  } catch {
    return fail(-32001, "Neo RAG: missing or invalid API key");
  }
  if (rateLimited(caller.actor)) return fail(-32002, "Rate limited");
  const name = message.params?.name as string;
  const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
  const started = Date.now();
  try {
    if (name === "rag_list_collections") {
      const { collections } = await listCollections(db, caller);
      return reply({ content: [{ type: "text", text: collections.length ? collections.map((c) => `- ${c.name} (${c.id})${c.description ? `: ${c.description}` : ""}`).join("\n") : "No collections." }] });
    }
    if (name === "rag_search") {
      const result = await retrieve(db, caller, { ...args, rerank: false }, { k: 6, rerank: false });
      await logQuery(db, caller, "mcp", "search", result, started);
      return reply({ content: [{ type: "text", text: formatHitsForAgent(result.hits) }] });
    }
    if (name === "rag_answer") {
      const result = await answer(db, caller, { ...args, query: args.question });
      await logQuery(db, caller, "mcp", "answer", result, started);
      const sources = result.hits
        .map((h, i) => `[${i + 1}] ${h.title}${h.heading_path ? ` > ${h.heading_path}` : ""}${h.uri ? ` (${h.uri})` : ""}`)
        .join("\n");
      return reply({ content: [{ type: "text", text: `${result.answer}\n\nSources:\n${sources || "none"}` }] });
    }
    return fail(-32602, `Unknown tool ${name}`);
  } catch (err) {
    const text = err instanceof RagError ? err.code : "internal_error";
    return reply({ isError: true, content: [{ type: "text", text: `Neo RAG error: ${text}` }] });
  }
}

// ------------------------------------------------------------------ serve --

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const db = admin();
  const path = new URL(req.url).pathname;
  if (/\/mcp\/?$/.test(path)) return handleMcp(req, db);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const started = Date.now();
  try {
    const raw = await req.text();
    if (raw.length > MAX_REQUEST_BYTES) throw new RagError("request_too_large", 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new RagError("invalid_json");
    }
    const caller = await authenticate(req, db);
    if (rateLimited(caller.actor)) throw new RagError("rate_limited", 429);
    const channel = caller.kind === "key" ? "api" : "app";

    switch (body.action) {
      case "ingest":
        return json(await ingest(db, caller, body));
      case "finish_sync":
        return json(await finishSync(db, caller, body));
      case "search": {
        const result = await retrieve(db, caller, body, { k: 8, rerank: false });
        await logQuery(db, caller, channel, "search", result, started);
        return json({
          query: result.query,
          results: result.hits.map(publicHit),
          timings: { ...result.timings, total_ms: Date.now() - started },
        });
      }
      case "answer": {
        const result = await answer(db, caller, body);
        await logQuery(db, caller, channel, "answer", result, started);
        return json({
          query: result.query,
          answer: result.answer,
          found: result.found,
          cited: result.cited,
          invalid_citations: result.invalid_citations,
          sources: result.hits.map(publicHit),
          timings: { ...result.timings, total_ms: Date.now() - started },
        });
      }
      case "list_collections":
        return json(await listCollections(db, caller));
      case "fetch_url":
        return json(await fetchUrl(caller, body));
      case "github_files":
        return json(await githubFiles(db, caller, body));
      case "create_key":
        return json(await createKey(db, caller, body));
      case "list_keys":
        return json(await listKeys(db, caller, body));
      case "revoke_key":
        return json(await revokeKey(db, caller, body));
      default:
        throw new RagError("unknown_action");
    }
  } catch (err) {
    if (err instanceof RagError) {
      if (err.status >= 500) console.error(err.code, err.message);
      return json({ error: err.code, detail: err.status >= 500 ? undefined : err.message !== err.code ? err.message : undefined }, err.status);
    }
    console.error(err);
    return json({ error: "internal_error" }, 500);
  }
});
