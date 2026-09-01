import React from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import { Card } from "#/ui/card";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { BrandButton } from "#/components/features/settings/brand-button";
import { I18nKey } from "#/i18n/declaration";
import {
  signUpWithPassword,
  signInWithPassword,
  requestPasswordReset,
  isEmailInDomainAllowlist,
  loadSignupDomainAllowlist,
} from "#/lib/data-platform/auth-flow";

type Mode = "sign-in" | "sign-up" | "forgot";
type SubmitState = "idle" | "submitting";

export const MIN_PASSWORD_LENGTH = 8;

/**
 * The `/login` page body: email + password, toggling between Sign In and
 * Create Account. All signup/login branching (anonymous-session upgrade vs.
 * plain sign-in vs. sign-up) happens inside `auth-flow.ts` -- this component
 * only renders the outcome. A successful call sets an active session
 * immediately (no email confirmation step); `login.tsx`'s session effect
 * handles the redirect into the app.
 */
export function PasswordAuthForm() {
  const { t } = useTranslation("openhands");
  const [mode, setMode] = React.useState<Mode>("sign-in");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitState, setSubmitState] = React.useState<SubmitState>("idle");
  const [domainRejected, setDomainRejected] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [alreadyExists, setAlreadyExists] = React.useState(false);
  const [resetSent, setResetSent] = React.useState(false);
  // Empty until loaded, which means "no restriction" -- the same default the
  // server-side trigger applies, so a deployment that has not narrowed its
  // allowlist never blocks its own login form.
  const [signupDomains, setSignupDomains] = React.useState<string[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    loadSignupDomainAllowlist().then((domains) => {
      if (!cancelled) setSignupDomains(domains);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isSignUp = mode === "sign-up";
  const isForgot = mode === "forgot";

  const clearFieldErrors = () => {
    setDomainRejected(false);
    setPasswordError(null);
    setErrorMessage(null);
    setAlreadyExists(false);
  };

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setConfirmPassword("");
    setResetSent(false);
    clearFieldErrors();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitState === "submitting") return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail || (!isForgot && !password)) return;

    if (!isEmailInDomainAllowlist(trimmedEmail, signupDomains)) {
      clearFieldErrors();
      setDomainRejected(true);
      return;
    }

    if (isSignUp) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        clearFieldErrors();
        setPasswordError(t(I18nKey.NEODEVEX_AUTH$PASSWORD_TOO_SHORT));
        return;
      }
      if (password !== confirmPassword) {
        clearFieldErrors();
        setPasswordError(t(I18nKey.NEODEVEX_AUTH$PASSWORD_MISMATCH));
        return;
      }
    }

    clearFieldErrors();
    setSubmitState("submitting");

    if (isForgot) {
      const outcome = await requestPasswordReset(trimmedEmail);
      setSubmitState("idle");
      if (outcome.kind === "sent") {
        setResetSent(true);
      } else if (outcome.kind === "domain_rejected") {
        setDomainRejected(true);
      } else {
        setErrorMessage(
          outcome.message || t(I18nKey.NEODEVEX_AUTH$GENERIC_ERROR),
        );
      }
      return;
    }

    const outcome = isSignUp
      ? await signUpWithPassword(trimmedEmail, password)
      : await signInWithPassword(trimmedEmail, password);
    setSubmitState("idle");

    if (outcome.kind === "signed_in") {
      // login.tsx's useSupabaseSession effect handles the redirect.
      return;
    }
    if (outcome.kind === "domain_rejected") {
      setDomainRejected(true);
    } else if (outcome.kind === "already_exists") {
      setAlreadyExists(true);
    } else {
      const fallback = isSignUp
        ? t(I18nKey.NEODEVEX_AUTH$GENERIC_ERROR)
        : t(I18nKey.NEODEVEX_AUTH$INVALID_CREDENTIALS);
      setErrorMessage(outcome.message || fallback);
    }
  };

  return (
    <Card theme="default" gradient="standard" className="flex-col gap-6 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        {signupDomains.length > 0 && (
          <span className="ame-eyebrow">{signupDomains.join(", ")}</span>
        )}
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          {isForgot
            ? t(I18nKey.NEODEVEX_AUTH$FORGOT_TITLE)
            : isSignUp
              ? t(I18nKey.NEODEVEX_AUTH$SIGN_UP_TITLE)
              : t(I18nKey.NEODEVEX_AUTH$SIGN_IN_TITLE)}
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          {isForgot
            ? t(I18nKey.NEODEVEX_AUTH$FORGOT_SUBTITLE)
            : isSignUp
              ? t(I18nKey.NEODEVEX_AUTH$SIGN_UP_SUBTITLE)
              : t(I18nKey.NEODEVEX_AUTH$SIGN_IN_SUBTITLE)}
        </p>
      </div>

      {isForgot && resetSent ? (
        <div
          role="status"
          data-testid="auth-reset-sent"
          className="rounded-md border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4 text-sm text-[var(--text-secondary)]"
        >
          {t(I18nKey.NEODEVEX_AUTH$FORGOT_SENT)}
        </div>
      ) : (
        <form
          data-testid="password-auth-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <SettingsInput
            testId="auth-email"
            name="email"
            type="email"
            label={t(I18nKey.NEODEVEX_AUTH$EMAIL_LABEL)}
            value={email}
            onChange={(value) => {
              setEmail(value);
              clearFieldErrors();
            }}
            placeholder={t(I18nKey.NEODEVEX_AUTH$EMAIL_PLACEHOLDER)}
            className="w-full"
            error={
              domainRejected
                ? t(I18nKey.NEODEVEX_AUTH$DOMAIN_REJECTED)
                : undefined
            }
          />

          {isForgot ? null : (
            <>
              <SettingsInput
                testId="auth-password"
                name="password"
                type={showPassword ? "text" : "password"}
                label={t(I18nKey.NEODEVEX_AUTH$PASSWORD_LABEL)}
                value={password}
                onChange={(value) => {
                  setPassword(value);
                  clearFieldErrors();
                }}
                placeholder={t(I18nKey.NEODEVEX_AUTH$PASSWORD_PLACEHOLDER)}
                className="w-full"
              />

              <div className="-mt-3 flex items-center justify-between">
                {!isSignUp ? (
                  <button
                    type="button"
                    data-testid="auth-forgot-link"
                    onClick={() => switchMode("forgot")}
                    className="text-xs text-[var(--primary-400)] hover:underline"
                  >
                    {t(I18nKey.NEODEVEX_AUTH$FORGOT_LINK)}
                  </button>
                ) : (
                  <span />
                )}
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
            </>
          )}

          {isSignUp ? (
            <SettingsInput
              testId="auth-confirm-password"
              name="confirm-password"
              type={showPassword ? "text" : "password"}
              label={t(I18nKey.NEODEVEX_AUTH$CONFIRM_PASSWORD_LABEL)}
              value={confirmPassword}
              onChange={(value) => {
                setConfirmPassword(value);
                clearFieldErrors();
              }}
              placeholder={t(I18nKey.NEODEVEX_AUTH$PASSWORD_PLACEHOLDER)}
              className="w-full"
              error={passwordError ?? undefined}
            />
          ) : passwordError ? (
            <p role="alert" className="-mt-2 text-xs text-red-400">
              {passwordError}
            </p>
          ) : null}

          {alreadyExists ? (
            <div
              role="alert"
              data-testid="auth-already-exists"
              className="flex flex-col gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-200"
            >
              <span>{t(I18nKey.NEODEVEX_AUTH$ALREADY_EXISTS)}</span>
              <button
                type="button"
                onClick={() => switchMode("sign-in")}
                className="self-start font-medium text-[var(--primary-400)] hover:underline"
              >
                {t(I18nKey.NEODEVEX_AUTH$SIGN_IN_INSTEAD)}
              </button>
            </div>
          ) : null}

          {errorMessage ? (
            <div
              role="alert"
              data-testid="auth-error"
              className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300"
            >
              {errorMessage}
            </div>
          ) : null}

          <BrandButton
            type="submit"
            variant="primary"
            isDisabled={
              !email.trim() ||
              (!isForgot && !password) ||
              submitState === "submitting"
            }
            testId="auth-submit"
            className="w-full justify-center"
          >
            {isForgot
              ? t(
                  submitState === "submitting"
                    ? I18nKey.NEODEVEX_AUTH$FORGOT_SENDING
                    : I18nKey.NEODEVEX_AUTH$FORGOT_SUBMIT,
                )
              : submitState === "submitting"
                ? t(
                    isSignUp
                      ? I18nKey.NEODEVEX_AUTH$CREATING_ACCOUNT
                      : I18nKey.NEODEVEX_AUTH$SIGNING_IN,
                  )
                : t(
                    isSignUp
                      ? I18nKey.NEODEVEX_AUTH$SIGN_UP_CTA
                      : I18nKey.NEODEVEX_AUTH$SIGN_IN_CTA,
                  )}
          </BrandButton>
        </form>
      )}

      <button
        type="button"
        onClick={() => switchMode(isForgot || isSignUp ? "sign-in" : "sign-up")}
        className="text-center text-sm text-[var(--primary-400)] hover:underline"
      >
        {t(
          isForgot || isSignUp
            ? I18nKey.NEODEVEX_AUTH$TOGGLE_TO_SIGN_IN
            : I18nKey.NEODEVEX_AUTH$TOGGLE_TO_SIGN_UP,
        )}
      </button>
    </Card>
  );
}
