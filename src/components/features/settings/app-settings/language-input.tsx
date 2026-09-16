import React from "react";
import { useTranslation } from "react-i18next";
import { AvailableLanguages } from "#/i18n";
import { I18nKey } from "#/i18n/declaration";
import { isRtlLanguage } from "#/i18n/document-language";
import { SettingsDropdownInput } from "../settings-dropdown-input";

interface LanguageInputProps {
  name: string;
  onChange: (value: string) => void;
  defaultKey: string;
}

const findLanguageValueByLabel = (label: string) =>
  AvailableLanguages.find((language) => language.label === label)?.value;

export function LanguageInput({
  defaultKey,
  onChange,
  name,
}: LanguageInputProps) {
  const { t } = useTranslation("openhands");
  const [selectedLanguage, setSelectedLanguage] = React.useState<
    string | undefined
  >(defaultKey);

  React.useEffect(() => {
    setSelectedLanguage(defaultKey);
  }, [defaultKey]);

  const handleInputChange = (label: string) => {
    setSelectedLanguage(findLanguageValueByLabel(label));
    onChange(label);
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <SettingsDropdownInput
        testId={name}
        name={name}
        onInputChange={handleInputChange}
        label={t(I18nKey.SETTINGS$LANGUAGE)}
        items={AvailableLanguages.map((l) => ({
          key: l.value,
          label: l.label,
        }))}
        defaultSelectedKey={defaultKey}
        isClearable={false}
        wrapperClassName="w-full min-w-0"
      />
      {isRtlLanguage(selectedLanguage) && (
        <p
          data-testid={`${name}-rtl-note`}
          className="text-xs text-[var(--oh-muted)]"
        >
          {t(I18nKey.SETTINGS$LANGUAGE_RTL_NOTE)}
        </p>
      )}
    </div>
  );
}
