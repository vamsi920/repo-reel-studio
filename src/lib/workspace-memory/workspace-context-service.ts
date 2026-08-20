/**
 * The one call every agent path makes.
 *
 * `buildContext` combines the current task, the workspace's memories (which
 * already carry repository evidence, approved requirements, policies and prior
 * outcomes as provenance), selects what fits the budget, compresses it through
 * Layman, and reports exactly what it cost.
 *
 * The cache exists because this runs on the message send path. Its key
 * includes the repository commit SHA and a per-workspace revision counter, so
 * repository-derived context cannot outlive the commit it was derived from,
 * and any accepted write invalidates immediately.
 */
import {
  readRecords,
  subscribeWorkspaceMemory,
} from "#/api/workspace-memory/workspace-memory-store.api";

import { renderContextBlock } from "./render";
import type { SavingsSample } from "./savings";
import { selectRecords } from "./selection";
import type { MemoryRecord } from "./types";

export interface BuildContextParams {
  workspaceId: string;
  task: string;
  repositoryId?: string;
  conversationId: string | null;
  tokenBudget: number;
  /** Repository HEAD. Omit only when the workspace is not a git checkout. */
  commitSha?: string | null;
  model?: string | null;
  /** Escape hatch for tests and for measuring the compression delta. */
  compress?: boolean;
}

export interface WorkspaceContext {
  text: string;
  recordIds: string[];
  sample: SavingsSample;
  fromCache: boolean;
}

interface CacheEntry {
  text: string;
  recordIds: string[];
  candidateRawTokens: number;
  selectedTokensBeforeCompression: number;
  finalContextTokens: number;
  compressionRatio: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 64;

/**
 * Bumped on every accepted write. Part of the cache key, so a new memory
 * invalidates every cached build for that workspace without a sweep.
 */
const revisionByWorkspace = new Map<string, number>();

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "is",
  "are",
  "was",
  "were",
  "be",
  "please",
  "can",
  "you",
  "i",
  "it",
  "this",
  "that",
  "we",
  "my",
  "me",
  "do",
  "does",
  "how",
  "what",
  "why",
]);

/**
 * Trivially different phrasings of the same request should hit the same cache
 * entry -- the selection they produce is identical.
 */
export function taskBucket(task: string): string {
  const tokens = task
    .toLowerCase()
    .replace(/[^a-z0-9\s/._-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    .sort();
  return Array.from(new Set(tokens)).slice(0, 12).join(" ");
}

export function bumpMemoryRevision(workspaceId: string): number {
  const next = (revisionByWorkspace.get(workspaceId) ?? 0) + 1;
  revisionByWorkspace.set(workspaceId, next);
  return next;
}

export function getMemoryRevision(workspaceId: string): number {
  return revisionByWorkspace.get(workspaceId) ?? 0;
}

function cacheKey(params: BuildContextParams): string {
  return [
    params.workspaceId,
    params.commitSha ?? "nosha",
    params.repositoryId ?? "",
    params.tokenBudget,
    params.compress === false ? "raw" : "cmp",
    taskBucket(params.task),
    getMemoryRevision(params.workspaceId),
  ].join("|");
}

function emptySample(params: BuildContextParams): SavingsSample {
  return {
    workspaceId: params.workspaceId,
    conversationId: params.conversationId,
    at: new Date().toISOString(),
    candidateRawTokens: 0,
    selectedTokensBeforeCompression: 0,
    finalContextTokens: 0,
    cachedTokensReused: 0,
    compressionRatio: 0,
    model: params.model ?? null,
    fromCache: false,
  };
}

/** Injectable so tests (and future server-backed reads) can supply records. */
export type RecordSource = (workspaceId: string) => MemoryRecord[];

let recordSource: RecordSource = readRecords;

export function setRecordSource(source: RecordSource): void {
  recordSource = source;
}

export function resetRecordSource(): void {
  recordSource = readRecords;
}

class WorkspaceContextService {
  static buildContext(params: BuildContextParams): WorkspaceContext {
    // No workspace id means no memory. There is no shared bucket to fall back
    // to, by design.
    if (!params.workspaceId) {
      return {
        text: "",
        recordIds: [],
        sample: emptySample(params),
        fromCache: false,
      };
    }

    const key = cacheKey(params);
    const cached = cache.get(key);
    if (cached) {
      return {
        text: cached.text,
        recordIds: cached.recordIds,
        fromCache: true,
        sample: {
          ...emptySample(params),
          candidateRawTokens: cached.candidateRawTokens,
          selectedTokensBeforeCompression:
            cached.selectedTokensBeforeCompression,
          finalContextTokens: cached.finalContextTokens,
          cachedTokensReused: cached.finalContextTokens,
          compressionRatio: cached.compressionRatio,
          fromCache: true,
        },
      };
    }

    const records = recordSource(params.workspaceId).filter(
      // Belt and braces: the store is already partitioned, but a context build
      // must never emit a record from elsewhere.
      (record) => record.workspaceId === params.workspaceId,
    );

    const selection = selectRecords({
      records,
      task: params.task,
      repositoryId: params.repositoryId,
      tokenBudget: params.tokenBudget,
      // Header, framing line and per-record source lines.
      reservedTokens: 120,
    });

    const rendered = renderContextBlock(selection.selected, {
      compress: params.compress !== false,
    });

    const recordIds = selection.selected.map(({ record }) => record.id);

    if (rendered.text) {
      if (cache.size >= MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      cache.set(key, {
        text: rendered.text,
        recordIds,
        candidateRawTokens: selection.candidateRawTokens,
        selectedTokensBeforeCompression:
          selection.selectedTokensBeforeCompression,
        finalContextTokens: rendered.finalContextTokens,
        compressionRatio: rendered.compressionRatio,
      });
    }

    return {
      text: rendered.text,
      recordIds,
      fromCache: false,
      sample: {
        ...emptySample(params),
        candidateRawTokens: selection.candidateRawTokens,
        selectedTokensBeforeCompression:
          selection.selectedTokensBeforeCompression,
        finalContextTokens: rendered.finalContextTokens,
        cachedTokensReused: 0,
        compressionRatio: rendered.compressionRatio,
      },
    };
  }

  /** Drops every cached build for a workspace. */
  static invalidate(workspaceId: string): void {
    bumpMemoryRevision(workspaceId);
    Array.from(cache.keys())
      .filter((key) => key.startsWith(`${workspaceId}|`))
      .forEach((key) => cache.delete(key));
  }

  /** Test-only. */
  static resetCache(): void {
    cache.clear();
    revisionByWorkspace.clear();
  }
}

/** Keeps the cache honest when another tab writes to the same workspace. */
export function watchWorkspaceForInvalidation(workspaceId: string): () => void {
  return subscribeWorkspaceMemory(workspaceId, () => {
    WorkspaceContextService.invalidate(workspaceId);
  });
}

export default WorkspaceContextService;
