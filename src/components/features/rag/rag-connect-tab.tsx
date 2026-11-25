import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { I18nKey } from "#/i18n/declaration";
import {
  RagService,
  ragMcpUrl,
  ragServiceUrl,
  type RagCollection,
} from "#/api/rag/rag-service.api";
import {
  connectRagToAgents,
  disconnectRagFromAgents,
  isRagConnectedToAgents,
} from "#/services/rag-agents";
import {
  ErrorNote,
  RAG_QUERY_KEYS,
  formatWhen,
  ragCardClassName,
  ragInputClassName,
  ragMutedClassName,
  ragPrimaryButtonClassName,
  ragSecondaryButtonClassName,
  useCopy,
} from "./rag-shared";

const KEY_PLACEHOLDER = "nrag_…";

function CodeBlock({ id, code }: { id: string; code: string }) {
  const { t } = useTranslation("openhands");
  const [copied, copy] = useCopy();
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md bg-[var(--oh-interactive-hover)] p-3 text-xs text-[var(--text-primary)]">
        {code}
      </pre>
      <button
        type="button"
        className="absolute right-2 top-2 rounded border border-[var(--border-color)] bg-[var(--oh-surface,transparent)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
        onClick={() => copy(id, code)}
      >
        {copied === id ? t(I18nKey.RAG$COPIED) : t(I18nKey.RAG$COPY)}
      </button>
    </div>
  );
}

export function RagConnectTab({ collection }: { collection: RagCollection }) {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const [keyName, setKeyName] = React.useState("");
  const [newKey, setNewKey] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [copied, copy] = useCopy();

  const keys = useQuery({
    queryKey: RAG_QUERY_KEYS.apiKeys,
    queryFn: () => RagService.listApiKeys(),
  });
  const agents = useQuery({
    queryKey: RAG_QUERY_KEYS.agents,
    queryFn: () => isRagConnectedToAgents(),
    retry: false,
  });

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: RAG_QUERY_KEYS.apiKeys });
      void queryClient.invalidateQueries({ queryKey: RAG_QUERY_KEYS.agents });
    }
  };

  const example = `curl -s ${ragServiceUrl()} \\
  -H "x-rag-key: ${newKey ?? KEY_PLACEHOLDER}" \\
  -H "content-type: application/json" \\
  -d '{"action":"answer","collection_ids":["${collection.id}"],"query":"How do we deploy?"}'`;

  return (
    <div data-testid="rag-connect-tab" className="flex flex-col gap-4">
      <section className={`${ragCardClassName} flex flex-col gap-2`}>
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          {t(I18nKey.RAG$CONNECT_AGENTS_TITLE)}
        </h3>
        <p className={ragMutedClassName}>
          {t(I18nKey.RAG$CONNECT_AGENTS_BODY)}
        </p>
        {agents.data ? (
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="rag-agents-connected"
              className="text-sm text-emerald-600"
            >
              {t(I18nKey.RAG$AGENTS_CONNECTED)}
            </span>
            <button
              type="button"
              className={ragSecondaryButtonClassName}
              disabled={busy}
              onClick={() => void act(disconnectRagFromAgents)}
            >
              {t(I18nKey.RAG$DISCONNECT_AGENTS)}
            </button>
          </div>
        ) : (
          <div>
            <button
              type="button"
              data-testid="rag-connect-agents"
              className={ragPrimaryButtonClassName}
              disabled={busy || agents.isLoading}
              onClick={() => void act(() => connectRagToAgents(null))}
            >
              {t(I18nKey.RAG$CONNECT_AGENTS)}
            </button>
          </div>
        )}
      </section>

      <section className={`${ragCardClassName} flex flex-col gap-3`}>
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          {t(I18nKey.RAG$API_TITLE)}
        </h3>
        <p className={ragMutedClassName}>{t(I18nKey.RAG$API_BODY)}</p>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const created = await RagService.createApiKey(
                keyName.trim() || collection.name,
                null,
              );
              setNewKey(created.key);
              setKeyName("");
            });
          }}
        >
          <input
            data-testid="rag-key-name"
            className={`${ragInputClassName} max-w-xs`}
            placeholder={t(I18nKey.RAG$NEW_KEY_NAME)}
            value={keyName}
            maxLength={120}
            onChange={(e) => setKeyName(e.target.value)}
          />
          <button
            type="submit"
            data-testid="rag-create-key"
            className={ragPrimaryButtonClassName}
            disabled={busy}
          >
            {t(I18nKey.RAG$CREATE_KEY)}
          </button>
        </form>
        {newKey ? (
          <div
            data-testid="rag-new-key"
            className="flex flex-col gap-1 rounded-md border border-amber-500/40 p-3"
          >
            <span className="text-xs text-amber-600">
              {t(I18nKey.RAG$KEY_ONCE)}
            </span>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">
                {newKey}
              </code>
              <button
                type="button"
                className={ragSecondaryButtonClassName}
                onClick={() => copy("key", newKey)}
              >
                {copied === "key" ? t(I18nKey.RAG$COPIED) : t(I18nKey.RAG$COPY)}
              </button>
            </div>
          </div>
        ) : null}
        <ErrorNote error={error ?? keys.error} />
        {keys.data && keys.data.length === 0 ? (
          <p className={ragMutedClassName}>{t(I18nKey.RAG$KEYS_EMPTY)}</p>
        ) : null}
        <ul className="flex flex-col gap-1">
          {(keys.data ?? []).map((key) => (
            <li
              key={key.id}
              data-testid="rag-key-row"
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <span className="font-medium text-[var(--text-primary)]">
                {key.name}
              </span>
              <code className="text-xs text-[var(--text-secondary)]">
                {key.prefix}…
              </code>
              <span className="text-xs text-[var(--text-secondary)]">
                {key.revoked_at
                  ? t(I18nKey.RAG$REVOKED)
                  : key.last_used_at
                    ? t(I18nKey.RAG$KEY_LAST_USED, {
                        time: formatWhen(key.last_used_at),
                      })
                    : t(I18nKey.RAG$KEY_NEVER_USED)}
              </span>
              {!key.revoked_at ? (
                <button
                  type="button"
                  className="ml-auto text-xs text-red-600 hover:underline"
                  disabled={busy}
                  onClick={() =>
                    void act(() => RagService.revokeApiKey(key.id))
                  }
                >
                  {t(I18nKey.RAG$REVOKE)}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--text-primary)]">
            {t(I18nKey.RAG$MCP_URL)}
          </span>
          <CodeBlock id="mcp" code={ragMcpUrl()} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--text-primary)]">
            {t(I18nKey.RAG$EXAMPLE_REQUEST)}
          </span>
          <CodeBlock id="curl" code={example} />
        </div>
      </section>
    </div>
  );
}
