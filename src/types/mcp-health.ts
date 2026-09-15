import type { ExtendedMCPTestFailureKind } from "#/types/mcp-server";

/**
 * Why a health check failed. The backend's own verdicts describe the MCP
 * server; `probe-unavailable` is the one client-side kind and means the test
 * request itself never got a verdict (agent-server down, 5xx from
 * `/api/mcp/test`, network failure) — so it says nothing about the server.
 */
export type McpHealthFailureKind =
  | ExtendedMCPTestFailureKind
  | "probe-unavailable";

/** How strongly the last successful check proved the server works. */
export type McpHealthVerification =
  // A representative read-only tool call succeeded — credentials exercised.
  | "verified"
  // Connect + tools/list only — proves connectivity, not credentials.
  | "connectivity-only";

export type McpServerHealth =
  | { status: "unchecked" }
  | { status: "checking"; checkId: number }
  | {
      status: "healthy";
      verification: McpHealthVerification;
      toolCount: number;
      checkedAt: number;
    }
  | {
      status: "failed";
      kind: McpHealthFailureKind;
      /** Redacted, display-safe error detail. */
      error: string;
      checkedAt: number;
    };

export const UNCHECKED_MCP_HEALTH: McpServerHealth = { status: "unchecked" };
