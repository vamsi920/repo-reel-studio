import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import type { ConnectorManifest } from "#/lib/environment/types/capability";
import type { ConnectionRecord } from "#/lib/data-platform/repositories/connections-repository";
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
  /**
   * The provider's already-saved connection, when this form is reopened to
   * reconfigure or rotate a credential rather than connect for the first
   * time. Passing this in seeds non-secret fields from the real, stored
   * config instead of the manifest's defaults -- see the seeding effect
   * below for why that distinction matters.
   */
  existingConnection?: ConnectionRecord | null;
  /**
   * Narrows which of the manifest's fields are shown, matching
   * `WorkbenchCard["fields"]` (`"all"` renders every field). A non-secret
   * field is always shown regardless -- there is no way to correct a
   * required host/region otherwise. Defaults to `"all"`.
   */
  visibleFields?: string[] | "all";
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
  existingConnection = null,
  visibleFields = "all",
  submitting = false,
  submitLabel,
  onSubmit,
  onCancel,
}: ConnectionFormProps) {
  const { t } = useTranslation("openhands");
  // A `request_credentials` card narrows this to the one secret being
  // rotated -- everything else stays visible so a required host/region can
  // still be corrected, but does not get re-shown wholesale. This used to be
  // ignored entirely (the card always rendered every manifest field), which
  // defeated the point of "narrows this sheet to a secret rotation".
  const fields =
    visibleFields === "all"
      ? manifest.fields
      : manifest.fields.filter(
          (field) => visibleFields.includes(field.name) || !field.secret,
        );
  const visibleFieldNames = new Set(fields.map((field) => field.name));
  const [values, setValues] = React.useState<ConnectorFormValues>(() =>
    getInitialFormValues(manifest),
  );
  const [errors, setErrors] = React.useState<ConnectorFieldErrors>({});
  // Fields the user has actually interacted with. Validating an untouched
  // form on mount would paint every required field red before anyone has had
  // a chance to type, which reads as failure rather than guidance.
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  // Tracks which manifest the saved config has already been seeded into, so
  // switching providers resets to that provider's own defaults but an
  // unrelated re-render of `existingConnection` (e.g. a query cache refresh)
  // does not stomp on something the user has already started typing.
  const seededForRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    setValues(getInitialFormValues(manifest));
    setErrors({});
    setTouched({});
    seededForRef.current = null;
  }, [manifest]);

  React.useEffect(() => {
    if (!existingConnection || seededForRef.current === manifest.id) return;
    seededForRef.current = manifest.id;
    // Reopening this form to reconfigure or rotate a credential on an
    // already-connected provider used to seed every non-secret field (host,
    // region, bucket, ...) from the manifest's default instead of the
    // connection's real, saved value. For any field whose manifest default
    // is non-blank (PostHog's `instanceHost`, GitHub Enterprise's host,
    // S3's region, ...) that meant submitting the form -- even just to
    // rotate a secret -- silently overwrote a custom value the user had
    // already set, with a "success" toast and no warning. Merging the saved
    // config in here, once per manifest, fixes that without touching fields
    // the user has already edited in this render.
    setValues((prev) => ({
      ...prev,
      ...Object.fromEntries(
        Object.entries(existingConnection.config).map(([name, value]) => [
          name,
          String(value),
        ]),
      ),
    }));
  }, [manifest, existingConnection]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      const next = validateConnectorValues(manifest, values);
      setErrors(
        Object.fromEntries(
          Object.entries(next).filter(
            ([name]) => touched[name] && visibleFieldNames.has(name),
          ),
        ),
      );
    }, VALIDATE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [manifest, values, touched, visibleFieldNames]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // A secret the request did not ask for stays out of both the form and
    // its validation -- otherwise a "required" error on an invisible field
    // blocks submit with nothing on screen to fix.
    const validation = Object.fromEntries(
      Object.entries(validateConnectorValues(manifest, values)).filter(
        ([name]) => visibleFieldNames.has(name),
      ),
    );
    if (hasFieldErrors(validation)) {
      setTouched(Object.fromEntries(fields.map((field) => [field.name, true])));
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
      {fields.map((field) => (
        <ConnectorFieldInput
          key={field.name}
          field={field}
          value={values[field.name] ?? ""}
          formValues={values}
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
