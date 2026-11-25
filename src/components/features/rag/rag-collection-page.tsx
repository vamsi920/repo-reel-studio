import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { RagService } from "#/api/rag/rag-service.api";
import { useNavigation } from "#/context/navigation-context";
import { RAG_BASE_PATH, RagPageHeader } from "./rag-home";
import { RagSourcesTab } from "./rag-sources-tab";
import { RagAskTab } from "./rag-ask-tab";
import { RagQualityTab } from "./rag-quality-tab";
import { RagConnectTab } from "./rag-connect-tab";
import {
  ErrorNote,
  RAG_QUERY_KEYS,
  ragMutedClassName,
  ragSecondaryButtonClassName,
} from "./rag-shared";

export const RAG_TABS = ["sources", "ask", "quality", "connect"] as const;
export type RagTab = (typeof RAG_TABS)[number];

const TAB_LABEL: Record<RagTab, I18nKey> = {
  sources: I18nKey.RAG$TAB_SOURCES,
  ask: I18nKey.RAG$TAB_ASK,
  quality: I18nKey.RAG$TAB_QUALITY,
  connect: I18nKey.RAG$TAB_CONNECT,
};

/** `/rag/:collectionId`: one collection's sources, playground, quality and access. */
export function RagCollectionPage({ collectionId }: { collectionId: string }) {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const queryClient = useQueryClient();
  const collections = useQuery({
    queryKey: RAG_QUERY_KEYS.collections,
    queryFn: () => RagService.listCollections(),
  });
  const collection = collections.data?.find((c) => c.id === collectionId);
  const [tab, setTab] = React.useState<RagTab>("sources");
  const [error, setError] = React.useState<unknown>(null);

  // A brand-new collection has nothing to ask yet; one with passages opens on Ask.
  const initialised = React.useRef(false);
  React.useEffect(() => {
    if (!initialised.current && collection) {
      initialised.current = true;
      if (collection.chunk_count > 0) setTab("ask");
    }
  }, [collection]);

  return (
    <div
      data-testid="rag-collection-page"
      className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 md:p-6"
    >
      <button
        type="button"
        className="flex w-fit items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        onClick={() => navigate(RAG_BASE_PATH)}
      >
        <ArrowLeft size={14} />
        {t(I18nKey.RAG$BACK)}
      </button>
      <RagPageHeader />
      {collections.error ? <ErrorNote error={collections.error} /> : null}
      {collections.isSuccess && !collection ? (
        <p className={ragMutedClassName}>
          {t(I18nKey.RAG$NOT_FOUND_COLLECTION)}
        </p>
      ) : null}
      {collection ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2
                data-testid="rag-collection-name-heading"
                className="text-lg font-semibold text-[var(--text-primary)]"
              >
                {collection.name}
              </h2>
              {collection.description ? (
                <p className={ragMutedClassName}>{collection.description}</p>
              ) : null}
              <p className="text-xs text-[var(--text-secondary)]">
                {t(I18nKey.RAG$STATS, {
                  sources: collection.source_count,
                  documents: collection.document_count,
                  chunks: collection.chunk_count,
                })}
              </p>
            </div>
            <button
              type="button"
              data-testid="rag-delete-collection"
              className={`${ragSecondaryButtonClassName} text-red-600`}
              onClick={async () => {
                if (
                  !window.confirm(
                    t(I18nKey.RAG$CONFIRM_DELETE_COLLECTION, {
                      name: collection.name,
                    }),
                  )
                )
                  return;
                try {
                  await RagService.deleteCollection(collection.id);
                  await queryClient.invalidateQueries({
                    queryKey: RAG_QUERY_KEYS.collections,
                  });
                  navigate(RAG_BASE_PATH);
                } catch (e) {
                  setError(e);
                }
              }}
            >
              {t(I18nKey.RAG$DELETE_COLLECTION)}
            </button>
          </div>
          <ErrorNote error={error} />
          <div
            role="tablist"
            className="flex gap-1 overflow-x-auto border-b border-[var(--border-color)]"
          >
            {RAG_TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                data-testid={`rag-tab-${id}`}
                onClick={() => setTab(id)}
                className={`border-b-2 px-3 py-2 text-sm ${
                  tab === id
                    ? "border-[var(--primary-500)] text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t(TAB_LABEL[id])}
              </button>
            ))}
          </div>
          {tab === "sources" ? <RagSourcesTab collection={collection} /> : null}
          {tab === "ask" ? <RagAskTab collection={collection} /> : null}
          {tab === "quality" ? <RagQualityTab collection={collection} /> : null}
          {tab === "connect" ? <RagConnectTab collection={collection} /> : null}
        </>
      ) : null}
    </div>
  );
}
