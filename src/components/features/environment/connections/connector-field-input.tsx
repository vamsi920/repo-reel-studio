import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import type {
  ConnectorField,
  ConnectorFieldError,
} from "#/lib/environment/types/capability";

/** Turns a validation code into a sentence at render time, never in a manifest. */
export function useFieldErrorMessage(): (
  error: ConnectorFieldError | undefined,
) => string | undefined {
  const { t } = useTranslation("openhands");

  return (error) => {
    if (!error) return undefined;
    switch (error.code) {
      case "required":
        return t(I18nKey.CONNECTOR$ERROR_REQUIRED);
      case "minLength":
        return t(I18nKey.CONNECTOR$ERROR_MIN_LENGTH);
      case "maxLength":
        return t(I18nKey.CONNECTOR$ERROR_MAX_LENGTH);
      case "invalidOption":
        return t(I18nKey.CONNECTOR$ERROR_INVALID_OPTION);
      case "notAHost":
        return t(I18nKey.CONNECTOR$ERROR_NOT_A_HOST);
      case "notHttps":
        return t(I18nKey.CONNECTOR$ERROR_NOT_HTTPS);
      case "invalidJson":
        return t(I18nKey.CONNECTOR$ERROR_INVALID_JSON);
      case "blockedHost":
        return t(I18nKey.CONNECTOR$ERROR_BLOCKED_HOST);
      case "pattern":
        return t(error.hintKey);
      default:
        return undefined;
    }
  };
}

export interface ConnectorFieldInputProps {
  field: ConnectorField;
  value: string;
  error?: ConnectorFieldError;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
}

export function ConnectorFieldInput({
  field,
  value,
  error,
  disabled,
  onChange,
  onBlur,
}: ConnectorFieldInputProps) {
  const { t } = useTranslation("openhands");
  const messageFor = useFieldErrorMessage();
  const label = t(field.labelKey);
  const isRequired = field.required === true;

  if (field.kind === "select" && field.options) {
    return (
      <SettingsDropdownInput
        testId={`connector-field-${field.name}`}
        name={field.name}
        label={label}
        items={field.options.map((option) => ({
          key: option.value,
          label: t(option.labelKey),
        }))}
        selectedKey={value || undefined}
        isDisabled={disabled}
        showOptionalTag={!isRequired}
        onSelectionChange={(key) => onChange(key ? String(key) : "")}
      />
    );
  }

  // Everything else renders as an input. Secret fields get type="password" and
  // autoComplete off so a browser password manager does not offer to save a
  // service credential into the operator's personal vault.
  const inputType = field.secret
    ? "password"
    : field.kind === "number"
      ? "number"
      : "text";

  return (
    <SettingsInput
      testId={`connector-field-${field.name}`}
      name={field.name}
      type={inputType}
      label={label}
      value={value}
      placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
      hint={field.helpKey ? t(field.helpKey) : undefined}
      showRequiredTag={isRequired}
      showOptionalTag={!isRequired}
      isDisabled={disabled}
      error={messageFor(error)}
      onChange={onChange}
      onBlur={onBlur}
      className="w-full"
      inputClassName={field.secret ? "font-mono" : undefined}
    />
  );
}
