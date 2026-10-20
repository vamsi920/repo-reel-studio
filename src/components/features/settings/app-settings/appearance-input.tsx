import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { SettingsDropdownInput } from "../settings-dropdown-input";
import {
  APPEARANCE_MODES,
  isAppearanceMode,
  persistAppearance,
  readPersistedAppearance,
  type AppearanceMode,
} from "#/themes/appearance";

const LABEL_KEY: Record<AppearanceMode, I18nKey> = {
  system: I18nKey.SETTINGS$APPEARANCE_SYSTEM,
  light: I18nKey.SETTINGS$APPEARANCE_LIGHT,
  dark: I18nKey.SETTINGS$APPEARANCE_DARK,
};

/** Light / dark / system. Applies instantly; persisted per browser. */
export function AppearanceInput() {
  const { t } = useTranslation("openhands");

  const handleSelectionChange = React.useCallback((key: React.Key | null) => {
    if (!isAppearanceMode(key)) return;
    persistAppearance(key);
  }, []);

  return (
    <SettingsDropdownInput
      testId="appearance-input"
      name="appearance-input"
      label={t(I18nKey.SETTINGS$APPEARANCE)}
      items={APPEARANCE_MODES.map((mode) => ({
        key: mode,
        label: t(LABEL_KEY[mode]),
      }))}
      defaultSelectedKey={readPersistedAppearance()}
      onSelectionChange={handleSelectionChange}
      isClearable={false}
      wrapperClassName="w-full min-w-0"
    />
  );
}
