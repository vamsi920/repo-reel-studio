import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import {
  useKnowledgeStore,
  type RefreshCadence,
} from "#/stores/knowledge-store";
import { useNavigation } from "#/context/navigation-context";
import { I18nKey } from "#/i18n/declaration";
import { formatRelativeTime } from "#/utils/format-relative-time";
import { generateKnowledge } from "#/lib/knowledge/generate-knowledge";

const CADENCE_MS: Record<Exclude<RefreshCadence, "manual">, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

const CADENCE_LABEL_KEY: Record<RefreshCadence, I18nKey> = {
  manual: I18nKey.KT$REFRESH_MANUAL,
  daily: I18nKey.KT$REFRESH_DAILY,
  weekly: I18nKey.KT$REFRESH_WEEKLY,
  monthly: I18nKey.KT$REFRESH_MONTHLY,
};

/**
 * A preference, not a scheduler. This app has no background process to run
 * a cron job in — "due for a refresh" is computed on render from the chosen
 * cadence + the knowledge's generatedAt timestamp, and only ever surfaces as
 * a one-click prompt while someone has this page open. It never
 * regenerates silently.
 */
export function KtRefreshCadence({ repositoryId }: { repositoryId: string }) {
  const { t, i18n } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const state = useKnowledgeStore((s) => s.byRepositoryId[repositoryId]);
  const setRefreshCadence = useKnowledgeStore((s) => s.setRefreshCadence);
  const startGenerating = useKnowledgeStore((s) => s.startGenerating);
  const setProgress = useKnowledgeStore((s) => s.setProgress);
  const setReady = useKnowledgeStore((s) => s.setReady);
  const setError = useKnowledgeStore((s) => s.setError);

  if (!state?.knowledge) return null;

  const cadence = state.refreshCadence;
  const generatedAtMs = new Date(state.knowledge.generatedAt).getTime();
  const isDue =
    cadence !== "manual" &&
    // Preference UI only — intentionally recomputed while the page is open.
    // eslint-disable-next-line react-hooks/purity -- refresh-due signal
    Date.now() - generatedAtMs > CADENCE_MS[cadence];
  const isRegenerating = state.status === "generating";

  const handleRegenerate = () => {
    void generateKnowledge(
      state.snapshot,
      state.conversationUrl,
      state.sessionApiKey,
      { startGenerating, setProgress, setReady, setError },
      (path) => navigate?.(path),
    );
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-xs text-[var(--oh-muted)]">
        {t(I18nKey.KT$LAST_GENERATED, {
          time: formatRelativeTime(
            state.knowledge.generatedAt,
            i18n.language,
            t,
          ),
        })}
      </span>
      <select
        value={cadence}
        onChange={(event) =>
          setRefreshCadence(repositoryId, event.target.value as RefreshCadence)
        }
        aria-label={t(I18nKey.KT$AUTO_REFRESH)}
        className="rounded-md border border-[var(--oh-border)] bg-transparent px-2 py-1 text-xs text-[var(--oh-foreground)]"
      >
        {(Object.keys(CADENCE_LABEL_KEY) as RefreshCadence[]).map((option) => (
          <option key={option} value={option}>
            {t(CADENCE_LABEL_KEY[option])}
          </option>
        ))}
      </select>
      {isDue && !isRegenerating && (
        <button
          type="button"
          onClick={handleRegenerate}
          className="ame-btn-secondary ame-btn-sm flex items-center gap-1"
        >
          <RefreshCw className="size-3.5" aria-hidden />
          {t(I18nKey.KT$REFRESH_DUE)}
        </button>
      )}
    </div>
  );
}
