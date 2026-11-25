/**
 * Neo RAG ingest: turns a source into documents and chunks in the browser,
 * then hands them to the `rag` Edge Function to embed and store.
 *
 * Every kind is re-syncable from its saved config except `upload` (the
 * files live on the user's machine), and every sync is incremental: the
 * service skips a document whose content hash did not change, and a full
 * re-sync prunes documents that disappeared from the source.
 */
import {
  RagService,
  type IngestDocumentPayload,
  type RagSource,
  type RagSourceKind,
} from "#/api/rag/rag-service.api";
import { readRecords } from "#/api/workspace-memory/workspace-memory-store.api";
import { chunkDocument, chunkMarkdown, type Chunk } from "#/lib/rag/chunk";
import { redactSecrets, versionHash } from "#/lib/rag/text";
import { loadPersistedKnowledge } from "#/lib/knowledge/persisted-knowledge";
import { readDocument } from "#/lib/synth/documents/read";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import type { KnowledgeRepository } from "#/lib/knowledge/knowledge-engine";

/**
 * Part of every document hash: bump it when chunking or redaction changes so
 * the next re-sync re-indexes documents whose source text did not change.
 */
export const INGEST_PIPELINE_VERSION = 2;

/** The service accepts 250 chunks per request; leave room for small documents. */
const CHUNKS_PER_REQUEST = 200;
/** One document may not span requests (re-ingest replaces its chunks). */
export const MAX_CHUNKS_PER_DOCUMENT = 200;

export type SourceInput =
  | { kind: "upload"; files: File[] }
  | { kind: "text"; title: string; text: string }
  | { kind: "url"; url: string }
  | { kind: "github"; repository: string; ref?: string }
  | { kind: "kt"; repositoryId: string }
  | { kind: "memory"; workspaceId: string; label: string };

export interface SyncProgress {
  phase: "reading" | "embedding" | "finishing";
  done: number;
  total: number;
}

export interface SyncResult {
  documents: number;
  chunks: number;
  skipped: number;
  removed: number;
  redacted: number;
  truncated: string[];
  unreadable: string[];
}

interface BuiltSource {
  documents: IngestDocumentPayload[];
  /** Complete listings prune documents that are no longer there. */
  complete: boolean;
  redacted: number;
  truncated: string[];
  unreadable: string[];
}

/** What to save as the source's config so it can be re-synced later. */
export function sourceConfigFor(input: SourceInput): {
  name: string;
  config: Record<string, unknown>;
} {
  switch (input.kind) {
    case "upload":
      return {
        name:
          input.files
            .map((f) => f.name)
            .join(", ")
            .slice(0, 300) || "Files",
        config: {},
      };
    case "text":
      return {
        name: input.title,
        config: { title: input.title, text: input.text },
      };
    case "url":
      return { name: input.url, config: { url: input.url } };
    case "github":
      return {
        name: `${input.repository}${input.ref ? `@${input.ref}` : ""}`,
        config: { repository: input.repository, ref: input.ref ?? null },
      };
    case "kt":
      return {
        name: input.repositoryId,
        config: { repositoryId: input.repositoryId },
      };
    case "memory":
      return { name: input.label, config: { workspaceId: input.workspaceId } };
    default:
      throw new Error("unknown source kind");
  }
}

/** Rebuilds the input from a saved source; null for uploads (files are local). */
export function inputFromSource(source: RagSource): SourceInput | null {
  const c = source.config as Record<string, string | null | undefined>;
  switch (source.kind) {
    case "text":
      return {
        kind: "text",
        title: String(c.title ?? source.name),
        text: String(c.text ?? ""),
      };
    case "url":
      return { kind: "url", url: String(c.url ?? source.name) };
    case "github":
      return {
        kind: "github",
        repository: String(c.repository ?? ""),
        ref: c.ref ?? undefined,
      };
    case "kt":
      return {
        kind: "kt",
        repositoryId: String(c.repositoryId ?? source.name),
      };
    case "memory":
      return {
        kind: "memory",
        workspaceId: String(c.workspaceId ?? ""),
        label: source.name,
      };
    default:
      return null;
  }
}

