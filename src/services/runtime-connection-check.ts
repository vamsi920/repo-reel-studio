import {
  BashClient,
  ConversationClient,
  FileClient,
} from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { getActiveBackend } from "#/api/backend-registry/active-store";
import { SecretsService } from "#/api/secrets-service";
import {
  buildRuntimeProbeCommand,
  connectionEnvValues,
  evaluateRuntimeProbe,
  runtimeAuthHeaderLines,
  runtimeProbeUrls,
  type RuntimeProbeAttempt,
} from "#/lib/environment/runtime-connection";
import type { ConnectorManifest } from "#/lib/environment/types/capability";

/**
 * Makes a connection usable by the agent, and checks a private-network one
 * from the agent's own machine. See `runtime-connection.ts` for why.
 *
 * Before this, a connection saved during onboarding lived only in Supabase:
 * the agent-server (which is what actually runs the agent's commands) never
 * heard of it, so the agent could not use the GitLab it had just "connected".
 */

export interface RuntimeSyncResult {
  /** Environment variable names the agent can now use. Never the values. */
  envNames: string[];
  /** Saved as agent-server secrets, so every new conversation gets them. */
  savedForNewConversations: boolean;
  /** Added to the conversation that asked for the connection. */
  addedToThisConversation: boolean;
}

export async function syncConnectionToRuntime(args: {
  manifest: ConnectorManifest;
  config: Record<string, string>;
  credentials: Record<string, string>;
  conversationId: string | null;
}): Promise<RuntimeSyncResult> {
  const { manifest, config, credentials, conversationId } = args;
  const values = connectionEnvValues(manifest, config, credentials);
  const envNames = Object.keys(values);
  if (envNames.length === 0) {
    return {
      envNames,
      savedForNewConversations: false,
      addedToThisConversation: false,
    };
  }

  let savedForNewConversations = true;
  try {
    await Promise.all(
      Object.entries(values).map(([name, value]) =>
        SecretsService.createSecret(
          name,
          value,
          `${manifest.id} connection (${name}), synced from Environment setup`,
        ),
      ),
    );
  } catch {
    savedForNewConversations = false;
  }

  let addedToThisConversation = false;
  if (conversationId && getActiveBackend().backend.kind !== "cloud") {
    try {
      await new ConversationClient(getAgentServerClientOptions()).updateSecrets(
        conversationId,
        {
          secrets: Object.fromEntries(
            Object.entries(values).map(([name, value]) => [
              name,
              { kind: "StaticSecret" as const, value },
            ]),
          ),
        },
      );
      addedToThisConversation = true;
    } catch {
      addedToThisConversation = false;
    }
  }

  return { envNames, savedForNewConversations, addedToThisConversation };
}

export interface RuntimeCheckResult {
  status: "ok" | "failed" | "unsupported";
  /** The attempt that decided the result (the first that passed, else the last). */
  attempt?: RuntimeProbeAttempt;
  attempts: RuntimeProbeAttempt[];
  /** Only plain HTTP answered: works, but credentials cross the network unencrypted. */
  insecureHttp: boolean;
}

/** Failures where trying plain HTTP could change the answer. */
const RETRY_OVER_HTTP = new Set([
  "dns",
  "unreachable",
  "timeout",
  "tls_untrusted",
]);

export async function checkConnectionFromRuntime(args: {
  manifest: ConnectorManifest;
  config: Record<string, string>;
  credentials: Record<string, string>;
}): Promise<RuntimeCheckResult> {
  const { manifest, config, credentials } = args;
  // A Cloud runtime is not inside the customer's network; checking from
  // there would be the same wrong vantage as the Edge Function.
  if (getActiveBackend().backend.kind === "cloud") {
    return { status: "unsupported", attempts: [], insecureHttp: false };
  }
  const urls = runtimeProbeUrls(manifest, config);
  if (urls.length === 0) {
    return { status: "unsupported", attempts: [], insecureHttp: false };
  }

  const options = getAgentServerClientOptions();
  const bash = new BashClient(options);
  const id = crypto.randomUUID();
  const headerFile = `/tmp/neodevex-probe-${id}.h`;
  const attempts: RuntimeProbeAttempt[] = [];
  try {
    // The credential goes browser -> agent-server as a file, never as part
    // of a command, so it is not in the runtime's bash event log.
    await new FileClient(options).uploadTextFile(
      `${runtimeAuthHeaderLines(manifest, credentials).join("\n")}\n`,
      headerFile,
    );
    for (const url of urls) {
      const output = await bash.executeCommand({
        command: buildRuntimeProbeCommand({
          url,
          method: manifest.probe.request.method,
          headerFile,
          bodyFile: `/tmp/neodevex-probe-${id}.body`,
          errorFile: `/tmp/neodevex-probe-${id}.err`,
        }),
        timeout: 30,
      });
      const attempt = evaluateRuntimeProbe(manifest, url, output.stdout ?? "");
      attempts.push(attempt);
      if (attempt.ok || !RETRY_OVER_HTTP.has(attempt.failure ?? "")) break;
    }
  } catch {
    attempts.push({
      url: urls[0],
      ok: false,
      httpStatus: null,
      failure: "unreachable",
      checks: [],
    });
  } finally {
    await bash
      .executeCommand({ command: `rm -f '${headerFile}'`, timeout: 10 })
      .catch(() => undefined);
  }

  const passed = attempts.find((attempt) => attempt.ok);
  return {
    status: passed ? "ok" : "failed",
    attempt: passed ?? attempts.at(-1),
    attempts,
    insecureHttp: Boolean(passed?.url.startsWith("http://")),
  };
}
