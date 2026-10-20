import type { MCPConfig, StdioMCPServer } from "@openhands/typescript-client";
import SettingsService from "#/api/settings-service/settings-service.api";

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

export const REA_MCP_SERVER: StdioMCPServer = {
  transport: "stdio",
  command: "npx",
  args: ["-y", `${REA_PACKAGE}@${REA_VERSION}`, "mcp"],
  description:
    "Reverse Engineer Anything — evidence-backed analysis of the legacy app",
  // Large analyses are paged by REA itself; cap single responses so the
  // model never receives a 2 MB blob.
  env: { REA_MCP_MAX_RESPONSE_BYTES: "200000" },
  timeout: 120,
};

/** True when the stored MCP config already carries the pinned REA server. */
export function hasReaMcpServer(config: MCPConfig | undefined | null): boolean {
  const entry = config?.[REA_MCP_SERVER_NAME];
  if (entry?.transport !== "stdio") return false;
  return (entry.args ?? []).includes(`${REA_PACKAGE}@${REA_VERSION}`);
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
    const settings = await SettingsService.getSettings();
    const current = (settings?.mcp_config ?? {}) as MCPConfig;
    if (hasReaMcpServer(current)) return "present";
    await SettingsService.saveSettings({
      mcp_config: { ...current, [REA_MCP_SERVER_NAME]: REA_MCP_SERVER },
    });
    return "added";
  } catch {
    return "failed";
  }
}
