import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import SettingsService from "#/api/settings-service/settings-service.api";
import {
  buildHarnessSettingsDiff,
  harnessMigrationKey,
} from "#/api/agent-harness";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { SETTINGS_QUERY_KEYS } from "#/hooks/query/query-keys";
import type { Settings } from "#/types/settings";

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return true; // No storage: never re-apply over the user's choices.
  }
}

function writeFlag(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Storage unavailable — nothing to remember.
  }
}

/**
 * Turns the agent harness (parallel tools, sub-agents, critic where
 * supported) on ONCE per local backend. After that the Settings pages own
 * these values, so a user who switches something off keeps it off.
 */
export function useHarnessMigration(settings: Settings | undefined) {
  const queryClient = useQueryClient();
  const { backend } = useActiveBackend();
  const inFlight = React.useRef(false);

  React.useEffect(() => {
    if (!settings || backend.kind === "cloud" || inFlight.current) return;
    const key = harnessMigrationKey(backend.id);
    if (readFlag(key)) return;

    const diff = buildHarnessSettingsDiff(
      settings.agent_settings as Record<string, unknown> | undefined,
    );
    if (!diff) {
      writeFlag(key);
      return;
    }

    inFlight.current = true;
    SettingsService.saveSettings({ agent_settings_diff: diff })
      .then(() => {
        writeFlag(key);
        queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEYS.all });
      })
      .catch((error) => {
        console.warn("[harness] could not enable agent harness", error);
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [settings, backend.id, backend.kind, queryClient]);
}
