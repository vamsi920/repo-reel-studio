import React from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ConnectorFieldInput } from "#/components/features/environment/connections/connector-field-input";
import { ConnectorLogo } from "#/components/features/environment/shared/connector-logo";
import { getConnectorManifest } from "#/lib/environment/registry";
import {
  hasFieldErrors,
  validateConnectorValues,
  type ConnectorFieldErrors,
  type ConnectorFormValues,
} from "#/lib/environment/validation";
import {
  EnvironmentService,
  EnvironmentServiceError,
} from "#/api/environment-service/environment-service.api";
import { ONBOARDING_RESULT_PREFIX } from "#/constants/onboarding-control";
import type { PendingCredentialRequest } from "#/stores/onboarding-copilot-store";
import { displayErrorToast } from "#/utils/custom-toast-handlers";

export interface CredentialRequestSheetProps {
  request: PendingCredentialRequest;
  onDone: () => void;
  onResult: (message: string) => void;
}

/**
 * The only place in this application where a credential is typed.
 *
 * Three properties make the boundary real rather than aspirational:
 *
 *  1. `values` is component-local state. There is no store slice, query cache
 *     entry or context this could be lifted into, so there is nowhere for a
 *     secret to persist or be serialised from.
 *  2. Submission goes straight from this component to the Edge Function. It
 *     never passes through the WebSocket, the event store, or a chat message.
 *  3. What is posted back to the agent is the receipt the server returned --
 *     a type with no field a plaintext value could occupy.
 *
 * If this component is ever refactored to hoist its state, the boundary is
 * gone; `__tests__/services/onboarding-control.test.ts` fails on exactly that.
 */
export function CredentialRequestSheet({
  request,
  onDone,
  onResult,
}: CredentialRequestSheetProps) {
  const { t } = useTranslation("openhands");
  const manifest = getConnectorManifest(request.providerId);
  const [values, setValues] = React.useState<ConnectorFormValues>({});
  const [errors, setErrors] = React.useState<ConnectorFieldErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  if (!manifest) return null;

  const fields = manifest.fields.filter(
    (field) => request.fields.includes(field.name) || !field.secret,
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateConnectorValues(manifest, values);
    if (hasFieldErrors(validation)) {
      setErrors(validation);
      return;
    }

    setSubmitting(true);
    try {
      const credentials: ConnectorFormValues = {};
      const config: Record<string, string> = {};
      for (const field of manifest.fields) {
        const value = values[field.name];
        if (!value) continue;
        if (field.secret) credentials[field.name] = value;
        else config[field.name] = value;
      }

      const receipt = await EnvironmentService.setCredentials({
        capability: request.capability,
        providerId: request.providerId,
        instanceKey: request.instanceKey,
        config,
        credentials,
      });

      // Everything in `receipt` was redacted server-side. This is the only
      // thing about this interaction the agent ever learns.
      onResult(
        `${ONBOARDING_RESULT_PREFIX}${JSON.stringify({
          status: receipt.status,
          provider: receipt.providerId,
          instance: receipt.instanceKey,
          fingerprint: receipt.fingerprint,
          redacted: receipt.redacted,
          granted_scopes: receipt.grantedScopes,
          missing_scopes: receipt.missingScopes,
          verified: receipt.probe?.ok ?? false,
          latency_ms: receipt.probe?.latencyMs,
        })}`,
      );
      onDone();
    } catch (error) {
      const message =
        error instanceof EnvironmentServiceError
          ? error.message
          : t(I18nKey.ENVIRONMENT$ERROR_SAVE);
      displayErrorToast(message);
      onResult(
        `${ONBOARDING_RESULT_PREFIX}${JSON.stringify({
          status: "error",
          provider: request.providerId,
          reason: message,
        })}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      data-testid="credential-request-sheet"
      onSubmit={handleSubmit}
      className="instrument-panel ame-card flex flex-col gap-4 p-4"
    >
      <div className="flex items-start gap-3">
        <ConnectorLogo logo={manifest.logo} size={32} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="ame-eyebrow">
            {t(I18nKey.ENVIRONMENT$CREDENTIAL_REQUESTED_BY_AGENT)}
          </span>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {t(manifest.nameKey)}
          </h3>
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--background-secondary)] p-3 text-xs text-[var(--text-secondary)]">
        <ShieldCheck
          size={14}
          aria-hidden
          className="mt-0.5 shrink-0 text-[var(--success-500)]"
        />
        {t(I18nKey.ENVIRONMENT$CREDENTIAL_NOTE)}
      </p>

      {fields.map((field) => (
        <ConnectorFieldInput
          key={field.name}
          field={field}
          value={values[field.name] ?? ""}
          error={errors[field.name]}
          disabled={submitting}
          onChange={(value) =>
            setValues((prev) => ({ ...prev, [field.name]: value }))
          }
        />
      ))}

      <div className="flex items-center gap-2">
        <BrandButton
          type="submit"
          variant="primary"
          isDisabled={submitting}
          testId="credential-submit"
        >
          {submitting
            ? t(I18nKey.ENVIRONMENT$CREDENTIAL_SUBMITTING)
            : t(I18nKey.ENVIRONMENT$CREDENTIAL_SUBMIT)}
        </BrandButton>
        <BrandButton
          type="button"
          variant="secondary"
          isDisabled={submitting}
          onClick={onDone}
          testId="credential-cancel"
        >
          {t(I18nKey.ENVIRONMENT$CANCEL)}
        </BrandButton>
      </div>
    </form>
  );
}
