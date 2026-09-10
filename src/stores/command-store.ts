import { create } from "zustand";
import type { OpenHandsEvent } from "#/types/agent-server/core";
import {
  isExecuteBashActionEvent,
  isExecuteBashObservationEvent,
} from "#/types/agent-server/type-guards";

export type Command = {
  content: string;
  type: "input" | "output";
};

interface CommandState {
  commands: Command[];
  appendInput: (content: string) => void;
  appendOutput: (content: string) => void;
  appendCommands: (commands: Command[]) => void;
  clearTerminal: () => void;
}

/**
 * Map a conversation event to the terminal line it produces, or `null` when
 * the event is not a bash action/observation. Shared by the live WebSocket
 * handler and the REST-preloaded history seed so both feed the terminal the
 * same way.
 */
export const commandFromEvent = (event: OpenHandsEvent): Command | null => {
  if (isExecuteBashActionEvent(event)) {
    return { content: event.action.command, type: "input" };
  }
  if (isExecuteBashObservationEvent(event)) {
    const content = event.observation.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    return { content, type: "output" };
  }
  return null;
};

export const useCommandStore = create<CommandState>((set) => ({
  commands: [],
  appendInput: (content: string) =>
    set((state) => ({
      commands: [...state.commands, { content, type: "input" }],
    })),
  appendOutput: (content: string) =>
    set((state) => ({
      commands: [...state.commands, { content, type: "output" }],
    })),
  // One store update for a whole batch (the preloaded history page), so the
  // terminal re-renders once instead of once per historical command.
  appendCommands: (commands: Command[]) =>
    set((state) =>
      commands.length === 0
        ? state
        : { commands: [...state.commands, ...commands] },
    ),
  clearTerminal: () => set({ commands: [] }),
}));
