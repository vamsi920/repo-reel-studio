import { useCallback } from "react";
import { useConversationWebSocket } from "#/contexts/conversation-websocket-context";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { MessageContent } from "#/api/conversation-service/agent-server-conversation-service.types";
import { containsMemoryBlock } from "#/lib/workspace-memory";
import { useWorkspaceMemoryContext } from "#/hooks/use-workspace-memory-context";

interface SendResult {
  queued: boolean; // true if message was queued for later delivery
}

/**
 * Sends user messages through the active conversation WebSocket.
 *
 * This is the one choke point every send site funnels through, so it is also
 * where workspace memory is attached. Injection is invisible: the user sees
 * their own message, the agent sees the memory block above it.
 */
export function useSendMessage() {
  // Optional: this hook is reachable from the home-page chat input shell.
  // Outside a conversation route, `conversationContext` is null anyway so
  // `send` is a no-op that returns `{ queued: false }`.
  const { conversationId } = useOptionalConversationId();

  // Get agent-server context (null outside a conversation provider)
  const conversationContext = useConversationWebSocket();
  const buildMemoryContext = useWorkspaceMemoryContext();

  const send = useCallback(
    async (event: Record<string, unknown>): Promise<SendResult> => {
      if (conversationContext) {
        // Convert chat input payloads to agent-server message content.
        const { action, args } = event as {
          action: string;
          args?: {
            content?: string;
            image_urls?: string[];
            file_urls?: string[];
            timestamp?: string;
          };
        };

        if (action === "message" && args?.content) {
          // Workspace memory rides above the user's text. Resends already
          // carry a block, so never stack a second one.
          const memory = containsMemoryBlock(args.content)
            ? ""
            : buildMemoryContext(args.content);

          // Build agent-server message content array
          const content: Array<MessageContent> = [
            {
              type: "text",
              text: memory ? `${memory}\n\n${args.content}` : args.content,
            },
          ];

          // Add images if present - using SDK's ImageContent format
          if (args.image_urls && args.image_urls.length > 0) {
            content.push({
              type: "image",
              image_urls: args.image_urls,
            });
          }

          // Send via WebSocket context (uses correct host/port)
          const result = await conversationContext.sendMessage({
            role: "user",
            content,
          });
          return result;
        }
        return { queued: false };
      }
      return { queued: false };
    },
    [conversationContext, conversationId, buildMemoryContext],
  );

  return { send };
}
