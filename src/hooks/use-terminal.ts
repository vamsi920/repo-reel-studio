import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import React from "react";
import { Command, useCommandStore } from "#/stores/command-store";
import { parseTerminalOutput } from "#/utils/parse-terminal-output";

/*
  NOTE: Tests for this hook are indirectly covered by the tests for the XTermTerminal component.
  The reason for this is that the hook exposes a ref that requires a DOM element to be rendered.
*/

const renderCommand = (
  command: Command,
  terminal: Terminal,
  isUserInput: boolean = false,
) => {
  const { content, type } = command;

  // Skip rendering user input commands that come from the event stream
  // as they've already been displayed in the terminal as the user typed
  if (type === "input" && isUserInput) {
    return;
  }

  const trimmedContent = (content || "").replaceAll("\n", "\r\n").trim();
  // Only write if there's actual content to avoid empty newlines
  if (trimmedContent) {
    terminal.writeln(parseTerminalOutput(trimmedContent));
  }
};

/**
 * Check if the terminal is ready for fit operations.
 * This prevents the "Cannot read properties of undefined (reading 'dimensions')" error
 * that occurs when fit() is called on a terminal that is hidden, disposed, or not fully initialized.
 */
const canFitTerminal = (
  terminalInstance: Terminal | null,
  fitAddonInstance: FitAddon | null,
  containerElement: HTMLDivElement | null,
): boolean => {
  // Check terminal and fitAddon exist
  if (!terminalInstance || !fitAddonInstance) {
    return false;
  }

  // Check container element exists
  if (!containerElement) {
    return false;
  }

  // Check element is visible (not display: none)
  // When display is none, offsetParent is null (except for fixed/body elements)
  const computedStyle = window.getComputedStyle(containerElement);
  if (computedStyle.display === "none") {
    return false;
  }

  // Check element has dimensions
  const { clientWidth, clientHeight } = containerElement;
  if (clientWidth === 0 || clientHeight === 0) {
    return false;
  }

  // Check terminal has been opened (element property is set after open())
  if (!terminalInstance.element) {
    return false;
  }

  return true;
};

function resolveTerminalForeground(host: HTMLElement): string {
  const probe = host.ownerDocument.createElement("span");
  probe.style.color = "var(--oh-surface-foreground)";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  host.appendChild(probe);
  const fromVar = getComputedStyle(probe).color;
  probe.remove();
  if (fromVar && fromVar !== "rgba(0, 0, 0, 0)") {
    return fromVar;
  }
  return getComputedStyle(host).color;
}

export const useTerminal = () => {
  const commands = useCommandStore((state) => state.commands);
  const terminal = React.useRef<Terminal | null>(null);
  const fitAddon = React.useRef<FitAddon | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  // How many of `commands` this xterm instance has already written. Per
  // instance: a fresh terminal always re-renders the whole list on mount, so
  // there is nothing to carry across unmounts — and a module-level counter
  // would be shared by every terminal that happens to be alive at once.
  const lastCommandIndex = React.useRef(0);
  const isDisposed = React.useRef(false);

  const createTerminal = (host: HTMLDivElement) =>
    new Terminal({
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 14,
      scrollback: 10000,
      scrollSensitivity: 1,
      fastScrollSensitivity: 5,
      disableStdin: true, // Make terminal read-only
      // Canvas fillStyle does not resolve CSS variables; use transparency so
      // the host / panel background shows through (`allowTransparency` required).
      allowTransparency: true,
      theme: {
        background: "rgba(0, 0, 0, 0)",
        foreground: resolveTerminalForeground(host),
      },
    });

  const fitTerminalSafely = React.useCallback(() => {
    if (isDisposed.current) {
      return;
    }
    if (canFitTerminal(terminal.current, fitAddon.current, ref.current)) {
      fitAddon.current!.fit();
    }
  }, []);

  const initializeTerminal = () => {
    if (terminal.current) {
      if (fitAddon.current) terminal.current.loadAddon(fitAddon.current);
      if (ref.current) {
        terminal.current.open(ref.current);
        // Hide cursor for read-only terminal using ANSI escape sequence
        terminal.current.write("\x1b[?25l");
        fitTerminalSafely();
      }
    }
  };

  // Initialize terminal and handle cleanup
  React.useEffect(() => {
    isDisposed.current = false;
    const host = ref.current;
    if (!host) {
      return undefined;
    }

    terminal.current = createTerminal(host);
    fitAddon.current = new FitAddon();

    if (ref.current) {
      initializeTerminal();
      // Render all commands in array
      // This happens when we just switch to Terminal from other tabs.
      // Read the store directly rather than the render-time `commands`: on a
      // conversation switch the provider clears and re-seeds the store from
      // its layout effects, which run after this component rendered but
      // before this passive effect — the closure would still hold the previous
      // conversation's output.
      const initialCommands = useCommandStore.getState().commands;
      if (initialCommands.length > 0) {
        for (let i = 0; i < initialCommands.length; i += 1) {
          if (initialCommands[i].type === "input") {
            terminal.current.write("$ ");
          }
          // Don't pass isUserInput=true here because we're initializing the terminal
          // and need to show all previous commands
          renderCommand(initialCommands[i], terminal.current, false);
        }
        lastCommandIndex.current = initialCommands.length;
      }
      // Don't show prompt in read-only terminal
    }

    return () => {
      isDisposed.current = true;
      terminal.current?.dispose();
      lastCommandIndex.current = 0;
    };
  }, []);

  React.useEffect(() => {
    if (!terminal.current) {
      return;
    }

    // Same reasoning as the mount effect: `commands` re-runs this effect, but
    // the store may already be ahead of the snapshot this render captured
    // (on the mount pass it is the *previous* conversation's list), so always
    // catch up to what the store holds now.
    const latest = useCommandStore.getState().commands;

    // The store shrank — `clearTerminal()` ran (conversation switch) or the
    // commands were otherwise replaced. Wipe the xterm buffer and start over
    // from the beginning; without this the old output stays on screen and the
    // first `lastCommandIndex` commands of the new list are never written,
    // because the index still points past them.
    if (latest.length < lastCommandIndex.current) {
      terminal.current.reset();
      // reset() restores default modes, so hide the cursor again.
      terminal.current.write("\x1b[?25l");
      lastCommandIndex.current = 0;
    }

    if (latest.length > 0 && lastCommandIndex.current < latest.length) {
      for (let i = lastCommandIndex.current; i < latest.length; i += 1) {
        if (latest[i].type === "input") {
          terminal.current.write("$ ");
        }
        // Don't pass isUserInput=true: the read-only terminal never echoed
        // these itself, so every input line still has to be written here.
        renderCommand(latest[i], terminal.current, false);
      }
      lastCommandIndex.current = latest.length;
    }
  }, [commands]);

  React.useEffect(() => {
    let resizeObserver: ResizeObserver | null = null;

    resizeObserver = new ResizeObserver(() => {
      // Use requestAnimationFrame to debounce resize events and ensure DOM is ready
      requestAnimationFrame(() => {
        fitTerminalSafely();
      });
    });

    if (ref.current) {
      resizeObserver.observe(ref.current);
    }

    return () => {
      resizeObserver?.disconnect();
    };
  }, [fitTerminalSafely]);

  return ref;
};
