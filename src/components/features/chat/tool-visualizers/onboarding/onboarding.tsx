import { useTranslation } from "react-i18next";
import { PlugZap } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { defineVisualizer } from "../define";
import { KeyValueGrid } from "../primitives/key-value-grid";
import { ONBOARDING_CONTROL_ACTION_KIND } from "#/constants/onboarding-control";
import { CAPABILITY_LABEL_KEY } from "#/lib/environment/display";
import type { Capability } from "#/lib/environment/types/capability";
import { getConnectorManifest } from "#/lib/environment/registry";
import { ConnectorLogo } from "#/components/features/environment/shared/connector-logo";

/**
 * Renders an `onboarding_control` call in the transcript.
 *
 * Worth rendering rather than leaving to the markdown fallback for one reason
 * in particular: when the agent asks for credentials, the reader should see
 * plainly that only field *names* crossed the wire. A raw JSON dump of the
 * tool call would show the same thing, but nobody reads those, and "the agent
 * asked for my API key" is exactly the moment someone deserves reassurance
 * about what was actually sent.
 */
export const onboardingVisualizer = defineVisualizer({
  actionKinds: [ONBOARDING_CONTROL_ACTION_KIND],
  Body: ({ action }) => {
    const { t } = useTranslation("openhands");
    if (!action) return null;

    const command = action.action.command;
    const providerId = action.action.provider_id ?? undefined;
    const manifest = providerId ? getConnectorManifest(providerId) : undefined;
    const capability = action.action.capability as Capability | undefined;

    const rows: { label: string; value: string }[] = [];
    if (capability && CAPABILITY_LABEL_KEY[capability]) {
      rows.push({
        label: t(I18nKey.ENVIRONMENT$CAPABILITIES_TITLE),
        value: t(CAPABILITY_LABEL_KEY[capability]),
      });
    }
    if (action.action.probe_kind) {
      rows.push({
        label: t(I18nKey.ENVIRONMENT$RUN_ALL_CHECKS),
        value: action.action.probe_kind,
      });
    }
    if (action.action.targets && action.action.targets.length > 0) {
      rows.push({
        label: t(I18nKey.ENVIRONMENT$EGRESS_TITLE),
        value: action.action.targets.join(", "),
      });
    }
    if (action.action.view) {
      rows.push({
        label: t(I18nKey.ENVIRONMENT$TITLE),
        value: action.action.view,
      });
    }
    if (action.action.rationale) {
      rows.push({
        label: t(I18nKey.ENVIRONMENT$PROFILE_CHANGE_TITLE),
        value: action.action.rationale,
      });
    }

    return (
      <div
        data-testid="onboarding-control-visualizer"
        data-command={command}
        className="flex flex-col gap-2"
      >
        <div className="flex items-center gap-2">
          {manifest ? (
            <ConnectorLogo logo={manifest.logo} size={20} />
          ) : (
            <PlugZap
              size={14}
              aria-hidden
              className="text-[var(--primary-500)]"
            />
          )}
          <span className="text-sm text-[var(--text-primary)]">
            {manifest ? t(manifest.nameKey) : t(I18nKey.ENVIRONMENT$TITLE)}
          </span>
          <span className="ame-badge ame-badge-neutral">{command}</span>
        </div>

        {action.action.fields && action.action.fields.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-[var(--text-secondary)]">
              {t(I18nKey.ENVIRONMENT$CREDENTIAL_NOTE)}
            </span>
            <div className="flex flex-wrap gap-1">
              {action.action.fields.map((field) => (
                <span key={field} className="ame-badge ame-badge-neutral">
                  {field}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {rows.length > 0 ? <KeyValueGrid rows={rows} /> : null}
      </div>
    );
  },
});
