import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";
import type { Capability } from "#/lib/environment/types/capability";
import type {
  ConnectionReceipt,
  ProbeKind,
  ProbeResult,
} from "#/lib/environment/types/probe";
import type { ConnectorFormValues } from "#/lib/environment/validation";

/**
 * Thrown when an Environment Edge Function call fails. Mirrors
 * `GithubProxyError` in `src/api/git-service/local-github-service.api.ts`:
 * swallowing these into an empty result makes "not configured" and "your
 * proxy blocked us" look identical, which is exactly the confusion this
 * module exists to remove.
 */
export class EnvironmentServiceError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "EnvironmentServiceError";
    this.code = code;
  }
}

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new EnvironmentServiceError("supabase_not_configured");
  }
  return supabase;
}

async function invoke<T>(
  fn: string,
  body: Record<string, unknown>,
): Promise<T> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke<T>(fn, { body });
  if (error) {
    throw new EnvironmentServiceError("edge_function_error", error.message);
  }
  if (!data) {
    throw new EnvironmentServiceError("empty_response");
  }
  return data;
}

export interface StartOAuthInput {
  capability: Capability;
  providerId: string;
  instanceKey?: string;
  config?: Record<string, string>;
  returnTo?: string;
}

/**
 * The credential write path. This is the ONLY function in the app that sends
 * a secret anywhere, and it goes browser -> Edge Function directly.
 *
 * `credentials` never passes through the event store, a query cache, a
 * Zustand store, or an agent message. The caller hands over the values it
 * holds in component state and receives back a receipt that is structurally
 * incapable of containing them.
 */
export interface SetCredentialsInput {
  capability: Capability;
  providerId: string;
  instanceKey?: string;
  displayName?: string;
  config: Record<string, string>;
  credentials: ConnectorFormValues;
}

export const EnvironmentService = {
  async startOAuth(input: StartOAuthInput): Promise<{ authorizeUrl: string }> {
    return invoke<{ authorizeUrl: string }>("connections-oauth-start", {
      action: "start",
      capability: input.capability,
      providerId: input.providerId,
      instanceKey: input.instanceKey ?? "default",
      config: input.config ?? {},
      returnTo: input.returnTo,
    });
  },

  async setCredentials(input: SetCredentialsInput): Promise<ConnectionReceipt> {
    return invoke<ConnectionReceipt>("connections-set-credentials", {
      action: "set",
      capability: input.capability,
      providerId: input.providerId,
      instanceKey: input.instanceKey ?? "default",
      displayName: input.displayName,
      config: input.config,
      credentials: input.credentials,
    });
  },

  async disconnect(connectionId: string): Promise<void> {
    await invoke<{ ok: true }>("connections-disconnect", {
      action: "disconnect",
      connectionId,
    });
  },

  async probeConnection(connectionId: string): Promise<ProbeResult> {
    return invoke<ProbeResult>("environment-probe", {
      action: "connection",
      connectionId,
    });
  },

  async probe(kind: ProbeKind, targets: string[] = []): Promise<ProbeResult> {
    return invoke<ProbeResult>("environment-probe", { action: kind, targets });
  },

  async handoffPacket(): Promise<{ markdown: string; allowlistCsv: string }> {
    return invoke<{ markdown: string; allowlistCsv: string }>(
      "environment-profile",
      { action: "handoff-packet" },
    );
  },
};
