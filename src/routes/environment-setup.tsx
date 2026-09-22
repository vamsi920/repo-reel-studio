import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  NavigationProvider,
  useNavigation,
  type NavigationContextValue,
} from "#/context/navigation-context";
import { WebSocketProviderWrapper } from "#/contexts/websocket-provider-wrapper";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { EventHandler } from "#/wrapper/event-handler";
import { ChatInterface } from "#/components/features/chat/chat-interface";
import { ResizeHandle } from "#/components/ui/resize-handle";
import { useResizablePanels } from "#/hooks/use-resizable-panels";
import { useBreakpoint } from "#/hooks/use-breakpoint";
import { OnboardingWorkbench } from "#/components/features/environment/studio/onboarding-workbench";
import { useOnboardingStudioStore } from "#/stores/onboarding-studio-store";
import {
  useOnboardingSession,
  useStartOnboardingSession,
} from "#/hooks/query/use-onboarding-session";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useEnvironmentProfile } from "#/hooks/query/use-environment-profile";
import { useEnvironmentReadiness } from "#/hooks/query/use-environment-readiness";
import { createConversationResultPoster } from "#/services/onboarding-control";
import { invalidateConnectionCaches } from "#/lib/environment/invalidate-connection-caches";
import { consumeOAuthReceiptOnce } from "#/lib/environment/oauth-receipt-guard";
import { ONBOARDING_RESULT_PREFIX } from "#/constants/onboarding-control";
import { ONBOARDING_SYSTEM_BRIEF } from "#/components/features/environment/copilot/onboarding-brief";
import { isSupabaseConfigured } from "#/lib/data-platform/client";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";

/** Tab ids for the mobile layout; not user-facing text. */
const MOBILE_TABS = ["chat", "workbench"] as const;

