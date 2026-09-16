import { useTranslation } from "react-i18next";
import { IoIosGlobe } from "react-icons/io";
import { I18nKey } from "#/i18n/declaration";
import { ConversationTabEmptyState } from "#/components/features/conversation/conversation-tab-empty-state";

type EmptyBrowserMessageProps = {
  // The confirmed page URL, when the browser has loaded a page but the tool
  // returned no screenshot for it (its default unless the agent asks for one).
  url?: string;
};

export function EmptyBrowserMessage({ url = "" }: EmptyBrowserMessageProps) {
  const { t } = useTranslation("openhands");

  if (url) {
    return (
      <ConversationTabEmptyState icon={<IoIosGlobe />}>
        <span data-testid="browser-page-loaded-no-screenshot">
          {t(I18nKey.BROWSER$PAGE_LOADED_NO_SCREENSHOT)}
        </span>
        <span className="mt-1 block break-all text-[var(--oh-text-tertiary)]">
          {url}
        </span>
      </ConversationTabEmptyState>
    );
  }

  return (
    <ConversationTabEmptyState icon={<IoIosGlobe />}>
      {t(I18nKey.BROWSER$NO_PAGE_LOADED)}
    </ConversationTabEmptyState>
  );
}
