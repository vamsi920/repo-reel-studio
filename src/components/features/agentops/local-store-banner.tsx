import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

/**
 * Warns that the Control Tower is serving data from the ephemeral local-disk
 * JSONL store rather than the durable Supabase-backed one — every runtime
 * restart discards it with no other signal that this happened. Renders
 * nothing once the collector is configured with `SUPABASE_URL` and
 * `SUPABASE_SERVICE_ROLE_KEY`, which switches it to the persistent store.
 */
export function LocalStoreBanner() {
  const { t } = useTranslation("openhands");

  return (
    <div
      role="status"
      data-testid="agentops-local-store-banner"
      className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--warning-500)] bg-[var(--warning-bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]"
    >
      <TriangleAlert
        size={14}
        className="mt-0.5 shrink-0 text-[var(--warning-500)]"
      />
      <span>{t(I18nKey.AGENTOPS$LOCAL_STORE_BANNER)}</span>
    </div>
  );
}
