import React from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import { Card } from "#/ui/card";
import { AuthPageShell } from "#/components/features/auth/auth-page-shell";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { BrandButton } from "#/components/features/settings/brand-button";
import { MIN_PASSWORD_LENGTH } from "#/components/features/auth/password-auth-form";
import { updatePasswordForRecovery } from "#/lib/data-platform/auth-flow";
import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";
import { I18nKey } from "#/i18n/declaration";

type Status = "waiting" | "ready" | "invalid" | "done";

/**
 * Where a password-reset email's link lands (see `requestPasswordReset` in
 * auth-flow.ts). Supabase's client processes the link's token at startup
 * (`detectSessionInUrl`, on by default) and fires a `PASSWORD_RECOVERY`
 * event -- this page listens for it rather than assuming a session already
 * exists, since that event can fire either before or after this component
 * mounts depending on timing. A short "waiting" window covers the
 * before-mount case; if neither the event nor an existing session shows up
 * within it, the link is treated as invalid/expired.
 *
 * Deliberately its own route, not folded into `/login`: `login.tsx`'s own
 * redirect-to-/conversations effect would otherwise race this page for a
 * recovery session it has no reason to know about.
 */
export default function ResetPasswordRoute() {
  const { t } = useTranslation("openhands");
  const navigate = useNavigate();
  const [status, setStatus] = React.useState<Status>("waiting");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Captured into a local so TypeScript can narrow it as non-null inside
    // the setTimeout closure below -- `supabase` itself is a mutable
    // module-level export, so a guard on it up here doesn't narrow it across
    // a nested closure boundary.
    const client = supabase;
    if (!isSupabaseConfigured || !client) {
      setStatus("invalid");
      return;
    }

    let settled = false;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        settled = true;
        setStatus("ready");
      }
    });

    // Covers the case where the recovery event fired before this listener
    // attached (the client processes the URL token at startup, which can
    // race React mounting) -- the session itself still persists even if the
    // specific event notification was missed.
    const fallbackTimer = setTimeout(async () => {
      if (settled) return;
      const {
        data: { session },
      } = await client.auth.getSession();
      if (session) {
        settled = true;
        setStatus("ready");
      } else {
        setStatus("invalid");
      }
    }, 2500);

    return () => {
      subscription.unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!password) return;

    if (password.length < MIN_PASSWORD_LENGTH) {
      setFieldError(t(I18nKey.NEODEVEX_AUTH$PASSWORD_TOO_SHORT));
      return;
    }
    if (password !== confirmPassword) {
      setFieldError(t(I18nKey.NEODEVEX_AUTH$PASSWORD_MISMATCH));
      return;
    }

    setFieldError(null);
    setErrorMessage(null);
    setSubmitting(true);
    const outcome = await updatePasswordForRecovery(password);
    setSubmitting(false);

    if (outcome.kind === "signed_in") {
      setStatus("done");
      setTimeout(() => navigate("/conversations", { replace: true }), 1500);
      return;
    }
    setErrorMessage(
      outcome.kind === "error"
        ? outcome.message
        : t(I18nKey.NEODEVEX_AUTH$GENERIC_ERROR),
    );
  };

  return (
    <AuthPageShell>
      <Card
        theme="default"
        gradient="standard"
        className="flex-col gap-6 p-8"
        data-testid="reset-password-card"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            {t(I18nKey.NEODEVEX_AUTH$RESET_TITLE)}
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {t(I18nKey.NEODEVEX_AUTH$RESET_SUBTITLE)}
          </p>
        </div>

        {status === "waiting" ? (
          <p
            role="status"
            className="text-center text-sm text-[var(--text-secondary)]"
          >
            {t(I18nKey.NEODEVEX_AUTH$RESET_CHECKING)}
          </p>
        ) : status === "invalid" ? (
          <div
            role="alert"
            data-testid="reset-password-invalid"
            className="flex flex-col gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300"
          >
            <span>{t(I18nKey.NEODEVEX_AUTH$RESET_EXPIRED_SUBTITLE)}</span>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="self-start font-medium text-[var(--primary-400)] hover:underline"
            >
              {t(I18nKey.NEODEVEX_AUTH$RESET_BACK_TO_LOGIN)}
            </button>
          </div>
        ) : status === "done" ? (
          <p
            role="status"
            data-testid="reset-password-done"
            className="text-center text-sm text-[var(--text-secondary)]"
          >
            {t(I18nKey.NEODEVEX_AUTH$RESET_SUBMITTING)}
          </p>
        ) : (
          <form
            data-testid="reset-password-form"
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
          >
            <SettingsInput
              testId="reset-password-new"
              name="password"
              type={showPassword ? "text" : "password"}
              label={t(I18nKey.NEODEVEX_AUTH$RESET_NEW_PASSWORD_LABEL)}
              value={password}
              onChange={(value) => {
                setPassword(value);
                setFieldError(null);
                setErrorMessage(null);
              }}
              placeholder={t(I18nKey.NEODEVEX_AUTH$PASSWORD_PLACEHOLDER)}
              className="w-full"
            />

            <div className="-mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              >
                {showPassword ? (
                  <EyeOff className="size-3.5" aria-hidden />
                ) : (
                  <Eye className="size-3.5" aria-hidden />
                )}
                {showPassword
                  ? t(I18nKey.NEODEVEX_AUTH$HIDE_PASSWORD)
                  : t(I18nKey.NEODEVEX_AUTH$SHOW_PASSWORD)}
              </button>
            </div>

            <SettingsInput
              testId="reset-password-confirm"
              name="confirm-password"
              type={showPassword ? "text" : "password"}
              label={t(I18nKey.NEODEVEX_AUTH$CONFIRM_PASSWORD_LABEL)}
              value={confirmPassword}
              onChange={(value) => {
                setConfirmPassword(value);
                setFieldError(null);
                setErrorMessage(null);
              }}
              placeholder={t(I18nKey.NEODEVEX_AUTH$PASSWORD_PLACEHOLDER)}
              className="w-full"
              error={fieldError ?? undefined}
            />

            {errorMessage ? (
              <div
                role="alert"
                data-testid="reset-password-error"
                className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300"
              >
                {errorMessage}
              </div>
            ) : null}

            <BrandButton
              type="submit"
              variant="primary"
              isDisabled={!password || !confirmPassword || submitting}
              testId="reset-password-submit"
              className="w-full justify-center"
            >
              {submitting
                ? t(I18nKey.NEODEVEX_AUTH$RESET_SUBMITTING)
                : t(I18nKey.NEODEVEX_AUTH$RESET_SUBMIT)}
            </BrandButton>
          </form>
        )}
      </Card>
    </AuthPageShell>
  );
}
