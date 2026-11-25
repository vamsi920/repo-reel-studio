import React from "react";
import { getLockedCloudHost } from "#/api/agent-server-config";
import { useActiveBackend } from "#/contexts/active-backend-context";
import type { Backend } from "#/api/backend-registry/types";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { useBackendsHealth } from "#/hooks/query/use-backends-health";
import { useSettings } from "#/hooks/query/use-settings";
import { setTelemetryConsent } from "#/services/telemetry";

/**
 * Neo no longer asks "Help improve Neo" on first run. Anonymous usage data is
 * on by default and people switch it off in Settings > App (which already
 * shows "on" for an unset preference).
 *
 * This replaces the old first-run dialog for exactly the case it covered: a
 * reachable local backend whose `user_consents_to_analytics` is still unset.
 * It records the default the dialog used to pre-tick, so the backend and the
 * browser agree. Any stored choice, including an opt-out, is left alone, and
 * the library's `getTelemetryConsent()` keeps its "pending" semantics for
 * hosts that embed Neo and ask their users themselves.
 */
function ApplyLocalDefault({ backend }: { backend: Backend }) {
  const health = useBackendsHealth([backend]);
  const isBackendConnected = health[backend.id]?.isConnected === true;
  const { data: settings, isSuccess } = useSettings();
  const { mutateAsync: saveSettings } = useSaveSettings();
  const appliedFor = React.useRef<string | null>(null);

  const unset =
    isBackendConnected &&
    isSuccess &&
    settings?.user_consents_to_analytics === null;

  React.useEffect(() => {
    if (!unset || appliedFor.current === backend.id) return;
    appliedFor.current = backend.id;
    (async () => {
      try {
        await saveSettings({ user_consents_to_analytics: true });
      } catch {
        // Try again on the next load; nothing is shown either way.
        appliedFor.current = null;
        return;
      }
      await setTelemetryConsent("granted");
    })();
  }, [unset, backend.id, saveSettings]);

  return null;
}

export function DefaultTelemetryConsent() {
  const { backend } = useActiveBackend();
  if (getLockedCloudHost() !== null || backend.kind !== "local") return null;
  return <ApplyLocalDefault backend={backend} />;
}
