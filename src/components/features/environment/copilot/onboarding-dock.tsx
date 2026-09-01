import React from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles, X, ArrowUpRight } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { useOnboardingCopilotStore } from "#/stores/onboarding-copilot-store";
import { buildAgentCanvasPath } from "#/utils/base-path";
import {
  createConversationResultPoster,
  type PostResultFn,
} from "#/services/onboarding-control";
import { useOnboardingSession } from "#/hooks/query/use-onboarding-session";
import { CredentialRequestSheet } from "./credential-request-sheet";

/**
 * The onboarding agent's presence everywhere except the studio itself.
 *
 * The conversation lives at `/environment/setup`, which owns the only live
 * conversation socket -- the event stores are global and unkeyed, so a second
 * chat surface would interleave with the first. This dock is the out-of-band
 * half: it launches the studio, and it surfaces a credential request raised
 * while the user has wandered off to another screen, because the agent is
 * blocked until someone answers one.
 *
 * It hides itself on the studio route. Two credential sheets for the same
 * request, and a launcher for the page you are already on, are just noise.
 */
export function OnboardingDock() {
  const { t } = useTranslation("openhands");
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  const open = useOnboardingCopilotStore((state) => state.open);
  const seedPrompt = useOnboardingCopilotStore((state) => state.seedPrompt);
  const pending = useOnboardingCopilotStore(
    (state) => state.pendingCredentialRequest,
  );
  const close = useOnboardingCopilotStore((state) => state.close);
  const toggle = useOnboardingCopilotStore((state) => state.toggle);
  const consumeSeed = useOnboardingCopilotStore((state) => state.consumeSeed);
  const clearCredentialRequest = useOnboardingCopilotStore(
    (state) => state.clearCredentialRequest,
  );

  // A credential entered here still has to reach the agent, which is waiting
  // in the studio's conversation. Posting through the REST send works even
  // though this component is not mounted on that conversation's socket.
  const { data: session } = useOnboardingSession();
  const postResult: PostResultFn = React.useMemo(
    () =>
      session?.conversationId
        ? createConversationResultPoster(session.conversationId)
        : () => undefined,
    [session?.conversationId],
  );

  // Launching means going to the studio, which owns the conversation. Opening
  // it here as well would mount a second provider against the same global
  // event store and the two transcripts would overwrite each other.
  const openStudio = React.useCallback(() => {
    const seed = consumeSeed();
    navigate(
      buildAgentCanvasPath(
        seed
          ? `/environment/setup?seed=${encodeURIComponent(seed)}`
          : "/environment/setup",
      ),
    );
  }, [consumeSeed, navigate]);

  // The studio has its own workbench and its own credential card; a second
  // set floating on top would be two views of the same request.
  if (location.pathname.includes("/environment/setup")) return null;

  return (
    <>
      <button
        type="button"
        data-testid="onboarding-dock-trigger"
        aria-expanded={open}
        aria-label={t(I18nKey.ENVIRONMENT$COPILOT_OPEN)}
        onClick={toggle}
        className={cn(
          "fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full",
          "border border-[var(--border-color)] bg-[var(--background-secondary)] px-4 py-2",
          "text-sm text-[var(--text-primary)] shadow-[var(--shadow-md)]",
          "hover:bg-[var(--background-tertiary)] transition-colors",
        )}
      >
        <Sparkles size={14} aria-hidden className="text-[var(--primary-500)]" />
        {t(I18nKey.ENVIRONMENT$COPILOT_TITLE)}
        {/* A pending credential request is the one thing that must be
            noticeable from anywhere in the app -- the agent is blocked until
            someone answers it. */}
        {pending ? (
          <span
            aria-hidden
            className="ame-pip ame-pip-warning live motion-reduce:animate-none"
          />
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.aside
            data-testid="onboarding-dock"
            role="complementary"
            aria-label={t(I18nKey.ENVIRONMENT$COPILOT_TITLE)}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
            }
            className={cn(
              "fixed bottom-20 right-4 z-40 flex max-h-[70vh] w-[min(420px,calc(100vw-2rem))]",
              "flex-col gap-3 overflow-y-auto rounded-[var(--radius-lg)]",
              "border border-[var(--border-color)] bg-[var(--background-primary)] p-4",
              "shadow-[var(--shadow-lg)]",
            )}
          >
            <header className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="ame-eyebrow">
                  {t(I18nKey.ENVIRONMENT$COPILOT_TITLE)}
                </span>
                <p className="text-xs text-[var(--text-secondary)]">
                  {t(I18nKey.ENVIRONMENT$COPILOT_SUBTITLE)}
                </p>
              </div>
              <button
                type="button"
                data-testid="onboarding-dock-close"
                aria-label={t(I18nKey.ENVIRONMENT$COPILOT_CLOSE)}
                onClick={close}
                className="rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                <X size={14} aria-hidden />
              </button>
            </header>

            {pending ? (
              <CredentialRequestSheet
                request={pending}
                onDone={clearCredentialRequest}
                onResult={postResult}
              />
            ) : null}

            {seedPrompt ? (
              <p
                data-testid="onboarding-seed-prompt"
                className="rounded-[var(--radius-sm)] bg-[var(--background-secondary)] p-3 text-xs text-[var(--text-secondary)]"
              >
                {seedPrompt}
              </p>
            ) : null}

            <button
              type="button"
              data-testid="onboarding-dock-launch"
              onClick={openStudio}
              className="ame-btn-primary ame-btn-sm inline-flex items-center justify-center gap-1.5"
            >
              {t(I18nKey.ENVIRONMENT$COPILOT_OPEN)}
              <ArrowUpRight size={12} aria-hidden />
            </button>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </>
  );
}
