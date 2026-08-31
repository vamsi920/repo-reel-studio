import React from "react";
import { useTranslation } from "react-i18next";
import { FileText, Download } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { useEnvironmentChecks } from "#/hooks/query/use-environment-checks";
import { useEnvironmentProfile } from "#/hooks/query/use-environment-profile";
import { useConnections } from "#/hooks/query/use-connections";
import { VANTAGE_LABEL_KEY } from "#/lib/environment/display";
import {
  EnvironmentService,
  EnvironmentServiceError,
} from "#/api/environment-service/environment-service.api";
import { buildEnvironmentBundle } from "#/lib/environment/bundle";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { useEnvironmentReadiness } from "#/hooks/query/use-environment-readiness";

function EnvironmentRunbookScreen() {
  const { t } = useTranslation("openhands");
  const { data: checks } = useEnvironmentChecks(100);
  const { data: profile } = useEnvironmentProfile();
  const { data: connections } = useConnections();
  const readiness = useEnvironmentReadiness(profile ?? null);
  const [packet, setPacket] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const handlePacket = React.useCallback(async () => {
    setBusy(true);
    try {
      const result = await EnvironmentService.handoffPacket();
      setPacket(result.markdown);
    } catch (error) {
      displayErrorToast(
        error instanceof EnvironmentServiceError
          ? error.message
          : t(I18nKey.ENVIRONMENT$ERROR_LOAD),
      );
    } finally {
      setBusy(false);
    }
  }, [t]);

  const handleExportBundle = React.useCallback(async () => {
    if (!profile) return;
    const bundle = await buildEnvironmentBundle(
      profile,
      readiness,
      (connections ?? []).map((connection) => ({
        capability: connection.capability,
        providerId: connection.providerId,
        instanceKey: connection.instanceKey,
      })),
    );
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "neodevex-environment-profile.json";
    anchor.click();
    URL.revokeObjectURL(url);
    displaySuccessToast(t(I18nKey.ENVIRONMENT$EXPORT_BUNDLE));
  }, [profile, readiness, connections, t]);

  return (
    <div data-testid="environment-runbook" className="flex flex-col gap-5 pb-6">
      <p className="text-sm text-[var(--text-secondary)]">
        {t(I18nKey.ENVIRONMENT$RUNBOOK_SUBTITLE)}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="ame-card flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2">
            <FileText
              size={14}
              aria-hidden
              className="text-[var(--primary-500)]"
            />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {t(I18nKey.ENVIRONMENT$HANDOFF_PACKET)}
            </h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            {t(I18nKey.ENVIRONMENT$HANDOFF_PACKET_HELP)}
          </p>
          <button
            type="button"
            data-testid="generate-handoff-packet"
            onClick={handlePacket}
            disabled={busy}
            className={cn(
              "ame-btn-primary ame-btn-sm self-start",
              busy && "loading",
            )}
          >
            {t(I18nKey.ENVIRONMENT$GENERATE_PACKET)}
          </button>
        </section>

        <section className="ame-card flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2">
            <Download
              size={14}
              aria-hidden
              className="text-[var(--primary-500)]"
            />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {t(I18nKey.ENVIRONMENT$EXPORT_BUNDLE)}
            </h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            {t(I18nKey.ENVIRONMENT$EXPORT_BUNDLE_HELP)}
          </p>
          <button
            type="button"
            data-testid="export-environment-bundle"
            onClick={handleExportBundle}
            className="ame-btn-secondary ame-btn-sm self-start"
          >
            {t(I18nKey.ENVIRONMENT$DOWNLOAD)}
          </button>
        </section>
      </div>

      {packet ? (
        <section className="ame-card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {t(I18nKey.ENVIRONMENT$HANDOFF_PACKET)}
          </h2>
          <pre
            data-testid="handoff-packet-body"
            className="max-h-[400px] overflow-auto rounded-[var(--radius-sm)] bg-[var(--background-secondary)] p-3 text-xs text-[var(--text-primary)]"
          >
            {packet}
          </pre>
        </section>
      ) : null}

      <section className="ame-card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {t(I18nKey.ENVIRONMENT$CHECK_HISTORY)}
        </h2>
        {checks && checks.length > 0 ? (
          <div className="overflow-x-auto">
            <table
              data-testid="check-history"
              className="w-full min-w-[520px] border-collapse text-left text-xs"
            >
              <tbody>
                {checks.map((check) => (
                  <tr
                    key={check.id}
                    className="border-t border-[var(--border-color)]"
                  >
                    <td className="py-2 pr-3">
                      <span
                        aria-hidden
                        className={cn(
                          "ame-pip",
                          check.ok ? "ame-pip-success" : "ame-pip-error",
                        )}
                      />
                    </td>
                    <td className="py-2 pr-3 text-[var(--text-primary)]">
                      {check.kind}
                    </td>
                    <td className="py-2 pr-3 font-mono text-[var(--text-secondary)]">
                      {check.target}
                    </td>
                    <td className="py-2 pr-3 text-[var(--text-tertiary)]">
                      {t(VANTAGE_LABEL_KEY[check.vantage])}
                    </td>
                    <td className="py-2 text-[var(--text-tertiary)]">
                      {new Date(check.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            {t(I18nKey.ENVIRONMENT$CHECK_HISTORY_EMPTY)}
          </p>
        )}
      </section>
    </div>
  );
}

export default EnvironmentRunbookScreen;
