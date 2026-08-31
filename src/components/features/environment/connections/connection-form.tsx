import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import type { ConnectorManifest } from "#/lib/environment/types/capability";
import {
  getInitialFormValues,
  hasFieldErrors,
  validateConnectorValues,
  type ConnectorFieldErrors,
  type ConnectorFormValues,
} from "#/lib/environment/validation";
import { ConnectorFieldInput } from "./connector-field-input";

/** Matches the debounce the manifest setup dialog already uses. */
const VALIDATE_DEBOUNCE_MS = 400;

export interface ConnectionFormProps {
  manifest: ConnectorManifest;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (values: ConnectorFormValues) => void;
  onCancel: () => void;
}

/**
 * Renders a provider's fields from its manifest. There is no per-vendor form
 * component anywhere in this module -- if a form looks wrong for a provider,
 * the fix belongs in that provider's manifest.
 */
export function ConnectionForm({
  manifest,
  submitting = false,
  submitLabel,
  onSubmit,
  onCancel,
}: ConnectionFormProps) {
  const { t } = useTranslation("openhands");
  const [values, setValues] = React.useState<ConnectorFormValues>(() =>
    getInitialFormValues(manifest),
  );
  const [errors, setErrors] = React.useState<ConnectorFieldErrors>({});
  // Fields the user has actually interacted with. Validating an untouched
  // form on mount would paint every required field red before anyone has had
  // a chance to type, which reads as failure rather than guidance.
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    setValues(getInitialFormValues(manifest));
    setErrors({});
    setTouched({});
  }, [manifest]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      const next = validateConnectorValues(manifest, values);
      setErrors(
        Object.fromEntries(
          Object.entries(next).filter(([name]) => touched[name]),
        ),
      );
    }, VALIDATE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [manifest, values, touched]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateConnectorValues(manifest, values);
    if (hasFieldErrors(validation)) {
      setTouched(
        Object.fromEntries(manifest.fields.map((field) => [field.name, true])),
      );
      setErrors(validation);
      return;
    }
    onSubmit(values);
  };

  return (
    <form
      data-testid={`connection-form-${manifest.id}`}
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
    >
      {manifest.fields.map((field) => (
        <ConnectorFieldInput
          key={field.name}
          field={field}
          value={values[field.name] ?? ""}
          error={errors[field.name]}
          disabled={submitting}
          onChange={(value) =>
            setValues((prev) => ({ ...prev, [field.name]: value }))
          }
          onBlur={() => setTouched((prev) => ({ ...prev, [field.name]: true }))}
        />
      ))}

      <div className="flex items-center gap-2">
        <BrandButton
          type="submit"
          variant="primary"
          isDisabled={submitting}
          testId={`connection-submit-${manifest.id}`}
        >
          {submitting ? t(I18nKey.ENVIRONMENT$SAVING) : submitLabel}
        </BrandButton>
        <BrandButton
          type="button"
          variant="secondary"
          isDisabled={submitting}
          onClick={onCancel}
          testId={`connection-cancel-${manifest.id}`}
        >
          {t(I18nKey.ENVIRONMENT$CANCEL)}
        </BrandButton>
      </div>
    </form>
  );
}
