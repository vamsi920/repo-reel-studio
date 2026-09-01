import React from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { I18nKey } from "#/i18n/declaration";
import {
  getConnectorManifest,
  secretFieldNames,
} from "#/lib/environment/registry";
import { ConnectionForm } from "#/components/features/environment/connections/connection-form";
import { ConnectorLogo } from "#/components/features/environment/shared/connector-logo";
import { ProbeResultPanel } from "#/components/features/environment/shared/probe-result-panel";
import { CAPABILITY_LABEL_KEY } from "#/lib/environment/display";
import {
  EnvironmentService,
  EnvironmentServiceError,
} from "#/api/environment-service/environment-service.api";
import { invalidateConnectionCaches } from "#/lib/environment/invalidate-connection-caches";
import { ONBOARDING_RESULT_PREFIX } from "#/constants/onboarding-control";
import {
  useOnboardingStudioStore,
  type WorkbenchCard,
} from "#/stores/onboarding-studio-store";
import type { ConnectorFormValues } from "#/lib/environment/validation";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import type { PostResultFn } from "#/services/onboarding-control";

export interface ConnectionCardProps {
  card: Extract<WorkbenchCard, { kind: "form" }>;
  postResult: PostResultFn;
}

/**
 * The box that opens when the agent needs a connection.
 *
 * Submitting does three things in one motion, which is the whole point: the
 * credential goes straight from this component to the Edge Function, the Edge
 * Function verifies it before answering, and the redacted result is posted
 * back into the conversation so the agent can react without the user having to
 * report what happened.
 *
 * On failure the form stays open and pre-filled with the probe's remediation
 * showing. Clearing it would make the user retype a working host because one
 * key was wrong.
 */
export function ConnectionCard({ card, postResult }: ConnectionCardProps) {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const updateCard = useOnboardingStudioStore((state) => state.updateCard);
  const [submitting, setSubmitting] = React.useState(false);

  const manifest = getConnectorManifest(card.providerId);
  if (!manifest) return null;

  const isOAuth = Boolean(manifest.oauth);

  const handleOAuth = async () => {
    setSubmitting(true);
    try {
      const { authorizeUrl } = await EnvironmentService.startOAuth({
        capability: card.capability,
        providerId: card.providerId,
        instanceKey: card.instanceKey,
        // Comes back here, not to the settings page: the legacy OAuth starts
        // hardcode `/settings/connections`, which would strand the user
        // outside the conversation they were in the middle of.
        returnTo: "/environment/setup",
      });
      window.location.href = authorizeUrl;
    } catch (error) {
      setSubmitting(false);
      displayErrorToast(
        error instanceof EnvironmentServiceError
          ? error.message
          : t(I18nKey.ENVIRONMENT$ERROR_SAVE),
      );
    }
  };

  const handleSubmit = async (values: ConnectorFormValues) => {
    setSubmitting(true);
    updateCard(card.id, { status: "submitting" });
    try {
      const secretNames = new Set(secretFieldNames(manifest));
      const credentials: ConnectorFormValues = {};
      const config: Record<string, string> = {};
      for (const [name, value] of Object.entries(values)) {
        if (!value) continue;
        if (secretNames.has(name)) credentials[name] = value;
        else config[name] = value;
      }

      const receipt = await EnvironmentService.setCredentials({
        capability: card.capability,
        providerId: card.providerId,
        instanceKey: card.instanceKey,
        config,
        credentials,
      });

      updateCard(card.id, {
        status: receipt.probe?.ok ? "ok" : "failed",
        result: receipt.probe,
      });

      // Everything the rest of the app reads about connections is refreshed
      // here, so the repository picker is usable the moment this returns
      // rather than after a reload.
      await invalidateConnectionCaches(queryClient);

      // Redacted by the server before it ever reached this component.
      postResult(
        `${ONBOARDING_RESULT_PREFIX}${JSON.stringify({
          status: receipt.status,
          provider: receipt.providerId,
          instance: receipt.instanceKey,
          fingerprint: receipt.fingerprint,
          redacted: receipt.redacted,
          granted_scopes: receipt.grantedScopes,
          missing_scopes: receipt.missingScopes,
          verified: receipt.probe?.ok ?? false,
          checks: receipt.probe?.checks.map((check) => ({
            id: check.id,
            ok: check.ok,
          })),
          remediation: receipt.probe?.remediation?.codeKey,
        })}`,
      );
    } catch (error) {
      const message =
        error instanceof EnvironmentServiceError
          ? error.message
          : t(I18nKey.ENVIRONMENT$ERROR_SAVE);
      updateCard(card.id, { status: "failed" });
      displayErrorToast(message);
      postResult(
        `${ONBOARDING_RESULT_PREFIX}${JSON.stringify({
          status: "error",
          provider: card.providerId,
          reason: message,
        })}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid={`workbench-connection-card-${card.providerId}`}
      data-status={card.status}
      className="instrument-panel ame-card flex flex-col gap-3 p-4"
    >
      <div className="flex items-start gap-3">
        <ConnectorLogo logo={manifest.logo} size={32} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="ame-eyebrow">
            {t(CAPABILITY_LABEL_KEY[card.capability])}
          </span>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {t(manifest.nameKey)}
          </h3>
        </div>
      </div>

      <p className="text-xs text-[var(--text-secondary)]">
        {t(I18nKey.ENVIRONMENT$CREDENTIAL_NOTE)}
      </p>

      {isOAuth && manifest.fields.length === 0 ? (
        <button
          type="button"
          data-testid={`workbench-oauth-${card.providerId}`}
          disabled={submitting}
          onClick={handleOAuth}
          className="ame-btn-primary ame-btn-sm self-start"
        >
          {submitting
            ? t(I18nKey.ENVIRONMENT$CONNECTING)
            : t(I18nKey.ENVIRONMENT$CONNECT)}
        </button>
      ) : (
        <ConnectionForm
          manifest={manifest}
          submitting={submitting}
          submitLabel={t(I18nKey.ENVIRONMENT$CREDENTIAL_SUBMIT)}
          onSubmit={isOAuth ? handleOAuth : handleSubmit}
          onCancel={() =>
            useOnboardingStudioStore.getState().removeCard(card.id)
          }
        />
      )}

      {card.result ? <ProbeResultPanel result={card.result} /> : null}
    </div>
  );
}
