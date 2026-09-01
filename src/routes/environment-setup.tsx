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
import { ONBOARDING_RESULT_PREFIX } from "#/constants/onboarding-control";
import { ONBOARDING_SYSTEM_BRIEF } from "#/components/features/environment/copilot/onboarding-brief";
import { isSupabaseConfigured } from "#/lib/data-platform/client";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";

/** Guards against re-posting an OAuth receipt when StrictMode remounts. */
const OAUTH_RECEIPT_GUARD_PREFIX = "onboarding-oauth-receipt:";

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

  const conversationId = session?.conversationId ?? null;

  React.useEffect(() => {
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

    // Strip the params first: a re-render must not replay this, and StrictMode
    // double-invokes effects in development.
    const next = new URLSearchParams(searchParams);
    next.delete("connected");
    next.delete("error");
    next.delete("mirror");
    setSearchParams(next, { replace: true });

    const guardKey = `${OAUTH_RECEIPT_GUARD_PREFIX}${connected ?? failed}`;
    try {
      if (sessionStorage.getItem(guardKey)) return;
      sessionStorage.setItem(guardKey, "1");
    } catch {
      // A browser refusing sessionStorage costs at worst a duplicate receipt.
    }

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
  }, [searchParams, setSearchParams, queryClient, conversationId, t]);

  // A "Fix with agent" click elsewhere in the product arrives as ?seed=, so
  // the conversation opens already knowing what the user wanted help with
  // rather than making them retype it.
  const seed = searchParams.get("seed");

  const handleStart = React.useCallback(() => {
    createConversation(
      {
        query: seed || t(I18nKey.ENVIRONMENT$STUDIO_START_PROMPT),
        extraSystemSuffix: ONBOARDING_SYSTEM_BRIEF,
        entryPoint: "environment_setup_studio",
      },
      {
        onSuccess: (response) => startSession(response.conversation_id),
        onError: () => displayErrorToast(t(I18nKey.ENVIRONMENT$ERROR_LOAD)),
      },
    );
  }, [createConversation, startSession, seed, t]);

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
