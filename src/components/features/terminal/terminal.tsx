import { useTerminal } from "#/hooks/use-terminal";
import "@xterm/xterm/css/xterm.css";
import { RUNTIME_STARTING_STATES } from "#/types/agent-state";
import { cn } from "#/utils/utils";
import { WaitingForRuntimeMessage } from "../chat/waiting-for-runtime-message";
import { useAgentState } from "#/hooks/use-agent-state";
import { useCommandStore } from "#/stores/command-store";
import { EmptyTerminalMessage } from "./empty-terminal-message";

function Terminal() {
  const { curAgentState } = useAgentState();
  const commands = useCommandStore((state) => state.commands);

  // Only the "still booting" states mean the sandbox process itself isn't up
  // yet. An agent/LLM error (AgentState.ERROR) leaves the runtime alive —
  // show the terminal's normal empty/history state instead of "Waiting for
  // runtime to start...", which is misleading and never clears.
  const isRuntimeInactive = RUNTIME_STARTING_STATES.includes(curAgentState);
  const hasOutput = commands.length > 0;
  const hideTerminalSurface = isRuntimeInactive || !hasOutput;

  const ref = useTerminal();

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {isRuntimeInactive && <WaitingForRuntimeMessage className="pt-16" />}

      {!isRuntimeInactive && !hasOutput && <EmptyTerminalMessage />}

      <div
        className={cn(
          "flex-1 min-h-0 p-4",
          hideTerminalSurface &&
            "pointer-events-none absolute inset-0 h-0 w-0 overflow-hidden p-0 opacity-0",
        )}
      >
        <div ref={ref} className="h-full w-full" />
      </div>
    </div>
  );
}

export default Terminal;
