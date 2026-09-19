import { beforeEach, describe, expect, it } from "vitest";
import {
  ActionSecurityRisk,
  useSecurityAnalyzerStore,
} from "#/stores/security-analyzer-store";

describe("security analyzer store", () => {
  beforeEach(() => {
    useSecurityAnalyzerStore.getState().clearLogs();
  });

  it("appends a new log for a new id", () => {
    useSecurityAnalyzerStore.getState().appendSecurityAnalyzerInput({
      id: 1,
      args: { command: "ls", security_risk: ActionSecurityRisk.LOW },
    });

    expect(useSecurityAnalyzerStore.getState().logs).toEqual([
      {
        id: 1,
        content: "ls",
        security_risk: ActionSecurityRisk.LOW,
        confirmation_state: undefined,
        confirmed_changed: false,
      },
    ]);
  });

  it("updates an existing log's confirmation_state without mutating the old object", () => {
    useSecurityAnalyzerStore.getState().appendSecurityAnalyzerInput({
      id: 1,
      args: {
        command: "rm -rf /",
        security_risk: ActionSecurityRisk.HIGH,
        confirmation_state: "awaiting_confirmation",
      },
    });
    const original = useSecurityAnalyzerStore.getState().logs[0];

    useSecurityAnalyzerStore.getState().appendSecurityAnalyzerInput({
      id: 1,
      args: {
        command: "rm -rf /",
        security_risk: ActionSecurityRisk.HIGH,
        confirmation_state: "confirmed",
      },
    });

    // Regression: the store used to mutate the matched log object in place
    // and only swap the array wrapper, so a consumer holding a reference to
    // the old log object (e.g. a memoized list item) would never see the
    // update. The original object must now be left untouched, and the store
    // must hold a new object with the new state.
    expect(original.confirmation_state).toBe("awaiting_confirmation");
    expect(original.confirmed_changed).toBe(false);

    const updated = useSecurityAnalyzerStore.getState().logs[0];
    expect(updated).not.toBe(original);
    expect(updated.confirmation_state).toBe("confirmed");
    expect(updated.confirmed_changed).toBe(true);
  });

  it("matches an existing awaiting-confirmation log by content when ids differ", () => {
    useSecurityAnalyzerStore.getState().appendSecurityAnalyzerInput({
      id: 1,
      args: {
        command: "rm -rf /",
        security_risk: ActionSecurityRisk.HIGH,
        confirmation_state: "awaiting_confirmation",
      },
    });

    useSecurityAnalyzerStore.getState().appendSecurityAnalyzerInput({
      id: 2,
      args: {
        command: "rm -rf /",
        security_risk: ActionSecurityRisk.HIGH,
        confirmation_state: "rejected",
      },
    });

    const { logs } = useSecurityAnalyzerStore.getState();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      id: 1,
      confirmation_state: "rejected",
      confirmed_changed: true,
    });
  });

  it("returns a new array reference even when nothing changed, to still trigger a re-render", () => {
    useSecurityAnalyzerStore.getState().appendSecurityAnalyzerInput({
      id: 1,
      args: { command: "ls", security_risk: ActionSecurityRisk.LOW },
    });
    const before = useSecurityAnalyzerStore.getState().logs;

    useSecurityAnalyzerStore.getState().appendSecurityAnalyzerInput({
      id: 1,
      args: { command: "ls", security_risk: ActionSecurityRisk.LOW },
    });
    const after = useSecurityAnalyzerStore.getState().logs;

    expect(after).not.toBe(before);
    expect(after[0]).toBe(before[0]);
  });

  it("appends a distinct new log when neither id nor awaiting content matches", () => {
    useSecurityAnalyzerStore.getState().appendSecurityAnalyzerInput({
      id: 1,
      args: { command: "ls", security_risk: ActionSecurityRisk.LOW },
    });
    useSecurityAnalyzerStore.getState().appendSecurityAnalyzerInput({
      id: 2,
      args: { command: "pwd", security_risk: ActionSecurityRisk.LOW },
    });

    expect(useSecurityAnalyzerStore.getState().logs).toHaveLength(2);
  });

  it("falls back to args.code when args.command is absent", () => {
    useSecurityAnalyzerStore.getState().appendSecurityAnalyzerInput({
      id: 1,
      args: { code: "print(1)", security_risk: ActionSecurityRisk.LOW },
    });

    expect(useSecurityAnalyzerStore.getState().logs[0].content).toBe(
      "print(1)",
    );
  });

  it("falls back to args.content when neither command nor code is present", () => {
    useSecurityAnalyzerStore.getState().appendSecurityAnalyzerInput({
      id: 1,
      args: { content: "some content", security_risk: ActionSecurityRisk.LOW },
    });

    expect(useSecurityAnalyzerStore.getState().logs[0].content).toBe(
      "some content",
    );
  });

  it("falls back to the top-level message when no args field carries content", () => {
    useSecurityAnalyzerStore.getState().appendSecurityAnalyzerInput({
      id: 1,
      args: { security_risk: ActionSecurityRisk.LOW },
      message: "a plain message",
    });

    expect(useSecurityAnalyzerStore.getState().logs[0].content).toBe(
      "a plain message",
    );
  });

  it("defaults content to an empty string when nothing carries any text", () => {
    useSecurityAnalyzerStore.getState().appendSecurityAnalyzerInput({
      id: 1,
      args: { security_risk: ActionSecurityRisk.LOW },
    });

    expect(useSecurityAnalyzerStore.getState().logs[0].content).toBe("");
  });

  it("clearLogs empties the store", () => {
    useSecurityAnalyzerStore.getState().appendSecurityAnalyzerInput({
      id: 1,
      args: { command: "ls", security_risk: ActionSecurityRisk.LOW },
    });
    useSecurityAnalyzerStore.getState().clearLogs();

    expect(useSecurityAnalyzerStore.getState().logs).toEqual([]);
  });
});
