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

/**
 * supabase-js's `FunctionsHttpError` hardcodes `error.message` to "Edge
 * Function returned a non-2xx status code" regardless of what the function
 * actually returned -- the real reason lives in the Response body on
 * `error.context` (see the identical gotcha documented on `describeProxyError`
 * in `src/api/git-service/local-github-service.api.ts`). Read it so callers
 * (and the UI, which renders `EnvironmentServiceError.message` verbatim) see
 * e.g. "oauth_not_configured: missing GITLAB_OAUTH_CLIENT_ID,
 * GITLAB_OAUTH_CLIENT_SECRET" instead of that generic string.
 */
async function describeInvokeError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as {
        error?: string;
        requires?: string[];
        field?: string;
        detail?: string;
      };
      if (body.error) {
        if (body.requires && body.requires.length > 0) {
          return `${body.error}: missing ${body.requires.join(", ")}`;
        }
        if (body.field) {
          return `${body.error}: ${body.field}`;
        }
        if (body.detail) {
          return `${body.error}: ${body.detail}`;
        }
        return body.error;
      }
    } catch {
      // Response body wasn't JSON -- fall through to the generic message below.
    }
  }
  return error instanceof Error ? error.message : "edge_function_error";
}

async function invoke<T>(
  fn: string,
  body: Record<string, unknown>,
): Promise<T> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke<T>(fn, { body });
  if (error) {
    throw new EnvironmentServiceError(
      "edge_function_error",
      await describeInvokeError(error),
    );
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

  /**
   * Records that an outstanding requirement belongs to someone else.
   *
   * Onboarding routinely stalls on something the person in the chair cannot
   * do -- a firewall rule, an IdP change, an OAuth app only an admin can
   * register. Without somewhere to put that, the conversation either stops or
   * the item is silently forgotten.
   */
  async assignTask(input: {
    requirementId: string;
    assigneeEmail?: string;
    note?: string;
  }): Promise<{ ok: true }> {
    return invoke<{ ok: true }>("environment-profile", {
      action: "assign-task",
      requirementId: input.requirementId,
      assigneeEmail: input.assigneeEmail,
      note: input.note,
    });
  },

  async handoffPacket(): Promise<{ markdown: string; allowlistCsv: string }> {
    return invoke<{ markdown: string; allowlistCsv: string }>(
      "environment-profile",
      { action: "handoff-packet" },
    );
  },
};