function toPayload(
  externalId: string,
  title: string,
  chunks: Chunk[],
  extra: {
    uri?: string | null;
    mime?: string | null;
    hashOf: string;
    meta?: Record<string, unknown>;
  },
  stats: { redactions: number[]; truncated: string[] },
): IngestDocumentPayload {
  let kept = chunks;
  if (kept.length > MAX_CHUNKS_PER_DOCUMENT) {
    stats.truncated.push(title);
    kept = kept.slice(0, MAX_CHUNKS_PER_DOCUMENT);
  }
  return {
    external_id: externalId,
    title,
    uri: extra.uri ?? null,
    mime: extra.mime ?? null,
    version_hash: versionHash(`${INGEST_PIPELINE_VERSION}:${extra.hashOf}`),
    meta: extra.meta ?? {},
    chunks: kept.map((chunk) => {
      const clean = redactSecrets(chunk.content);
      stats.redactions.push(clean.redacted);
      return {
        content: clean.text,
        heading_path: chunk.headingPath,
        tokens: chunk.tokens,
      };
    }),
  };
}

async function knowledgeFor(
  repositoryId: string,
): Promise<KnowledgeRepository | null> {
  const inStore =
    useKnowledgeStore.getState().byRepositoryId[repositoryId]?.knowledge;
  if (inStore) return inStore;
  const match = repositoryId.match(/^([^/]+)\/([^@]+)@(.+)$/);
  if (!match) return null;
  const result = await loadPersistedKnowledge(match[1], match[2], match[3]);
  return result.status === "found" ? result.knowledge : null;
}

function finish(
  documents: IngestDocumentPayload[],
  complete: boolean,
  stats: { redactions: number[]; truncated: string[] },
  unreadable: string[],
): BuiltSource {
  return {
    documents,
    complete,
    redacted: stats.redactions.reduce((a, b) => a + b, 0),
    truncated: stats.truncated,
    unreadable,
  };
}

