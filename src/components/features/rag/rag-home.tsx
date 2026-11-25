import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Library, Plus } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { RagService, isRagAvailable } from "#/api/rag/rag-service.api";
import { useNavigation } from "#/context/navigation-context";
import {
  ErrorNote,
  RAG_QUERY_KEYS,
  formatWhen,
  ragCardClassName,
  ragInputClassName,
  ragMutedClassName,
  ragPrimaryButtonClassName,
  ragSecondaryButtonClassName,
} from "./rag-shared";

export const RAG_BASE_PATH = "/rag";

export function RagPageHeader({ children }: { children?: React.ReactNode }) {
  const { t } = useTranslation("openhands");
  return (
    <header className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Library size={20} className="text-[var(--primary-500)]" />
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          {t(I18nKey.RAG$TITLE)}
        </h1>
        {children}
      </div>
      <p className={ragMutedClassName}>{t(I18nKey.RAG$SUBTITLE)}</p>
    </header>
  );
}

function NewCollectionForm({ onDone }: { onDone: (id?: string) => void }) {
  const { t } = useTranslation("openhands");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await RagService.createCollection(name, description);
      onDone(id);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={submit}
      data-testid="rag-new-collection-form"
      className={`${ragCardClassName} flex flex-col gap-3`}
    >
      <label className="flex flex-col gap-1 text-sm text-[var(--text-primary)]">
        {t(I18nKey.RAG$COLLECTION_NAME)}
        <input
          data-testid="rag-collection-name"
          className={ragInputClassName}
          value={name}
          maxLength={120}
          placeholder={t(I18nKey.RAG$COLLECTION_NAME_PLACEHOLDER)}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-[var(--text-primary)]">
        {t(I18nKey.RAG$COLLECTION_DESCRIPTION)}
        <textarea
          className={ragInputClassName}
          rows={2}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <ErrorNote error={error} />
      <div className="flex gap-2">
        <button
          type="submit"
          data-testid="rag-create-collection"
          className={ragPrimaryButtonClassName}
          disabled={busy || !name.trim()}
        >
          {t(I18nKey.RAG$CREATE)}
        </button>
        <button
          type="button"
          className={ragSecondaryButtonClassName}
          onClick={() => onDone()}
        >
          {t(I18nKey.RAG$CANCEL)}
        </button>
      </div>
    </form>
  );
}

/** `/rag`: the team's collections. */
export function RagHome() {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const queryClient = useQueryClient();
  const [creating, setCreating] = React.useState(false);
  const available = isRagAvailable();
  const collections = useQuery({
    queryKey: RAG_QUERY_KEYS.collections,
    queryFn: () => RagService.listCollections(),
    enabled: available,
  });

  return (
    <div
      data-testid="rag-home"
      className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 md:p-6"
    >
      <RagPageHeader>
        {available ? (
          <button
            type="button"
            data-testid="rag-new-collection"
            className={`${ragPrimaryButtonClassName} ml-auto flex items-center gap-1`}
            onClick={() => setCreating(true)}
          >
            <Plus size={14} />
            {t(I18nKey.RAG$NEW_COLLECTION)}
          </button>
        ) : null}
      </RagPageHeader>

      {!available ? (
        <p className={`${ragCardClassName} ${ragMutedClassName}`}>
          {t(I18nKey.RAG$NOT_CONFIGURED)}
        </p>
      ) : null}

      {creating ? (
        <NewCollectionForm
          onDone={(id) => {
            setCreating(false);
            void queryClient.invalidateQueries({
              queryKey: RAG_QUERY_KEYS.collections,
            });
            if (id) navigate(`${RAG_BASE_PATH}/${id}`);
          }}
        />
      ) : null}

      {collections.error ? <ErrorNote error={collections.error} /> : null}

      {collections.data && collections.data.length === 0 && !creating ? (
        <p
          data-testid="rag-empty"
          className={`${ragCardClassName} ${ragMutedClassName}`}
        >
          {t(I18nKey.RAG$EMPTY_COLLECTIONS)}
        </p>
      ) : null}

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(collections.data ?? []).map((collection) => (
          <li key={collection.id}>
            <button
              type="button"
              data-testid="rag-collection-card"
              onClick={() => navigate(`${RAG_BASE_PATH}/${collection.id}`)}
              className={`${ragCardClassName} flex h-full w-full flex-col gap-2 text-left hover:border-[var(--primary-500)]`}
            >
              <span className="text-base font-medium text-[var(--text-primary)]">
                {collection.name}
              </span>
              {collection.description ? (
                <span className={`${ragMutedClassName} line-clamp-2`}>
                  {collection.description}
                </span>
              ) : null}
              <span className="text-xs text-[var(--text-secondary)]">
                {t(I18nKey.RAG$STATS, {
                  sources: collection.source_count,
                  documents: collection.document_count,
                  chunks: collection.chunk_count,
                })}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                {collection.last_synced_at
                  ? t(I18nKey.RAG$LAST_SYNCED, {
                      time: formatWhen(collection.last_synced_at),
                    })
                  : t(I18nKey.RAG$NEVER_SYNCED)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
