import React from "react";
import { useLocation, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { invalidateConnectionCaches } from "#/lib/environment/invalidate-connection-caches";
import { consumeOAuthReceiptOnce } from "#/lib/environment/oauth-receipt-guard";
import {
  clearOAuthPending,
  hasPendingOAuth,
} from "#/lib/environment/oauth-origin";
import { getConnectorManifest } from "#/lib/environment/registry";
import { ONBOARDING_RESULT_PREFIX } from "#/constants/onboarding-control";
import { createConversationResultPoster } from "#/services/onboarding-control";
import { useOnboardingSession } from "#/hooks/query/use-onboarding-session";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";

/**
 * Routes that parse the OAuth receipt themselves. Everywhere else is handled
 * here, so a connection started from any page (the dock follows the user
 * around the app) ends with a toast, fresh caches and -- when the onboarding
 * agent asked for it -- a result posted back to that agent, instead of a
 * silent `?connected=` in the address bar and an agent waiting forever.
 */
const SELF_HANDLED_ROUTES = [
  "/environment/setup",
  "/environment/connections",
  "/settings/connections",
];

function isSelfHandled(pathname: string): boolean {
  return SELF_HANDLED_ROUTES.some(
    (route) => pathname === route || pathname.endsWith(route),
  );
}

export function useGlobalOAuthReceipt(): void {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: session } = useOnboardingSession();
  const conversationId = session?.conversationId;

  React.useEffect(() => {
    if (isSelfHandled(location.pathname)) return;

    const connected = searchParams.get("connected");
    const failed = searchParams.get("error");
    if (!connected && !failed) return;

    // `error` is a common query parameter. Only treat it as ours when this
    // tab really started an OAuth flow; `connected` must name a provider we
    // know. Anything else belongs to some other feature and is left alone.
    const isOurConnected = Boolean(
      connected && getConnectorManifest(connected),
    );
    const isOurError = Boolean(failed && hasPendingOAuth());
    if (!isOurConnected && !isOurError) return;

    const mirror = searchParams.get("mirror");
    const next = new URLSearchParams(searchParams);
    next.delete("connected");
    next.delete("error");
    next.delete("mirror");
    setSearchParams(next, { replace: true });

    if (!consumeOAuthReceiptOnce(`global:${connected ?? failed}`)) return;
    clearOAuthPending();

    if (isOurConnected) displaySuccessToast(t(I18nKey.ENVIRONMENT$STATUS_OK));
    if (isOurError && failed) displayErrorToast(failed);
    void invalidateConnectionCaches(queryClient);

    if (conversationId) {
      createConversationResultPoster(conversationId)(
        `${ONBOARDING_RESULT_PREFIX}${JSON.stringify({
          status: isOurConnected ? "connected" : "error",
          provider: isOurConnected ? connected : undefined,
          reason: isOurError ? failed : undefined,
          legacy_mirror: mirror ?? "unknown",
        })}`,
      );
    }
  }, [
    location.pathname,
    searchParams,
    setSearchParams,
    queryClient,
    conversationId,
    t,
  ]);
}
