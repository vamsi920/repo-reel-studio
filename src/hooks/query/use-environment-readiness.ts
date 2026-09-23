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
      isPending: boolean,
      connected: boolean,
      capability?: Capability,
    ): CapabilityStatus => {
      if (!isSupabaseConfigured) return "unknown";
      if (isPending) return "unknown";
      if (!connected) return "missing";
      if (capability) {
        // An org can have more than one connection for the same capability
        // (e.g. a second GitHub Enterprise instance) -- match the specific
        // "default" instance this readiness check's `connected` flag
        // actually reflects, the same way `environment-connections.tsx`
        // resolves "the" connection for a manifest. Matching on capability
        // alone let an unrelated second instance's probe status (arbitrary
        // array order from an unordered query) override or mask this one's.
        const record = connections.data?.find(
          (candidate) =>
            candidate.capability === capability &&
            candidate.instanceKey === "default",
        );
        const probeStatus = statusFromProbe(record?.status);
        if (probeStatus) return probeStatus;
      }
      return "ok";
    };

    // `isPending` (not `isLoading`) is what actually means "no answer yet":
    // a disabled query -- these are all gated behind the auth/org bootstrap
    // resolving -- reports `isLoading: false` the instant it mounts, even
    // though it has never fetched, which previously let a fresh page load
    // read as a confirmed "missing" connection for one render before the
    // real query kicked in and corrected it.
    capabilities["source-control"] = connectionStatus(
      github.isPending || connections.isPending,
      Boolean(github.data),
      "source-control",
    );
    capabilities["issue-tracker"] = connectionStatus(
      jira.isPending || connections.isPending,
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
    github.isPending,
    github.data,
    jira.isPending,
    jira.data,
    settings.isLoading,
    settings.data?.llm_model,
    connections.isPending,
    connections.data,
    profile,
  ]);
}