export async function buildSource(input: SourceInput): Promise<BuiltSource> {
  const stats = { redactions: [] as number[], truncated: [] as string[] };
  const unreadable: string[] = [];
  const documents: IngestDocumentPayload[] = [];

  switch (input.kind) {
    case "upload": {
      for (const file of input.files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const read = readDocument(file.name, bytes);
        if (read.unreadable || !read.text.trim()) {
          unreadable.push(file.name);
          continue;
        }
        // Converted office/PDF text is markdown-like; code keeps its extension.
        const chunks = chunkDocument(
          read.format === "text" ? file.name : `${file.name}.md`,
          read.text,
        );
        documents.push(
          toPayload(
            `file:${file.name}`,
            file.name,
            chunks,
            { mime: file.type || read.format, hashOf: read.text },
            stats,
          ),
        );
      }
      return finish(documents, false, stats, unreadable);
    }
    case "text": {
      const chunks = chunkMarkdown(input.text);
      documents.push(
        toPayload(
          "text",
          input.title,
          chunks,
          { mime: "text/markdown", hashOf: input.text },
          stats,
        ),
      );
      return finish(documents, true, stats, unreadable);
    }
    case "url": {
      const page = await RagService.fetchUrl(input.url);
      const chunks = chunkMarkdown(page.text);
      documents.push(
        toPayload(
          page.url,
          page.title || page.url,
          chunks,
          { uri: page.url, mime: page.mime, hashOf: page.text },
          stats,
        ),
      );
      return finish(documents, true, stats, unreadable);
    }
    case "github": {
      const repo = await RagService.githubFiles(input.repository, input.ref);
      const ref = input.ref || "HEAD";
      for (const file of repo.files) {
        const chunks = chunkDocument(file.path, file.content);
        documents.push(
          toPayload(
            file.path,
            file.path,
            chunks,
            {
              uri: `https://github.com/${repo.repository}/blob/${ref}/${file.path}`,
              hashOf: file.sha,
            },
            stats,
          ),
        );
      }
      return finish(documents, true, stats, unreadable);
    }
    case "kt": {
      const knowledge = await knowledgeFor(input.repositoryId);
      if (!knowledge) throw new Error("kt_not_found");
      for (const page of knowledge.pages) {
        const files = (page.relevantFiles ?? []).map((f) => f.path);
        const body = [
          page.description,
          page.contentMarkdown,
          files.length ? `Files: ${files.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");
        documents.push(
          toPayload(
            page.id,
            page.title,
            chunkMarkdown(body),
            {
              uri: `/kt/${encodeURIComponent(input.repositoryId)}/${encodeURIComponent(page.id)}`,
              mime: "text/markdown",
              hashOf: `${knowledge.commitSha}:${body}`,
              meta: { commit: knowledge.commitSha },
            },
            stats,
          ),
        );
      }
      return finish(documents, true, stats, unreadable);
    }
    case "memory": {
      const records = readRecords(input.workspaceId).filter(
        (r) => r.status === "active",
      );
      for (const record of records) {
        const text = `${record.statement}\n\nKind: ${record.kind}. Subject: ${record.subject}.${record.tags.length ? ` Tags: ${record.tags.join(", ")}.` : ""}`;
        documents.push(
          toPayload(
            record.id,
            `${record.kind}: ${record.subject}`,
            [
              {
                content: text,
                headingPath: record.kind,
                tokens: Math.ceil(text.length / 4),
              },
            ],
            {
              mime: "text/plain",
              hashOf: text,
              meta: { kind: record.kind, pinned: record.pinned },
            },
            stats,
          ),
        );
      }
      return finish(documents, true, stats, unreadable);
    }
    default:
      throw new Error("unknown source kind");
  }
}

/** Groups documents into requests of at most CHUNKS_PER_REQUEST chunks. */
export function batchDocuments(
  documents: IngestDocumentPayload[],
): IngestDocumentPayload[][] {
  const batches: IngestDocumentPayload[][] = [];
  let current: IngestDocumentPayload[] = [];
  let size = 0;
  for (const doc of documents) {
    if (current.length && size + doc.chunks.length > CHUNKS_PER_REQUEST) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(doc);
    size += doc.chunks.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

export async function syncSource(
  source: RagSource,
  input: SourceInput,
  onProgress?: (progress: SyncProgress) => void,
): Promise<SyncResult> {
  await RagService.markSourceSyncing(source.id);
  try {
    onProgress?.({ phase: "reading", done: 0, total: 1 });
    const built = await buildSource(input);
    const batches = batchDocuments(
      built.documents.filter((d) => d.chunks.length > 0),
    );
    let skipped = 0;
    for (let i = 0; i < batches.length; i += 1) {
      onProgress?.({ phase: "embedding", done: i, total: batches.length });

      const result = await RagService.ingest(source.id, batches[i]);
      skipped += result.skipped;
    }
    onProgress?.({
      phase: "finishing",
      done: batches.length,
      total: batches.length,
    });
    const keep = built.complete
      ? built.documents.map((d) => d.external_id)
      : null;
    const finished = await RagService.finishSync(source.id, keep);
    return {
      documents: finished.documents,
      chunks: finished.chunks,
      skipped,
      removed: finished.removed,
      redacted: built.redacted,
      truncated: built.truncated,
      unreadable: built.unreadable,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await RagService.finishSync(source.id, null, message).catch(
      () => undefined,
    );
    throw error;
  }
}

/** Creates the source row and runs its first sync. */
export async function addAndSyncSource(
  collectionId: string,
  orgId: string,
  input: SourceInput,
  onProgress?: (progress: SyncProgress) => void,
): Promise<{ source: RagSource; result: SyncResult }> {
  const { name, config } = sourceConfigFor(input);
  const source = await RagService.createSource(
    collectionId,
    orgId,
    input.kind as RagSourceKind,
    name,
    config,
  );
  const result = await syncSource(source, input, onProgress);
  return { source, result };
}
