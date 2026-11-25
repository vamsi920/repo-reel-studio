/**
 * Gives Neo's agents the team's knowledge (specs/neo-rag.md, RAG-001).
 *
 * Registers the hosted `rag` Edge Function as a remote MCP server
 * (`neo-rag`, streamable HTTP, `x-rag-key` header) in the agent-server's
 * settings, so every new conversation gets `rag_search`, `rag_answer` and
 * `rag_list_collections`. The key is a normal Neo RAG API key named for the
 * purpose; revoking it in the Connect tab disconnects the agents.
 *
 * Works for any backend that can reach the internet (local, Docker, Cloud):
 * nothing is installed in the sandbox.
 */
import type { MCPConfig, MCPConfigPatch } from "@openhands/typescript-client";
import SettingsService from "#/api/settings-service/settings-service.api";
import { parseMcpConfig } from "#/utils/mcp-config";
import { RagService, ragMcpUrl } from "#/api/rag/rag-service.api";

export const RAG_MCP_SERVER_NAME = "neo-rag";
export const RAG_AGENT_KEY_NAME = "Neo agents";
export const RAG_MCP_DESCRIPTION =
  "Neo RAG: search the team's connected knowledge (docs, KT, repositories, decisions) with citations";

export function hasRagMcpServer(config: MCPConfig | null | undefined): boolean {
  const entry = config?.[RAG_MCP_SERVER_NAME];
  return entry?.url === ragMcpUrl();
}

/** The stored MCP servers, wherever this backend's settings keep them. */
async function storedMcpConfig(): Promise<MCPConfig> {
  const settings = await SettingsService.getSettings();
  // Local backends keep servers under agent_settings.mcp_config and report
  // the flat field as {}, so both are merged rather than chosen with `??`.
  return {
    ...parseMcpConfig(settings?.agent_settings?.mcp_config),
    ...(settings?.mcp_config ?? {}),
  } as MCPConfig;
}

export async function isRagConnectedToAgents(): Promise<boolean> {
  return hasRagMcpServer(await storedMcpConfig());
}

/** Revokes the keys earlier connects created, so only one agent key is live. */
async function revokeAgentKeys(): Promise<void> {
  const keys = await RagService.listApiKeys();
  await Promise.all(
    keys
      .filter((key) => key.name === RAG_AGENT_KEY_NAME && !key.revoked_at)
      .map((key) => RagService.revokeApiKey(key.id)),
  );
}

/** Creates a key for the agents and registers the MCP server. Idempotent. */
export async function connectRagToAgents(
  collectionIds: string[] | null,
): Promise<void> {
  await revokeAgentKeys();
  const created = await RagService.createApiKey(
    RAG_AGENT_KEY_NAME,
    collectionIds,
  );
  const current = await storedMcpConfig();
  if (current[RAG_MCP_SERVER_NAME]) {
    // A merge patch cannot drop old headers; remove the entry first.
    await SettingsService.patchMcpConfig({
      [RAG_MCP_SERVER_NAME]: null,
    } as unknown as MCPConfigPatch);
  }
  await SettingsService.patchMcpConfig({
    [RAG_MCP_SERVER_NAME]: {
      transport: "http",
      url: ragMcpUrl(),
      headers: { "x-rag-key": created.key },
      description: RAG_MCP_DESCRIPTION,
    },
  } as unknown as MCPConfigPatch);
}

export async function disconnectRagFromAgents(): Promise<void> {
  await revokeAgentKeys();
  await SettingsService.patchMcpConfig({
    [RAG_MCP_SERVER_NAME]: null,
  } as unknown as MCPConfigPatch);
}
