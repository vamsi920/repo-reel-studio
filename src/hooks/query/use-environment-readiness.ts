import { useMemo } from "react";
import { useGithubConnection } from "./use-github-connection";
import { useJiraConnection } from "./use-jira-connection";
import { useSettings } from "./use-settings";
import { isSupabaseConfigured } from "#/lib/data-platform/client";
import type { Capability } from "#/lib/environment/types/capability";
import type { CapabilityStatus } from "#/lib/environment/types/requirements";
import type { EnvironmentProfile } from "#/lib/environment/types/profile";
import {
  computeReadiness,
  type ReadinessEvidence,
} from "#/lib/environment/requirements/readiness";

/**
 * Assembles readiness from what this build can already observe, with no new
 * backend surface.
 *
 * Anything not observable yet reports `unknown`, never `missing` -- a
 * readiness screen that invents failures is worse than one that admits it has
 * not looked. Probe-backed evidence replaces these defaults as the probe
 * endpoints land.
 */
export function useEnvironmentReadiness(profile: EnvironmentProfile | null) {
  const github = useGithubConnection();
  const jira = useJiraConnection();
  const settings = useSettings();

  return useMemo(() => {
    const capabilities: Partial<Record<Capability, CapabilityStatus>> = {};

    const connectionStatus = (
      isLoading: boolean,
      connected: boolean,
    ): CapabilityStatus => {
      if (!isSupabaseConfigured) return "unknown";
      if (isLoading) return "unknown";
      return connected ? "ok" : "missing";
    };

    capabilities["source-control"] = connectionStatus(
      github.isLoading,
      Boolean(github.data),
    );
    capabilities["issue-tracker"] = connectionStatus(
      jira.isLoading,
      Boolean(jira.data),
    );

    // The agent server reports a configured model rather than the key itself,
    // which is the only signal available here that does not require reading a
    // secret back out of settings.
    if (settings.isLoading) {
      capabilities.llm = "unknown";
    } else {
      capabilities.llm = settings.data?.llm_model ? "ok" : "missing";
    }

    // These three ride the platform's own Supabase project until an
    // alternative provider is selected in the profile.
    const supabaseBacked: CapabilityStatus = isSupabaseConfigured
      ? "ok"
      : "missing";
    capabilities["vector-store"] = profile?.providers["vector-store"]
      ? "unknown"
      : supabaseBacked;
    capabilities["object-storage"] = profile?.providers["object-storage"]
      ? "unknown"
      : supabaseBacked;
    capabilities["relational-db"] = profile?.providers["relational-db"]
      ? "unknown"
      : supabaseBacked;

    const evidence: ReadinessEvidence = { probes: {}, capabilities };
    return computeReadiness(evidence, profile, new Date().toISOString());
  }, [
    github.isLoading,
    github.data,
    jira.isLoading,
    jira.data,
    settings.isLoading,
    settings.data?.llm_model,
    profile,
  ]);
}
