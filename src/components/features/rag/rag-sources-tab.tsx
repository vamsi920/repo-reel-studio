import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { I18nKey } from "#/i18n/declaration";
import {
  RagService,
  type RagCollection,
  type RagSource,
  type RagSourceKind,
} from "#/api/rag/rag-service.api";
import {
  addAndSyncSource,
  inputFromSource,
  syncSource,
  type SourceInput,
  type SyncProgress,
  type SyncResult,
} from "#/services/rag-sync";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import { useUsageWorkspaceOptions } from "#/components/features/usage/usage-workspace-select";
import { DOCUMENT_EXTENSIONS } from "#/lib/synth/documents/read";
import {
  ErrorNote,
  RAG_QUERY_KEYS,
  SOURCE_KINDS,
  SOURCE_KIND_HINT,
  SOURCE_KIND_LABEL,
  SourceKindIcon,
  StatusPill,
  formatWhen,
  ragCardClassName,
  ragInputClassName,
  ragMutedClassName,
  ragPrimaryButtonClassName,
  ragSecondaryButtonClassName,
  useErrorMessage,
} from "./rag-shared";

const CODE_UPLOAD_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".java",
  ".rb",
  ".rs",
  ".sql",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
];

function ProgressLine({ progress }: { progress: SyncProgress | null }) {
  const { t } = useTranslation("openhands");
  if (!progress) return null;
  let label = t(I18nKey.RAG$SYNC_READING);
  if (progress.phase === "embedding") {
    label = t(I18nKey.RAG$SYNC_EMBEDDING, {
      done: progress.done + 1,
      total: progress.total,
    });
  } else if (progress.phase === "finishing") {
    label = t(I18nKey.RAG$SYNC_FINISHING);
  }
  const pct =
    progress.phase === "finishing"
      ? 100
      : progress.total
        ? Math.round((progress.done / progress.total) * 100)
        : 5;
  return (
    <div data-testid="rag-sync-progress" className="flex flex-col gap-1">
      <span className={ragMutedClassName}>{label}</span>
      <div className="h-1.5 w-full overflow-hidden rounded bg-[var(--oh-interactive-hover)]">
        <div
          className="h-full bg-[var(--primary-500)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ResultLine({ result }: { result: SyncResult | null }) {
  const { t } = useTranslation("openhands");
  if (!result) return null;
  return (
    <div
      data-testid="rag-sync-result"
      className="flex flex-col gap-0.5 text-sm"
    >
      <span className="text-emerald-600">
        {t(I18nKey.RAG$SYNC_DONE, {
          documents: result.documents,
          chunks: result.chunks,
        })}
      </span>
      <span className={ragMutedClassName}>
        {t(I18nKey.RAG$SYNC_DETAILS, {
          skipped: result.skipped,
          removed: result.removed,
          redacted: result.redacted,
        })}
      </span>
      {result.unreadable.length ? (
        <span className="text-amber-600">
          {t(I18nKey.RAG$SYNC_UNREADABLE, {
            files: result.unreadable.join(", "),
          })}
        </span>
      ) : null}
      {result.truncated.length ? (
        <span className="text-amber-600">
          {t(I18nKey.RAG$SYNC_TRUNCATED, {
            files: result.truncated.join(", "),
          })}
        </span>
      ) : null}
    </div>
  );
}

function AddSourceForm({
  collection,
  onDone,
}: {
  collection: RagCollection;
  onDone: () => void;
}) {
  const { t } = useTranslation("openhands");
  const [kind, setKind] = React.useState<RagSourceKind>("upload");
  const [files, setFiles] = React.useState<File[]>([]);
  const [title, setTitle] = React.useState("");
  const [text, setText] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [repository, setRepository] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [ktRepo, setKtRepo] = React.useState("");
  const [workspaceId, setWorkspaceId] = React.useState("");
  const [progress, setProgress] = React.useState<SyncProgress | null>(null);
  const [result, setResult] = React.useState<SyncResult | null>(null);
  const [error, setError] = React.useState<unknown>(null);
  const busy = progress !== null;

  const knowledge = useKnowledgeStore((s) => s.byRepositoryId);
  const ktOptions = Object.keys(knowledge).filter(
    (id) => knowledge[id]?.knowledge,
  );
  const { options: workspaceOptions, labelByWorkspaceId } =
    useUsageWorkspaceOptions();

  const input = (): SourceInput | null => {
    switch (kind) {
      case "upload":
        return files.length ? { kind, files } : null;
      case "text":
        return title.trim() && text.trim()
          ? { kind, title: title.trim(), text }
          : null;
      case "url":
        return /^https?:\/\/\S+$/i.test(url.trim())
          ? { kind, url: url.trim() }
          : null;
      case "github":
        return /^[\w.-]+\/[\w.-]+$/.test(repository.trim())
          ? {
              kind,
              repository: repository.trim(),
              ref: branch.trim() || undefined,
            }
          : null;
      case "kt":
        return /^[^/\s]+\/[^@\s]+@\S+$/.test(ktRepo.trim())
          ? { kind, repositoryId: ktRepo.trim() }
          : null;
      case "memory":
        return workspaceId
          ? {
              kind,
              workspaceId,
              label: labelByWorkspaceId[workspaceId] ?? workspaceId,
            }
          : null;
      default:
        return null;
    }
  };
  const ready = input();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setError(null);
    setResult(null);
    setProgress({ phase: "reading", done: 0, total: 1 });
    try {
      const { result: done } = await addAndSyncSource(
        collection.id,
        collection.org_id,
        ready,
        setProgress,
      );
      setResult(done);
      setFiles([]);
      setTitle("");
      setText("");
      setUrl("");
      setRepository("");
      setBranch("");
      onDone();
    } catch (e) {
      setError(e);
      onDone();
    } finally {
      setProgress(null);
    }
  };

  return (
    <form
      onSubmit={submit}
      data-testid="rag-add-source-form"
      className={`${ragCardClassName} flex flex-col gap-3`}
    >
      <div role="radiogroup" className="flex flex-wrap gap-2">
        {SOURCE_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            data-testid={`rag-kind-${k}`}
            onClick={() => setKind(k)}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
              kind === k
                ? "border-[var(--primary-500)] text-[var(--text-primary)]"
                : "border-[var(--border-color)] text-[var(--text-secondary)]"
            }`}
          >
            <SourceKindIcon kind={k} size={14} />
            {t(SOURCE_KIND_LABEL[k])}
          </button>
        ))}
      </div>
      <p className={ragMutedClassName}>{t(SOURCE_KIND_HINT[kind])}</p>

      {kind === "upload" ? (
        <label className="flex flex-col gap-1 text-sm text-[var(--text-primary)]">
          {t(I18nKey.RAG$PICK_FILES)}
          <input
            data-testid="rag-files-input"
            type="file"
            multiple
            accept={[...DOCUMENT_EXTENSIONS, ...CODE_UPLOAD_EXTENSIONS].join(
              ",",
            )}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          {files.length ? (
            <span className={ragMutedClassName}>
              {t(I18nKey.RAG$FILES_SELECTED, { count: files.length })}
            </span>
          ) : null}
        </label>
      ) : null}

      {kind === "text" ? (
        <>
          <input
            data-testid="rag-text-title"
            className={ragInputClassName}
            placeholder={t(I18nKey.RAG$TITLE_FIELD)}
            value={title}
            maxLength={300}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            data-testid="rag-text-body"
            className={ragInputClassName}
            rows={8}
            placeholder={t(I18nKey.RAG$TEXT_FIELD)}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </>
      ) : null}

      {kind === "url" ? (
        <input
          data-testid="rag-url"
          className={ragInputClassName}
          placeholder={t(I18nKey.RAG$URL_FIELD)}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      ) : null}

      {kind === "github" ? (
        <div className="flex flex-wrap gap-2">
          <input
            data-testid="rag-github-repository"
            className={`${ragInputClassName} min-w-[14rem] flex-1`}
            placeholder={t(I18nKey.RAG$REPOSITORY_FIELD)}
            value={repository}
            onChange={(e) => setRepository(e.target.value)}
          />
          <input
            className={`${ragInputClassName} w-40`}
            placeholder={t(I18nKey.RAG$BRANCH_FIELD)}
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          />
        </div>
      ) : null}

      {kind === "kt" ? (
        <label className="flex flex-col gap-1 text-sm text-[var(--text-primary)]">
          {t(I18nKey.RAG$PICK_KT)}
          <input
            data-testid="rag-kt-repository"
            list="rag-kt-options"
            className={ragInputClassName}
            value={ktRepo}
            placeholder={t(I18nKey.RAG$KT_PLACEHOLDER)}
            onChange={(e) => setKtRepo(e.target.value)}
          />
          <datalist id="rag-kt-options">
            {ktOptions.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
          {ktOptions.length === 0 ? (
            <span className={ragMutedClassName}>{t(I18nKey.RAG$NO_KT)}</span>
          ) : null}
        </label>
      ) : null}

      {kind === "memory" ? (
        <label className="flex flex-col gap-1 text-sm text-[var(--text-primary)]">
          {t(I18nKey.RAG$PICK_WORKSPACE)}
          <select
            data-testid="rag-memory-workspace"
            className={ragInputClassName}
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
          >
            <option value="" />
            {workspaceOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {workspaceOptions.length === 0 ? (
            <span className={ragMutedClassName}>
              {t(I18nKey.RAG$NO_WORKSPACES)}
            </span>
          ) : null}
        </label>
      ) : null}

      <ProgressLine progress={progress} />
      <ResultLine result={result} />
      <ErrorNote error={error} />
      <div>
        <button
          type="submit"
          data-testid="rag-add-and-index"
          className={ragPrimaryButtonClassName}
          disabled={!ready || busy}
        >
          {t(I18nKey.RAG$ADD_AND_INDEX)}
        </button>
      </div>
    </form>
  );
}

function SourceRow({
  source,
  onChanged,
}: {
  source: RagSource;
  onChanged: () => void;
}) {
  const { t } = useTranslation("openhands");
  const [progress, setProgress] = React.useState<SyncProgress | null>(null);
  const [result, setResult] = React.useState<SyncResult | null>(null);
  const [error, setError] = React.useState<unknown>(null);
  const [showDocs, setShowDocs] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const errorMessage = useErrorMessage();
  const documents = useQuery({
    queryKey: RAG_QUERY_KEYS.documents(source.id),
    queryFn: () => RagService.listDocuments(source.id),
    enabled: showDocs,
  });

  const run = async (input: SourceInput) => {
    setError(null);
    setResult(null);
    setProgress({ phase: "reading", done: 0, total: 1 });
    try {
      setResult(await syncSource(source, input, setProgress));
    } catch (e) {
      setError(e);
    } finally {
      setProgress(null);
      onChanged();
    }
  };
  const resyncInput = inputFromSource(source);

  return (
    <li
      data-testid="rag-source-row"
      className={`${ragCardClassName} flex flex-col gap-2`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SourceKindIcon kind={source.kind} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">
          {source.name}
        </span>
        <StatusPill status={progress ? "syncing" : source.status} />
      </div>
      <p className="text-xs text-[var(--text-secondary)]">
        {t(SOURCE_KIND_LABEL[source.kind])} ·{" "}
        {t(I18nKey.RAG$SOURCE_STATS, {
          documents: source.document_count,
          chunks: source.chunk_count,
        })}{" "}
        ·{" "}
        {source.last_synced_at
          ? t(I18nKey.RAG$LAST_SYNCED, {
              time: formatWhen(source.last_synced_at),
            })
          : t(I18nKey.RAG$NEVER_SYNCED)}
      </p>
      {source.status === "error" && source.error && !progress ? (
        <p className="text-xs text-red-600">{errorMessage(source.error)}</p>
      ) : null}
      <ProgressLine progress={progress} />
      <ResultLine result={result} />
      <ErrorNote error={error} />
      <div className="flex flex-wrap gap-2">
        {resyncInput ? (
          <button
            type="button"
            data-testid="rag-resync"
            className={ragSecondaryButtonClassName}
            disabled={progress !== null}
            onClick={() => void run(resyncInput)}
          >
            {t(I18nKey.RAG$RESYNC)}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={ragSecondaryButtonClassName}
              disabled={progress !== null}
              onClick={() => fileInput.current?.click()}
            >
              {t(I18nKey.RAG$ADD_FILES)}
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              accept={[...DOCUMENT_EXTENSIONS, ...CODE_UPLOAD_EXTENSIONS].join(
                ",",
              )}
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                if (picked.length) void run({ kind: "upload", files: picked });
              }}
            />
          </>
        )}
        <button
          type="button"
          className={ragSecondaryButtonClassName}
          onClick={() => setShowDocs((v) => !v)}
        >
          {showDocs
            ? t(I18nKey.RAG$HIDE_DOCUMENTS)
            : t(I18nKey.RAG$SHOW_DOCUMENTS, { count: source.document_count })}
        </button>
        <button
          type="button"
          data-testid="rag-remove-source"
          className={`${ragSecondaryButtonClassName} text-red-600`}
          disabled={progress !== null}
          onClick={async () => {
            if (
              !window.confirm(
                t(I18nKey.RAG$CONFIRM_REMOVE_SOURCE, { name: source.name }),
              )
            )
              return;
            try {
              await RagService.deleteSource(source.id);
            } catch (e) {
              setError(e);
            }
            onChanged();
          }}
        >
          {t(I18nKey.RAG$REMOVE)}
        </button>
      </div>
      {showDocs ? (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {(documents.data ?? []).map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              {doc.uri && /^https?:/.test(doc.uri) ? (
                <a
                  href={doc.uri}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-[var(--primary-500)] hover:underline"
                >
                  {doc.title}
                </a>
              ) : (
                <span className="truncate text-[var(--text-primary)]">
                  {doc.title}
                </span>
              )}
              <span className="shrink-0 text-[var(--text-secondary)]">
                {doc.chunk_count}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function RagSourcesTab({ collection }: { collection: RagCollection }) {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const [adding, setAdding] = React.useState(false);
  const sources = useQuery({
    queryKey: RAG_QUERY_KEYS.sources(collection.id),
    queryFn: () => RagService.listSources(collection.id),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: RAG_QUERY_KEYS.sources(collection.id),
    });
    void queryClient.invalidateQueries({
      queryKey: RAG_QUERY_KEYS.collections,
    });
  };
  const list = sources.data ?? [];

  return (
    <div data-testid="rag-sources-tab" className="flex flex-col gap-3">
      <div>
        <button
          type="button"
          data-testid="rag-add-source"
          className={
            adding ? ragSecondaryButtonClassName : ragPrimaryButtonClassName
          }
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? t(I18nKey.RAG$CANCEL) : t(I18nKey.RAG$ADD_SOURCE)}
        </button>
      </div>
      {adding ? (
        <AddSourceForm collection={collection} onDone={refresh} />
      ) : null}
      {sources.error ? <ErrorNote error={sources.error} /> : null}
      {sources.isSuccess && list.length === 0 && !adding ? (
        <p className={`${ragCardClassName} ${ragMutedClassName}`}>
          {t(I18nKey.RAG$EMPTY_SOURCES)}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {list.map((source) => (
          <SourceRow key={source.id} source={source} onChanged={refresh} />
        ))}
      </ul>
    </div>
  );
}
