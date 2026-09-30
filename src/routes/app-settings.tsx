import React from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { useSettings } from "#/hooks/query/use-settings";
import { AvailableLanguages } from "#/i18n";
import { DEFAULT_SETTINGS } from "#/services/settings";
import { setTelemetryConsent } from "#/services/telemetry";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { I18nKey } from "#/i18n/declaration";
import { LanguageInput } from "#/components/features/settings/app-settings/language-input";
import { ThemeInput } from "#/components/features/settings/app-settings/theme-input";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import { AppSettingsInputsSkeleton } from "#/components/features/settings/app-settings/app-settings-inputs-skeleton";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { NavigationLink } from "#/components/shared/navigation-link";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { formatModelNameForDisplay } from "#/utils/format-model-name";
import { isSupabaseConfigured } from "#/lib/data-platform/client";
import { useSupabaseSession } from "#/hooks/query/use-supabase-session";
import { signOutAndRedirect } from "#/lib/data-platform/auth-flow";

const AUTOMATIC_TITLE_LLM_PROFILE_KEY = "__automatic__";

export function AppSettingsScreen() {
  const { t } = useTranslation("openhands");
  const navigate = useNavigate();
  const { status: supabaseSessionStatus, user: supabaseUser } =
    useSupabaseSession();

  const { mutate: saveSettings, isPending } = useSaveSettings();
  const { data: settings, isLoading } = useSettings();
  const activeBackend = useActiveBackend();
  const isCloudBackend = activeBackend.backend.kind === "cloud";
  const { data: llmProfiles, isLoading: areLlmProfilesLoading } =
    useLlmProfiles();

  const [languageInputHasChanged, setLanguageInputHasChanged] =
    React.useState(false);
  const [gitUserNameHasChanged, setGitUserNameHasChanged] =
    React.useState(false);
  const [gitUserEmailHasChanged, setGitUserEmailHasChanged] =
    React.useState(false);
  // Controlled instead of `defaultValue`: React resets a form's uncontrolled
  // fields once its `action` settles, on failure as well as success (there's
  // no user-visible distinction at the DOM level), which silently discarded
  // an edit still in flight the moment a save request failed. `undefined`
  // means "untouched this session, mirror the persisted setting".
  const [gitUserNameInput, setGitUserNameInput] = React.useState<
    string | undefined
  >(undefined);
  const [gitUserEmailInput, setGitUserEmailInput] = React.useState<
    string | undefined
  >(undefined);
  const [titleLlmProfileInput, setTitleLlmProfileInput] = React.useState<
    string | null | undefined
  >(undefined);

  // Treat null as true since analytics is opt-in by default.
  const initialAnalyticsEnabled = isCloudBackend
    ? true
    : (settings?.user_consents_to_analytics ?? true);
  const [analyticsEnabled, setAnalyticsEnabled] = React.useState(
    initialAnalyticsEnabled,
  );
  // Guards the resync effect below the same way `subAgentsTouchedRef` does in
  // agent-settings.tsx: an unrelated settings refetch must not clobber an
  // unsaved edit, but a *successful save* of this switch must clear it —
  // otherwise the switch stays permanently desynced from the server the
  // moment the settings query is invalidated by anything else (another tab,
  // the telemetry-consent sync flow).
  const analyticsTouchedRef = React.useRef(false);

  const initialSoundNotificationsEnabled =
    !!settings?.enable_sound_notifications;
  const [soundNotificationsEnabled, setSoundNotificationsEnabled] =
    React.useState(initialSoundNotificationsEnabled);
  const soundNotificationsTouchedRef = React.useRef(false);

  React.useEffect(() => {
    if (analyticsTouchedRef.current) return;
    setAnalyticsEnabled(initialAnalyticsEnabled);
  }, [initialAnalyticsEnabled]);

  React.useEffect(() => {
    if (soundNotificationsTouchedRef.current) return;
    setSoundNotificationsEnabled(initialSoundNotificationsEnabled);
  }, [initialSoundNotificationsEnabled]);

  const storedTitleLlmProfile = React.useMemo(() => {
    const preference = settings?.title_llm_profile ?? null;
    if (!preference || !llmProfiles) return preference;
    return llmProfiles.profiles.some((profile) => profile.name === preference)
      ? preference
      : null;
  }, [llmProfiles, settings?.title_llm_profile]);
  const selectedTitleLlmProfile =
    titleLlmProfileInput === undefined
      ? storedTitleLlmProfile
      : titleLlmProfileInput;
  const titleLlmProfileItems = React.useMemo(
    () => [
      {
        key: AUTOMATIC_TITLE_LLM_PROFILE_KEY,
        label: t(I18nKey.SETTINGS$TITLE_GENERATION_AUTOMATIC),
      },
      ...(llmProfiles?.profiles.map((profile) => ({
        key: profile.name,
        label: profile.model
          ? t(I18nKey.SETTINGS$TITLE_GENERATION_PROFILE_OPTION, {
              name: profile.name,
              model: formatModelNameForDisplay(profile.model) ?? profile.model,
            })
          : profile.name,
      })) ?? []),
    ],
    [llmProfiles?.profiles, t],
  );

  const formAction = (formData: FormData) => {
    const languageLabel = formData.get("language-input")?.toString();
    const languageValue = AvailableLanguages.find(
      ({ label }) => label === languageLabel,
    )?.value;
    const language = languageValue || DEFAULT_SETTINGS.language;

    const enableAnalytics = isCloudBackend ? true : analyticsEnabled;
    const enableSoundNotifications = soundNotificationsEnabled;

    const gitUserName =
      (gitUserNameInput ?? settings?.git_user_name) ||
      DEFAULT_SETTINGS.git_user_name;
    const gitUserEmail =
      (gitUserEmailInput ?? settings?.git_user_email) ||
      DEFAULT_SETTINGS.git_user_email;

    saveSettings(
      {
        language,
        ...(!isCloudBackend && { user_consents_to_analytics: enableAnalytics }),
        enable_sound_notifications: enableSoundNotifications,
        git_user_name: gitUserName,
        git_user_email: gitUserEmail,
        title_llm_profile: selectedTitleLlmProfile,
      },
      {
        onSuccess: () => {
          analyticsTouchedRef.current = false;
          soundNotificationsTouchedRef.current = false;
          setLanguageInputHasChanged(false);
          setGitUserNameHasChanged(false);
          setGitUserEmailHasChanged(false);
          setGitUserNameInput(undefined);
          setGitUserEmailInput(undefined);
          setTitleLlmProfileInput(undefined);
          void setTelemetryConsent(enableAnalytics ? "granted" : "denied");
          displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
        },
        onError: (error) => {
          const errorMessage = retrieveAxiosErrorMessage(error);
          displayErrorToast(errorMessage || t(I18nKey.ERROR$GENERIC));
        },
      },
    );
  };

  const checkIfLanguageInputHasChanged = (value: string) => {
    const selectedLanguage = AvailableLanguages.find(
      ({ label: langValue }) => langValue === value,
    )?.label;
    const currentLanguage = AvailableLanguages.find(
      ({ value: langValue }) => langValue === settings?.language,
    )?.label;

    setLanguageInputHasChanged(selectedLanguage !== currentLanguage);
  };

  const handleAnalyticsToggle = (checked: boolean) => {
    analyticsTouchedRef.current = true;
    setAnalyticsEnabled(checked);
  };

  const handleSoundNotificationsToggle = (checked: boolean) => {
    soundNotificationsTouchedRef.current = true;
    setSoundNotificationsEnabled(checked);
  };

  const checkIfGitUserNameHasChanged = (value: string) => {
    setGitUserNameInput(value);
    const currentValue = settings?.git_user_name;
    setGitUserNameHasChanged(value !== currentValue);
  };

  const checkIfGitUserEmailHasChanged = (value: string) => {
    setGitUserEmailInput(value);
    const currentValue = settings?.git_user_email;
    setGitUserEmailHasChanged(value !== currentValue);
  };

  const handleSignOut = () => signOutAndRedirect(navigate);

  const formIsClean =
    !languageInputHasChanged &&
    analyticsEnabled === initialAnalyticsEnabled &&
    soundNotificationsEnabled === initialSoundNotificationsEnabled &&
    selectedTitleLlmProfile === storedTitleLlmProfile &&
    !gitUserNameHasChanged &&
    !gitUserEmailHasChanged;

  // Deliberately excludes `isPending`: swapping to the skeleton mid-save
  // would unmount the uncontrolled inputs below (git username/email,
  // language), discarding any edit that hasn't round-tripped to the server
  // yet -- most visibly when the save request fails and the remounted
  // inputs fall back to the last-saved `settings` values. The Save button
  // already disables itself via `isPending` to prevent a duplicate submit.
  const shouldBeLoading = !settings || isLoading || areLlmProfilesLoading;

  return (
    <form
      data-testid="app-settings-screen"
      action={formAction}
      className="flex flex-col gap-6"
    >
      {shouldBeLoading && <AppSettingsInputsSkeleton />}
      {!shouldBeLoading && (
        <div className="flex flex-col gap-6">
          {!formIsClean ? (
            <div
              role="status"
              data-testid="app-settings-unsaved-changes-notice"
              className="rounded-lg border border-tertiary bg-tertiary/40 px-4 py-3 text-sm text-tertiary-light"
            >
              {t(I18nKey.SETTINGS$UNSAVED_CHANGES_NOTICE)}
            </div>
          ) : null}

          <LanguageInput
            name="language-input"
            defaultKey={settings.language}
            onChange={checkIfLanguageInputHasChanged}
          />

          <ThemeInput />

          <SettingsSwitch
            testId="enable-analytics-switch"
            name={isCloudBackend ? undefined : "enable-analytics-switch"}
            isToggled={isCloudBackend ? true : analyticsEnabled}
            isDisabled={isCloudBackend}
            onToggle={isCloudBackend ? undefined : handleAnalyticsToggle}
          >
            {t(I18nKey.ANALYTICS$SEND_ANONYMOUS_DATA)}
          </SettingsSwitch>

          <SettingsSwitch
            testId="enable-sound-notifications-switch"
            name="enable-sound-notifications-switch"
            isToggled={soundNotificationsEnabled}
            onToggle={handleSoundNotificationsToggle}
          >
            {t(I18nKey.SETTINGS$SOUND_NOTIFICATIONS)}
          </SettingsSwitch>

          <div className="border-t border-[var(--oh-border)] pt-6 mt-2">
            <h3 className="text-lg font-medium mb-2">
              {t(I18nKey.SETTINGS$CONVERSATION_TITLES)}
            </h3>
            <p className="mb-4 text-sm leading-5 text-tertiary-light">
              {t(I18nKey.SETTINGS$TITLE_GENERATION_DESCRIPTION)}
            </p>
            <SettingsDropdownInput
              testId="title-llm-profile-input"
              name="title-llm-profile-input"
              label={t(I18nKey.SETTINGS$TITLE_GENERATION_MODEL)}
              items={titleLlmProfileItems}
              selectedKey={
                selectedTitleLlmProfile ?? AUTOMATIC_TITLE_LLM_PROFILE_KEY
              }
              onSelectionChange={(key) => {
                const value = key?.toString();
                setTitleLlmProfileInput(
                  !value || value === AUTOMATIC_TITLE_LLM_PROFILE_KEY
                    ? null
                    : value,
                );
              }}
            />
            <NavigationLink
              to="/settings/llm"
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              {t(I18nKey.SETTINGS$MANAGE_LLM_PROFILES)}
            </NavigationLink>
          </div>

          <div className="border-t border-[var(--oh-border)] pt-6 mt-2">
            <h3 className="text-lg font-medium mb-2">
              {t(I18nKey.SETTINGS$GIT_SETTINGS)}
            </h3>
            <p className="mb-4 text-sm leading-5 text-tertiary-light">
              {t(I18nKey.SETTINGS$GIT_SETTINGS_DESCRIPTION)}
            </p>
            <div className="flex flex-col gap-6">
              <SettingsInput
                testId="git-user-name-input"
                name="git-user-name-input"
                type="text"
                label={t(I18nKey.SETTINGS$GIT_USERNAME)}
                value={gitUserNameInput ?? settings.git_user_name ?? ""}
                onChange={checkIfGitUserNameHasChanged}
                placeholder={t(I18nKey.SETTINGS$GIT_USERNAME_PLACEHOLDER)}
                className="w-full min-w-0"
              />
              <SettingsInput
                testId="git-user-email-input"
                name="git-user-email-input"
                type="email"
                label={t(I18nKey.SETTINGS$GIT_EMAIL)}
                value={gitUserEmailInput ?? settings.git_user_email ?? ""}
                onChange={checkIfGitUserEmailHasChanged}
                placeholder={t(I18nKey.SETTINGS$GIT_EMAIL_PLACEHOLDER)}
                className="w-full min-w-0"
              />
            </div>
            <div className="flex justify-start pt-4">
              <BrandButton
                testId="submit-button"
                variant="primary"
                type="submit"
                isDisabled={isPending || formIsClean}
              >
                {!isPending && t(I18nKey.SETTINGS$SAVE_CHANGES)}
                {isPending && t(I18nKey.SETTINGS$SAVING)}
              </BrandButton>
            </div>
          </div>

          {isSupabaseConfigured &&
          supabaseSessionStatus === "real" &&
          supabaseUser ? (
            <div className="border-t border-[var(--oh-border)] pt-6 mt-2">
              <h3 className="text-lg font-medium mb-2">
                {t(I18nKey.SETTINGS$ACCOUNT_SECTION_TITLE)}
              </h3>
              <p className="mb-4 text-sm leading-5 text-tertiary-light">
                {t(I18nKey.SETTINGS$ACCOUNT_SIGNED_IN_AS, {
                  email: supabaseUser.email,
                })}
              </p>
              <BrandButton
                testId="sign-out-button"
                variant="secondary"
                type="button"
                onClick={handleSignOut}
              >
                {t(I18nKey.SETTINGS$SIGN_OUT)}
              </BrandButton>
            </div>
          ) : null}
        </div>
      )}
    </form>
  );
}

export default AppSettingsScreen;
