import React from "react";
import type { OpenHandsEvent } from "#/types/agent-server/core";

/**
 * Where the shared chat is being shown, for the few pieces of chrome that
 * only make sense in a coding conversation.
 *
 * The environment setup studio reuses `ChatInterface`, which used to show
 * "What do you want to build?" and the repository/Pull/Push/Pull Request bar
 * to someone describing their company's network (case-studies/onboarding).
 */
export interface ChatSurface {
  /** Replaces the composer's placeholder. */
  placeholder?: string;
  /** The repository / branch / Pull / Push / Pull Request bar. */
  showGitControls: boolean;
  /** Messages this surface does not show (they still reach the agent). */
  hideEvent?: (event: OpenHandsEvent) => boolean;
}

const DEFAULT_SURFACE: ChatSurface = { showGitControls: true };

const ChatSurfaceContext = React.createContext<ChatSurface>(DEFAULT_SURFACE);

export function ChatSurfaceProvider({
  value,
  children,
}: {
  value: ChatSurface;
  children: React.ReactNode;
}) {
  return (
    <ChatSurfaceContext.Provider value={value}>
      {children}
    </ChatSurfaceContext.Provider>
  );
}

export function useChatSurface(): ChatSurface {
  return React.useContext(ChatSurfaceContext);
}
