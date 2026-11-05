import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useImportAutomation } from "#/hooks/query/use-automations";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { BrandButton } from "#/components/features/settings/brand-button";
import { listOtherOriginAutomations } from "#/lib/data-platform/automation-index";
import { isLocalOrigin } from "#/lib/data-platform/conversation-archive";

/**
 * Automations that live on the user's other agent-server. They keep running
 * there; "Copy here" imports a turned-off copy.
 */
export function OtherEnvironmentAutomations() {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const importAutomation = useImportAutomation();
  const { data } = useQuery({
    queryKey: ["other-environment-automations", backend.id, backend.host],
    queryFn: listOtherOriginAutomations,
    refetchInterval: 60_000,
  });
  if (!data?.length) return null;
  return (
    <section
      data-testid="other-environment-automations"
      className="flex flex-col gap-3"
    >
      <div>
        <h2 className="text-sm font-medium text-[var(--oh-foreground)]">
          {t(I18nKey.AUTOMATION_SYNC$OTHER_ENVIRONMENT)}
        </h2>
        <p className="text-xs text-[var(--oh-muted)]">
          {t(I18nKey.AUTOMATION_SYNC$HELP)}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {data.map((automation) => (
          <li
            key={`${automation.origin}:${automation.automation_id}`}
            className="flex items-center gap-3 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-[var(--oh-foreground)]">
                {automation.name}
              </p>
              <p className="text-xs text-[var(--oh-muted)]">
                {isLocalOrigin(automation.origin)
                  ? t(I18nKey.ARCHIVE$RAN_LOCALLY)
                  : t(I18nKey.ARCHIVE$RAN_IN_CLOUD)}
                {" · "}
                {automation.enabled
                  ? t(I18nKey.AUTOMATION_SYNC$ON)
                  : t(I18nKey.AUTOMATION_SYNC$OFF)}
              </p>
            </div>
            <BrandButton
              testId={`copy-automation-${automation.automation_id}`}
              type="button"
              variant="secondary"
              isDisabled={importAutomation.isPending}
              onClick={() =>
                importAutomation.mutate(
                  { ...automation.spec, enabled: false },
                  {
                    onSuccess: () =>
                      displaySuccessToast(t(I18nKey.AUTOMATION_SYNC$COPY_HERE)),
                    onError: (error) =>
                      displayErrorToast(
                        error instanceof Error ? error.message : String(error),
                      ),
                  },
                )
              }
            >
              {t(I18nKey.AUTOMATION_SYNC$COPY_HERE)}
            </BrandButton>
          </li>
        ))}
      </ul>
    </section>
  );
}
