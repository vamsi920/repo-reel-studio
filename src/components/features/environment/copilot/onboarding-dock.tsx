import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles, X, ArrowUpRight } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { useOnboardingCopilotStore } from "#/stores/onboarding-copilot-store";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { buildAgentCanvasPath } from "#/utils/base-path";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import {
  createConversationResultPoster,
  type PostResultFn,
} from "#/services/onboarding-control";
import { CredentialRequestSheet } from "./credential-request-sheet";
import { ONBOARDING_SYSTEM_BRIEF } from "./onboarding-brief";

/**
 * The onboarding agent's presence across the whole app.
 *
 * Mounted once in the root layout, so a credential request raised by the agent
 * reaches the user wherever they happen to be -- the setup conversation is not
 * a place you have to be standing in for the agent to be able to ask you
 * something.
 *
 * The conversation itself runs in the normal conversation view rather than
 * inside this panel. A second chat surface would mean a second WebSocket
 * connection writing into the same event stores as the open conversation, and
 * the two would interleave. Everything that has to be available everywhere --
 * the credential sheet, the agent's requests, the launcher -- lives here; the
 * transcript lives where transcripts already live.
 */
export function OnboardingDock() {
  const { t } = useTranslation("openhands");
  const navigate = useNavigate();
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

  const { mutate: createConversation, isPending } = useCreateConversation();
  const [conversationId, setConversationId] = React.useState<string | null>(
    null,
  );

  // Falls back to a no-op before a conversation exists: a receipt with nowhere
  // to go must not throw inside the dispatcher.
  const postResult: PostResultFn = React.useMemo(
    () =>
      conversationId
        ? createConversationResultPoster(conversationId)
        : () => undefined,
    [conversationId],
  );

  const launch = React.useCallback(() => {
    const seed = consumeSeed();
    createConversation(
      {
        query: seed ?? t(I18nKey.ENVIRONMENT$COPILOT_SUBTITLE),
        conversationInstructions: ONBOARDING_SYSTEM_BRIEF,
        entryPoint: "environment_onboarding_dock",
      },
      {
        onSuccess: (response) => {
          setConversationId(response.conversation_id);
          navigate(
            buildAgentCanvasPath(`/conversations/${response.conversation_id}`),
          );
        },
        onError: () => displayErrorToast(t(I18nKey.ENVIRONMENT$ERROR_LOAD)),
      },
    );
  }, [consumeSeed, createConversation, navigate, t]);

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
              disabled={isPending}
              onClick={
                conversationId
                  ? () =>
                      navigate(
                        buildAgentCanvasPath(
                          `/conversations/${conversationId}`,
                        ),
                      )
                  : launch
              }
              className={cn(
                "ame-btn-primary ame-btn-sm inline-flex items-center justify-center gap-1.5",
                isPending && "loading",
              )}
            >
              {isPending
                ? t(I18nKey.ENVIRONMENT$COPILOT_STARTING)
                : t(I18nKey.ENVIRONMENT$COPILOT_OPEN)}
              <ArrowUpRight size={12} aria-hidden />
            </button>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </>
  );
}
