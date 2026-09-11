import { useMemo } from "react";
import { useGithubConnection } from "./use-github-connection";
import { useJiraConnection } from "./use-jira-connection";
import { useSettings } from "./use-settings";
import { useConnections } from "./use-connections";
import { isSupabaseConfigured } from "#/lib/data-platform/client";
import type { Capability } from "#/lib/environment/types/capability";
import type { CapabilityStatus } from "#/lib/environment/types/requirements";
import type { EnvironmentProfile } from "#/lib/environment/types/profile";
import {
  computeReadiness,
  type ReadinessEvidence,
} from "#/lib/environment/requirements/readiness";

/**
 * A connection record exists the moment a credential is stored -- it says
 * nothing about whether that credential still works. Only a `Test` probe
 * proves that, and its verdict lands here as `status`. "unverified" (never
 * probed) and "ok" both mean "nothing has disproved this yet", so they fall
 * through to the plain connected->ok mapping; a probe-confirmed problem
 * downgrades the capability instead of leaving it looking fully connected.
 */
function statusFromProbe(status: string | undefined): CapabilityStatus | null {
  if (status === "degraded") return "degraded";
  if (status === "error" || status === "expired" || status === "revoked") {
    return "missing";
  }
  return null;
}

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
  const connections = useConnections();

  return useMemo(() => {
    const capabilities: Partial<Record<Capability, CapabilityStatus>> = {};

    const connectionStatus = (
      isLoading: boolean,
      connected: boolean,
      capability?: Capability,
    ): CapabilityStatus => {
      if (!isSupabaseConfigured) return "unknown";
      if (isLoading) return "unknown";
      if (!connected) return "missing";
      if (capability) {
        const record = connections.data?.find(
          (candidate) => candidate.capability === capability,
        );
        const probeStatus = statusFromProbe(record?.status);
        if (probeStatus) return probeStatus;
      }
      return "ok";
    };

    capabilities["source-control"] = connectionStatus(
      github.isLoading || connections.isLoading,
      Boolean(github.data),
      "source-control",
    );
    capabilities["issue-tracker"] = connectionStatus(
      jira.isLoading || connections.isLoading,
      Boolean(jira.data),
      "issue-tracker",
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
    connections.isLoading,
    connections.data,
    profile,
  ]);
}
