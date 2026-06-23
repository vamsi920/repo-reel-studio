import type { IngestionHealth, IngestionHealthAgentRuns } from "@/lib/agentRuns";

export type AgentOpsWriteMode = "full" | "read-only" | "proxied" | string;

export interface AgentOpsCapabilityHealth {
  mode?: string;
  connected?: boolean | null;
  routesAvailable?: boolean;
  writes?: AgentOpsWriteMode;
  proxyBase?: string | null;
  agentReachable?: boolean | null;
}

export interface NormalizedIngestionHealth extends IngestionHealth {
  ingestionMode?: string;
  agentRuns?: AgentOpsCapabilityHealth;
  proactive?: AgentOpsCapabilityHealth;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCapability(raw: unknown, legacy?: IngestionHealthAgentRuns): AgentOpsCapabilityHealth | undefined {
  const record = isRecord(raw) ? raw : {};
  const mode = String(record.mode ?? legacy?.mode ?? "");
  const proxyBase =
    record.proxyBase === undefined ? legacy?.proxyBase ?? null : (record.proxyBase as string | null);
  const agentReachable =
    record.agentReachable !== undefined
      ? (record.agentReachable as boolean | null)
      : legacy?.agentReachable ?? null;

  let connected: boolean | null =
    record.connected === undefined || record.connected === null
      ? null
      : Boolean(record.connected);
  if (connected === null) {
    if (mode === "native" || mode === "python") connected = true;
    else if (mode === "local-read-only") connected = false;
    else if (mode === "proxy") connected = agentReachable;
  }

  const routesAvailable =
    record.routesAvailable !== undefined
      ? Boolean(record.routesAvailable)
      : mode === "local-read-only" || mode === "native" || mode === "proxy";

  let writes = String(record.writes ?? "");
  if (!writes) {
    if (mode === "local-read-only") writes = "read-only";
    else if (mode === "proxy") writes = "proxied";
    else if (mode === "native") writes = "full";
    else writes = "read-only";
  }

  return {
    mode: mode || undefined,
    connected,
    routesAvailable,
    writes,
    proxyBase,
    agentReachable,
  };
}

export function normalizeIngestionHealth(raw: IngestionHealth | null): NormalizedIngestionHealth | null {
  if (!raw) return null;
  const record = raw as NormalizedIngestionHealth;
  const legacyAgent = record.agentRuns as IngestionHealthAgentRuns | undefined;
  return {
    ...record,
    ingestionMode: record.ingestionMode,
    agentRuns: normalizeCapability(record.agentRuns, legacyAgent),
    proactive: normalizeCapability(record.proactive),
  };
}

export {
  resolveAgentBackendAttention,
  resolveProactiveBackendAttention,
} from "@/lib/agentOpsAttention";

import {
  resolveAgentBackendAttention,
  resolveProactiveBackendAttention,
} from "@/lib/agentOpsAttention";

/** @deprecated Prefer resolveAgentBackendAttention */
export function resolveAgentBackendHint(health: NormalizedIngestionHealth | null): string | null {
  return resolveAgentBackendAttention(health)?.message ?? null;
}

/** @deprecated Prefer resolveProactiveBackendAttention */
export function resolveProactiveBackendHint(health: NormalizedIngestionHealth | null): string | null {
  return resolveProactiveBackendAttention(health)?.message ?? null;
}