function SetupPanes({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation("openhands");
  const isMobile = useBreakpoint();
  const [mobileTab, setMobileTab] = React.useState<"chat" | "workbench">(
    "chat",
  );

  const { leftWidth, rightWidth, isDragging, containerRef, handleMouseDown } =
    useResizablePanels({
      defaultLeftWidth: 55,
      minLeftWidth: 35,
      maxLeftWidth: 70,
      storageKey: "environment-setup-panel-width",
    });

  const postResult = React.useMemo(
    () => createConversationResultPoster(conversationId),
    [conversationId],
  );

  if (isMobile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 gap-1 border-b border-[var(--border-color)] px-2">
          {MOBILE_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              data-testid={`setup-mobile-tab-${tab}`}
              onClick={() => setMobileTab(tab)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm",
                mobileTab === tab
                  ? "border-[var(--primary-500)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-secondary)]",
              )}
            >
              {t(
                tab === "chat"
                  ? I18nKey.ENVIRONMENT$STUDIO_CHAT
                  : I18nKey.ENVIRONMENT$STUDIO_WORKBENCH,
              )}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1">
          {mobileTab === "chat" ? (
            <ChatInterface />
          ) : (
            <OnboardingWorkbench postResult={postResult} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1 overflow-hidden"
      style={{ transitionProperty: isDragging ? "none" : "all" }}
    >
      <div
        className="flex flex-col overflow-hidden bg-base"
        style={{
          width: `${leftWidth}%`,
          transitionProperty: isDragging ? "none" : "all",
        }}
      >
        <ChatInterface />
      </div>

      <ResizeHandle onMouseDown={handleMouseDown} isDragging={isDragging} />

      <div
        className="overflow-hidden border-l border-[var(--border-color)] bg-[var(--background-secondary)]"
        style={{
          width: `${rightWidth}%`,
          transitionProperty: isDragging ? "none" : "all",
        }}
      >
        <OnboardingWorkbench postResult={postResult} />
      </div>
    </div>
  );
}

/**
 * The onboarding studio.
 *
 * A conversation on the left, and everything the agent produces on the right.
 * It is a top-level route rather than a panel inside the conversation view for
 * a hard reason: the event stores are global and unkeyed
 * (`src/stores/use-event-store.ts`), and two mounted conversation providers
 * wipe each other's transcripts. A sibling route can never be co-mounted with
 * `/conversations/:id`, so there is exactly one live conversation socket.
 */
function EnvironmentSetupScreen() {
  const { t } = useTranslation("openhands");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const outerNavigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: session, isLoading: sessionLoading } = useOnboardingSession();
  const { mutate: startSession } = useStartOnboardingSession();
  const { mutate: createConversation, isPending: creating } =
    useCreateConversation();
  const { data: profile } = useEnvironmentProfile();
  const readiness = useEnvironmentReadiness(profile ?? null);
  const setStudioConversationId = useOnboardingStudioStore(
    (state) => state.setConversationId,
  );

  // This screen mounts its own live conversation socket (see the doc comment
  // below), keyed to whichever backend/org was active at mount. Switching
  // backends via `BackendSelector` (`environmentSetupMatch`) redirects away on
  // the next tick, but the conversationId in scope until then belongs to the
  // *previous* backend/org -- any post/poll fired against it in the meantime
  // resolves through the *new* active backend's client and either targets a
  // conversation that doesn't exist there, or silently reaches the wrong
  // backend under the new identity. Mirrors the same guard in
  // `routes/conversation.tsx` and `routes/automation-detail.tsx`.
  const active = useActiveBackend();
  const mountedBackendId = React.useRef(active.backend.id);
  const mountedOrgId = React.useRef(active.orgId);
  const backendChanged =
    mountedBackendId.current !== active.backend.id ||
    mountedOrgId.current !== active.orgId;

  // `complete_setup` flips the session row to "completed" so a *later* visit
  // starts fresh (see `completeOnboardingSessionForConversation`), but that
  // update also invalidates `ENVIRONMENT_QUERY_KEYS.all` (via the summary
  // card's own cache refresh, since the readiness score it shows depends on
  // connection state outside that prefix). This screen's session query sits
  // under that same prefix, so the resulting refetch flips `session` to null
  // mid-conversation -- unmounting the live studio and the summary card it
  // was meant to leave on screen. Sticking to the last non-null id keeps this
  // mount on its own conversation regardless of that background refetch; a
  // genuinely different conversation (a new session in the same tab) still
  // takes over below, and a real "no session" only shows up on a fresh mount.
  const sessionConversationId = session?.conversationId ?? null;
  const [conversationId, setConversationId] = React.useState<string | null>(
    null,
  );
  if (
    sessionConversationId !== null &&
    sessionConversationId !== conversationId
  ) {
    setConversationId(sessionConversationId);
  }

  // The store's cards/facts/plan belong to one onboarding conversation. If a
  // second, different session ever mounts this screen in the same tab (the
  // first was completed/abandoned and a new one started, or a different org
  // is active), the previous session's discovery/plan cards are singletons
  // that block a fresh one from ever rendering -- so a real conversation
  // change must wipe the workbench, not just repoint its id.
  const previousConversationIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const previous = previousConversationIdRef.current;
    if (previous !== null && previous !== conversationId) {
      useOnboardingStudioStore.getState().reset();
    }
    previousConversationIdRef.current = conversationId;
    setStudioConversationId(conversationId);
  }, [conversationId, setStudioConversationId]);

  // The OAuth round-trip destroys this page mid-conversation, so the agent is
  // left waiting for a tool result that a full-page navigation threw away.
  // Coming back, we refresh every connection cache and hand the agent the
  // outcome so it carries on by itself.
  React.useEffect(() => {
    const connected = searchParams.get("connected");
    const failed = searchParams.get("error");
    const mirror = searchParams.get("mirror");
    if (!connected && !failed) return;

    // Wait for the session lookup before consuming the receipt. Coming back
    // from OAuth is a cold page load, so this effect runs first with
    // `conversationId` still null; stripping the params there threw the
    // receipt away, and the agent that asked for the connection was left
    // waiting for a tool result that never arrived.
    if (sessionLoading) return;

    // The BackendSelector is in the middle of redirecting us away from this
    // screen -- don't post the receipt to whatever conversation id happens
    // to still be in scope on the newly-active backend.
    if (backendChanged) return;

    // Strip the params first: a re-render must not replay this, and StrictMode
    // double-invokes effects in development.
    const next = new URLSearchParams(searchParams);
    next.delete("connected");
    next.delete("error");
    next.delete("mirror");
    setSearchParams(next, { replace: true });

    const guardKey = `environment-setup:${connected ?? failed}`;
    if (!consumeOAuthReceiptOnce(guardKey)) return;

    if (connected) displaySuccessToast(t(I18nKey.ENVIRONMENT$STATUS_OK));
    if (failed) displayErrorToast(failed);

    void invalidateConnectionCaches(queryClient);

    if (conversationId) {
      createConversationResultPoster(conversationId)(
        `${ONBOARDING_RESULT_PREFIX}${JSON.stringify({
          status: connected ? "connected" : "error",
          provider: connected ?? undefined,
          reason: failed ?? undefined,
          // Says plainly whether the connection also reached the per-user
          // tables the repository picker reads, instead of letting the agent
          // claim more than actually happened.
          legacy_mirror: mirror ?? "unknown",
        })}`,
      );
    }
  }, [
    searchParams,
    setSearchParams,
    queryClient,
    conversationId,
    sessionLoading,
    backendChanged,
    t,
  ]);

  // A "Fix with agent" click elsewhere in the product arrives as ?seed=, so
  // the conversation opens already knowing what the user wanted help with
  // rather than making them retype it.
  const seed = searchParams.get("seed");
  // Holds the exact seed string already acted on (as the conversation's
  // initial query, or posted as a follow-up below), not just a one-shot
  // flag -- a flag alone stayed true forever once the first seed was
  // consumed, so a second, distinct `?seed=` arriving on this same mount
  // (e.g. two different "Fix with agent" deep links opened in a row) was
  // silently dropped instead of being posted.
  const consumedSeedRef = React.useRef<string | null>(null);

  const handleStart = React.useCallback(() => {
    consumedSeedRef.current = seed;
    createConversation(
      {
        query: seed || t(I18nKey.ENVIRONMENT$STUDIO_START_PROMPT),
        extraSystemSuffix: ONBOARDING_SYSTEM_BRIEF,
        entryPoint: "environment_setup_studio",
      },
      {
        onSuccess: (response) =>
          startSession(response.conversation_id, {
            // The conversation now exists, but with no session row nothing
            // ever sets `conversationId`, so this screen silently sat on its
            // "start a new session" state forever with no sign that anything
            // had gone wrong.
            onError: () => displayErrorToast(t(I18nKey.ENVIRONMENT$ERROR_LOAD)),
          }),
        onError: () => displayErrorToast(t(I18nKey.ENVIRONMENT$ERROR_LOAD)),
      },
    );
  }, [createConversation, startSession, seed, t]);

  // `handleStart` only runs from the "start a new session" screen below, so
  // it never sees a `?seed=` that arrives while a session is already active
  // (the dock's "Launch" button always encodes the seed into this URL,
  // whether or not one is running). Left alone, that seed silently vanished:
  // nothing ever read it once `conversationId` was already non-null. Post it
  // as a follow-up message into the running conversation instead, once, and
  // drop it from the URL so a refresh or remount can't resend it.
  React.useEffect(() => {
    if (!conversationId || !seed || consumedSeedRef.current === seed) return;
    if (backendChanged) return;
    consumedSeedRef.current = seed;
    createConversationResultPoster(conversationId)(seed);
    const next = new URLSearchParams(searchParams);
    next.delete("seed");
    setSearchParams(next, { replace: true });
  }, [conversationId, seed, searchParams, setSearchParams, backendChanged]);

  // A backend switch is in flight (BackendSelector flips the active backend
  // and redirects to /environment on the next tick). Unmount now, before the
  // start/loading/needs-LLM screens below (or the live studio) render or post
  // anything against a conversation id that belongs to the previous backend.
  if (backendChanged) {
    return null;
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="p-6">
        <div
          data-testid="environment-setup-unconfigured"
          className="ame-alert ame-alert-info"
        >
          {t(I18nKey.ENVIRONMENT$SUPABASE_REQUIRED)}
        </div>
      </main>
    );
  }

  // The agent cannot interview anyone without a model behind it. Saying so is
  // better than a chat box that silently never answers.
  if (readiness.byCapability.llm === "missing") {
    return (
      <main
        data-testid="environment-setup-needs-llm"
        className="flex flex-col items-center justify-center gap-3 p-10 text-center"
      >
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          {t(I18nKey.ENVIRONMENT$STUDIO_LLM_REQUIRED_TITLE)}
        </h1>
        <p className="max-w-[46ch] text-sm text-[var(--text-secondary)]">
          {t(I18nKey.ENVIRONMENT$STUDIO_LLM_REQUIRED_BODY)}
        </p>
        <button
          type="button"
          data-testid="environment-setup-configure-llm"
          onClick={() => navigate("/settings/llm")}
          className="ame-btn-primary ame-btn-sm"
        >
          {t(I18nKey.ENVIRONMENT$STUDIO_LLM_REQUIRED_ACTION)}
        </button>
      </main>
    );
  }

  if (sessionLoading) {
    return <main className="p-6" data-testid="environment-setup-loading" />;
  }

  if (!conversationId) {
    return (
      <main
        data-testid="environment-setup-start"
        className="flex flex-col items-center justify-center gap-4 p-10 text-center"
      >
        <Sparkles size={24} aria-hidden className="text-[var(--primary-500)]" />
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          {t(I18nKey.ENVIRONMENT$STUDIO_TITLE)}
        </h1>
        <p className="max-w-[52ch] text-sm text-[var(--text-secondary)]">
          {t(I18nKey.ENVIRONMENT$STUDIO_SUBTITLE)}
        </p>
        <button
          type="button"
          data-testid="environment-setup-begin"
          disabled={creating}
          onClick={handleStart}
          className="ame-btn-primary ame-btn-sm"
        >
          {creating
            ? t(I18nKey.ENVIRONMENT$STUDIO_STARTING)
            : t(I18nKey.ENVIRONMENT$STUDIO_START)}
        </button>
      </main>
    );
  }

  return (
    <SetupStudioShell
      conversationId={conversationId}
      outerNavigation={outerNavigation}
    />
  );
}

/**
 * Overrides `NavigationContext.conversationId` so the prop-less
 * `ChatInterface` works on a route with no `:conversationId` param. Verified
 * safe: nothing in the chat tree reads `useParams()` directly -- they all go
 * through `useOptionalConversationId`, which reads this context.
 */
function SetupStudioShell({
  conversationId,
  outerNavigation,
}: {
  conversationId: string;
  outerNavigation: NavigationContextValue;
}) {
  const value = React.useMemo<NavigationContextValue>(
    () => ({ ...outerNavigation, conversationId }),
    [outerNavigation, conversationId],
  );

  return (
    <NavigationProvider value={value}>
      <WebSocketProviderWrapper conversationId={conversationId}>
        <EventHandler>
          <main
            data-testid="environment-setup"
            className="flex h-full min-h-0 flex-col"
          >
            <SetupPanes conversationId={conversationId} />
          </main>
        </EventHandler>
      </WebSocketProviderWrapper>
    </NavigationProvider>
  );
}

export default EnvironmentSetupScreen;
