import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { useGithubConnection } from "#/hooks/query/use-github-connection";
import { useConnections } from "#/hooks/query/use-connections";
import { useNavigation } from "#/context/navigation-context";

const SETTINGS_CONNECTIONS_PATH = "/settings/connections";
const GITHUB_PROVIDER_IDS = new Set(["github", "github-enterprise"]);

/**
 * Explains an empty repository picker for a teammate.
 *
 * Repository lists come from the signed-in user's own GitHub token. When a
 * colleague connected GitHub for the org but this user never connected their
 * own account, the picker used to be silently empty. Shown only in exactly
 * that case: the per-user lookup succeeded and found nothing, and the org
 * does have a GitHub connection.
 */
export function TeamGithubNotice() {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const personal = useGithubConnection();
  const { data: connections } = useConnections();

  const orgHasGithub = (connections ?? []).some((connection) =>
    GITHUB_PROVIDER_IDS.has(connection.providerId),
  );
  const personalMissing =
    personal.isSuccess && personal.data === null && !personal.isError;
  if (!orgHasGithub || !personalMissing) return null;

  return (
    <div
      data-testid="team-github-notice"
      role="note"
      className="flex w-full items-start gap-2 rounded-md border border-[var(--oh-border)] bg-[var(--background-secondary)] p-3 text-xs text-[var(--text-secondary)]"
    >
      <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
      <div className="flex flex-col gap-2">
        <p>{t(I18nKey.CONNECTIONS$TEAM_GITHUB_HINT)}</p>
        <button
          type="button"
          data-testid="team-github-notice-connect"
          onClick={() => navigate(SETTINGS_CONNECTIONS_PATH)}
          className="ame-btn-secondary ame-btn-sm self-start"
        >
          {t(I18nKey.CONNECTIONS$CONNECT_YOUR_GITHUB)}
        </button>
      </div>
    </div>
  );
}
