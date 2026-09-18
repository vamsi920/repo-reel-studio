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

  // Fire on the actual selection commit, not on every filter-box keystroke:
  // `onInputChange` fires for every character typed while filtering the
  // list, which previously flipped the parent's "unsaved changes" state
  // (and this note) off of partial, uncommitted text.
  const handleSelectionChange = (key: React.Key | null) => {
    if (key === null) return;
    const language = AvailableLanguages.find((l) => l.value === key);
    if (!language) return;
    setSelectedLanguage(language.value);
    onChange(language.label);
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <SettingsDropdownInput
        testId={name}
        name={name}
        onSelectionChange={handleSelectionChange}
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
