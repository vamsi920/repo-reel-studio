import React from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Brain,
  FileText,
  GitBranch,
  Globe,
  StickyNote,
} from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import type { RagSourceKind, RagSourceStatus } from "#/api/rag/rag-service.api";
import { RagServiceError } from "#/api/rag/rag-service.api";

export const RAG_QUERY_KEYS = {
  collections: ["rag", "collections"] as const,
  sources: (collectionId: string) => ["rag", "sources", collectionId] as const,
  documents: (sourceId: string) => ["rag", "documents", sourceId] as const,
  evalCases: (collectionId: string) =>
    ["rag", "eval-cases", collectionId] as const,
  evalRuns: (collectionId: string) =>
    ["rag", "eval-runs", collectionId] as const,
  apiKeys: ["rag", "api-keys"] as const,
  agents: ["rag", "agents-connected"] as const,
};

export const ragCardClassName =
  "rounded-xl border border-[var(--border-color)] bg-[var(--oh-surface,transparent)] p-4";
export const ragMutedClassName = "text-sm text-[var(--text-secondary)]";
export const ragInputClassName =
  "w-full rounded-md border border-[var(--border-color)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary,var(--text-secondary))] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)]";
export const ragPrimaryButtonClassName =
  "rounded-md bg-[var(--primary-500)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50";
export const ragSecondaryButtonClassName =
  "rounded-md border border-[var(--border-color)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--oh-interactive-hover)] disabled:opacity-50";

export const SOURCE_KINDS: RagSourceKind[] = [
  "upload",
  "text",
  "url",
  "github",
  "kt",
  "memory",
];

export const SOURCE_KIND_LABEL: Record<RagSourceKind, I18nKey> = {
  upload: I18nKey.RAG$KIND_UPLOAD,
  text: I18nKey.RAG$KIND_TEXT,
  url: I18nKey.RAG$KIND_URL,
  github: I18nKey.RAG$KIND_GITHUB,
  kt: I18nKey.RAG$KIND_KT,
  memory: I18nKey.RAG$KIND_MEMORY,
};

export const SOURCE_KIND_HINT: Record<RagSourceKind, I18nKey> = {
  upload: I18nKey.RAG$KIND_UPLOAD_HINT,
  text: I18nKey.RAG$KIND_TEXT_HINT,
  url: I18nKey.RAG$KIND_URL_HINT,
  github: I18nKey.RAG$KIND_GITHUB_HINT,
  kt: I18nKey.RAG$KIND_KT_HINT,
  memory: I18nKey.RAG$KIND_MEMORY_HINT,
};

const STATUS_LABEL: Record<RagSourceStatus, I18nKey> = {
  pending: I18nKey.RAG$STATUS_PENDING,
  syncing: I18nKey.RAG$STATUS_SYNCING,
  ready: I18nKey.RAG$STATUS_READY,
  error: I18nKey.RAG$STATUS_ERROR,
};

const STATUS_CLASS: Record<RagSourceStatus, string> = {
  pending: "bg-[var(--oh-interactive-hover)] text-[var(--text-secondary)]",
  syncing: "bg-amber-500/15 text-amber-600",
  ready: "bg-emerald-500/15 text-emerald-600",
  error: "bg-red-500/15 text-red-600",
};

export function SourceKindIcon({
  kind,
  size = 16,
}: {
  kind: RagSourceKind;
  size?: number;
}) {
  const props = { size, className: "shrink-0 text-[var(--primary-500)]" };
  switch (kind) {
    case "upload":
      return <FileText {...props} />;
    case "text":
      return <StickyNote {...props} />;
    case "url":
      return <Globe {...props} />;
    case "github":
      return <GitBranch {...props} />;
    case "kt":
      return <BookOpen {...props} />;
    default:
      return <Brain {...props} />;
  }
}

export function StatusPill({ status }: { status: RagSourceStatus }) {
  const { t } = useTranslation("openhands");
  return (
    <span
      data-testid={`rag-source-status-${status}`}
      className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[status]}`}
    >
      {t(STATUS_LABEL[status])}
    </span>
  );
}

export function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function errorText(error: unknown): string {
  if (error instanceof RagServiceError) {
    return error.message && error.message !== error.code
      ? `${error.code}: ${error.message}`
      : error.code;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Service error codes that have a plain-language explanation. */
const KNOWN_ERRORS: Record<string, I18nKey> = {
  repository_not_found: I18nKey.RAG$ERR_REPOSITORY_NOT_FOUND,
  blocked_host: I18nKey.RAG$ERR_BLOCKED_HOST,
  kt_not_found: I18nKey.RAG$ERR_KT_NOT_FOUND,
  forbidden: I18nKey.RAG$ERR_FORBIDDEN,
  unauthorized: I18nKey.RAG$ERR_SIGN_IN,
  no_team: I18nKey.RAG$ERR_SIGN_IN,
};

function errorCode(error: unknown): string {
  if (error instanceof RagServiceError) return error.code;
  if (typeof error === "string") return error;
  return error instanceof Error ? error.message : "";
}

/** A translated sentence for a known error code, else the code itself. */
export function useErrorMessage(): (error: unknown) => string {
  const { t } = useTranslation("openhands");
  return React.useCallback(
    (error: unknown) => {
      const known = KNOWN_ERRORS[errorCode(error)];
      return known
        ? t(known)
        : t(I18nKey.RAG$ERROR, { error: errorText(error) });
    },
    [t],
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const message = useErrorMessage();
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-red-600">
      {message(error)}
    </p>
  );
}

export function useCopy(): [string | null, (id: string, text: string) => void] {
  const [copied, setCopied] = React.useState<string | null>(null);
  const copy = React.useCallback((id: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(id);
      setTimeout(
        () => setCopied((current) => (current === id ? null : current)),
        1500,
      );
    });
  }, []);
  return [copied, copy];
}
