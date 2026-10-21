import type {
  MCPConfig,
  MCPConfigPatch,
  StdioMCPServer,
} from "@openhands/typescript-client";
import SettingsService from "#/api/settings-service/settings-service.api";
import {
  fetchBackendRuntimeServicesInfo,
  getDeploymentMode,
} from "#/api/agent-server-adapter";

/**
 * REA — "Reverse Engineer Anything" (github.com/morluto/rea, MIT).
 *
 * An MCP server + CLI that gives the agent evidence-backed analysis of the
 * legacy application beyond its source: JavaScript/Electron application
 * graphs, website structure and network captures, .NET assemblies, SQLite
 * databases, process behaviour recordings, and the reconstruction obligation
 * ledger / coverage evaluation Neo ME uses to prove the migrated application
 * behaves like the original. Pinned to one exact version, as REA's own
 * installation docs require for persistent registrations.
 */
export const REA_PACKAGE = "rea-agents";
export const REA_VERSION = "6.7.0";
export const REA_MCP_SERVER_NAME = "rea";
/** REA needs Node 22.19+ / 24.11+ in the agent's environment. */
export const REA_MIN_NODE = "22.19.0";

/**
 * Command the Docker image installs (docker/Dockerfile, `rea` stage). On a
 * fresh machine `npx -y rea-agents` must download REA first, which overran
 * the agent-server's 30 s MCP tool-listing limit and made every Neo ME
 * conversation fail to start on the hosted backend after a deploy.
 */
export const REA_BAKED_COMMAND = "rea";

/**
 * REA's own presentation profiles. With the defaults REA advertises 207 tools
 * with full input and output schemas: a 3 MB tools/list and ~110k prompt
 * tokens on every model call of a Neo ME run. `compact` bounds the input
 * schemas (~4x smaller) and `off` drops output schemas from the listing; REA
 * still validates and returns complete structured results.
 */
export const REA_MCP_ENV = {
  REA_MCP_INPUT_SCHEMA_PROFILE: "compact",
  REA_MCP_OUTPUT_SCHEMA_PROFILE: "off",
} as const;

/** Server entry for local stacks, where npx has a warm cache after first use. */
export const REA_MCP_SERVER: StdioMCPServer = {
  transport: "stdio",
  command: "npx",
  args: ["-y", `${REA_PACKAGE}@${REA_VERSION}`, "mcp"],
  // The settings API redacts env values, so the description doubles as the
  // version marker `hasReaMcpServer` compares: change it with REA_MCP_ENV.
  description:
    "Reverse Engineer Anything — evidence-backed analysis of the legacy app (compact schemas)",
  // No REA_MCP_MAX_RESPONSE_BYTES override: REA validates it (>= 10 MiB) and
  // an invalid value makes the agent-server fail conversation creation.
  // REA pages large results itself (inspect_analysis_view).
  // No `timeout` either: fastmcp 4.1.3+ reads it as milliseconds while the
  // OpenHands settings convention is seconds, and `timeout: 120` gave REA's
  // tool listing a 120 ms budget. The SDK's own 300 s per-call limit still
  // applies to every REA tool call.
  env: { ...REA_MCP_ENV },
};

/** Server entry for the Docker image (hosted backend), REA pre-installed. */
export const REA_MCP_SERVER_BAKED: StdioMCPServer = {
  ...REA_MCP_SERVER,
  command: REA_BAKED_COMMAND,
  args: ["mcp"],
};

/** Pick the entry for where the agent-server runs (`mode` from /server_info). */
export function reaServerForMode(mode: string | null): StdioMCPServer {
  return mode === "docker" ? REA_MCP_SERVER_BAKED : REA_MCP_SERVER;
}

/**
 * True when the stored MCP config carries exactly the pinned REA server.
 * Compared field by field (not just the version) so a stale entry with a
 * different env or args is rewritten by `ensureReaMcpServer`.
 */
export function hasReaMcpServer(
  config: MCPConfig | undefined | null,
  expected: StdioMCPServer = REA_MCP_SERVER,
): boolean {
  const entry = config?.[REA_MCP_SERVER_NAME];
  if (entry?.transport !== "stdio") return false;
  const sameArgs =
    JSON.stringify(entry.args ?? []) === JSON.stringify(expected.args);
  // Values come back redacted ("**********"), so only the names can be
  // compared; the description carries the version of the values.
  const envKeys = (env: object | null | undefined) =>
    JSON.stringify(Object.keys(env ?? {}).sort());
  const sameEnv = envKeys(entry.env) === envKeys(expected.env);
  const sameTimeout = (entry.timeout ?? null) === (expected.timeout ?? null);
  return (
    entry.command === expected.command &&
    sameArgs &&
    sameEnv &&
    sameTimeout &&
    entry.description === expected.description
  );
}

/**
 * Add (or upgrade) the REA MCP server in the agent-server's settings so the
 * next Neo ME conversation can call its tools. Idempotent; never throws
 * (a failure only means the agent falls back to the REA CLI via `npx`).
 *
 * @returns "present" | "added" | "failed"
 */
export async function ensureReaMcpServer(): Promise<
  "present" | "added" | "failed"
> {
  try {
    const mode = getDeploymentMode(await fetchBackendRuntimeServicesInfo());
    const server = reaServerForMode(mode);
    const settings = await SettingsService.getSettings();
    const current = (settings?.mcp_config ?? {}) as MCPConfig;
    if (hasReaMcpServer(current, server)) return "present";
    // Name-keyed RFC 7386 merge patches: a stale entry is removed first,
    // because a merge cannot drop keys (an old `env` would survive a plain
    // re-add) and the settings GET redacts env, so it cannot be diffed.
    if (current[REA_MCP_SERVER_NAME]) {
      await SettingsService.patchMcpConfig({
        [REA_MCP_SERVER_NAME]: null,
      } as unknown as MCPConfigPatch);
    }
    await SettingsService.patchMcpConfig({
      [REA_MCP_SERVER_NAME]: server,
    });
    return "added";
  } catch {
    return "failed";
  }
}
