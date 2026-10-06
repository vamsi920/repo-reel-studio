import { describe, expect, it } from "vitest";
import type { OpenHandsEvent } from "#/types/agent-server/core";
import {
  CLUSTER_MIN,
  buildThinkingGraph,
} from "#/components/features/thinking-graph/build-thinking-graph";

let clock = 0;
const ts = () => new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString();

const userMessage = (id: string, text: string) =>
  ({
    id,
    timestamp: ts(),
    source: "user",
    llm_message: { role: "user", content: [{ type: "text", text }] },
  }) as unknown as OpenHandsEvent;

const action = (
  id: string,
  kind: string,
  fields: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
) =>
  ({
    id,
    timestamp: ts(),
    source: "agent",
    thought: [],
    action: { kind, ...fields },
    tool_name: kind,
    tool_call_id: `call-${id}`,
    llm_response_id: `resp-${id}`,
    ...extra,
  }) as unknown as OpenHandsEvent;

const observation = (
  id: string,
  actionId: string,
  kind: string,
  fields: Record<string, unknown> = {},
) =>
  ({
    id,
    timestamp: ts(),
    source: "environment",
    action_id: actionId,
    tool_name: kind,
    tool_call_id: `call-${actionId}`,
    observation: { kind, ...fields },
  }) as unknown as OpenHandsEvent;

const bash = (id: string) =>
  action(id, "ExecuteBashAction", { command: `echo ${id}` });

describe("buildThinkingGraph", () => {
  it("grows from the user's goal and marks a step running until its observation arrives", () => {
    // Arrange
    const events = [userMessage("u1", "Fix the bug"), bash("a1")];

    // Act
    const running = buildThinkingGraph(events);
    const done = buildThinkingGraph([
      ...events,
      observation("o1", "a1", "ExecuteBashObservation", { exit_code: 0 }),
    ]);

    // Assert
    expect(running.nodes.map((n) => n.kind)).toEqual(["goal", "tool"]);
    expect(running.nodes[1].status).toBe("running");
    expect(running.edges).toEqual([
      expect.objectContaining({ source: "u1", target: "a1", active: true }),
    ]);
    expect(done.nodes[1].status).toBe("done");
    expect(done.edges[0].active).toBe(false);
  });

  it("lifts an action's thought above the line and threads the path through it", () => {
    const events = [
      userMessage("u1", "go"),
      action(
        "a1",
        "ExecuteBashAction",
        { command: "ls" },
        { thought: [{ type: "text", text: "First,\n look around" }] },
      ),
    ];

    const graph = buildThinkingGraph(events);

    const thought = graph.nodes.find((n) => n.kind === "thought")!;
    expect(thought.label).toBe("First, look around");
    expect(thought.y).toBeLessThan(0);
    expect(graph.edges.map((e) => [e.source, e.target])).toEqual([
      ["u1", "a1:thought"],
      ["a1:thought", "a1"],
    ]);
  });

  it("splits parallel sub-agent tasks into their own lanes and joins them back", () => {
    const task = (id: string, type: string) =>
      action(
        id,
        "TaskAction",
        { subagent_type: type, prompt: `do ${type}` },
        { llm_response_id: "resp-shared" },
      );
    const events = [
      userMessage("u1", "go"),
      task("t1", "researcher"),
      task("t2", "tester"),
      observation("r1", "t1", "TaskObservation", { status: "completed" }),
      observation("r2", "t2", "TaskObservation", { status: "completed" }),
      action("f1", "FinishAction", { message: "All done" }),
    ];

    const graph = buildThinkingGraph(events);

    expect(graph.lanes).toEqual(["researcher", "tester"]);
    const fork = graph.nodes.filter((n) => n.kind === "fork");
    expect(fork).toHaveLength(1);
    expect(
      graph.nodes.filter((n) => n.kind === "agent").map((n) => n.lane),
    ).toEqual([1, 2]);
    const joins = graph.edges.filter((e) => e.target === "f1");
    expect(joins.map((e) => e.source).sort()).toEqual([
      "r1:result",
      "r2:result",
    ]);
    expect(graph.isFinished).toBe(true);
  });

  it("folds a long run of finished same-kind steps into one expandable cluster", () => {
    const steps = Array.from({ length: CLUSTER_MIN }, (_, i) => `b${i}`);
    const events = [
      userMessage("u1", "go"),
      ...steps.flatMap((id) => [
        bash(id),
        observation(`o-${id}`, id, "ExecuteBashObservation", { exit_code: 0 }),
      ]),
      action("f1", "FinishAction", { message: "ok" }),
    ];

    const folded = buildThinkingGraph(events);
    const cluster = folded.nodes.find((n) => n.kind === "cluster")!;
    const expanded = buildThinkingGraph(events, new Set([cluster.id]));

    expect(cluster.count).toBe(CLUSTER_MIN);
    expect(folded.nodes.map((n) => n.kind)).toEqual([
      "goal",
      "cluster",
      "finish",
    ]);
    expect(expanded.nodes.filter((n) => n.kind === "tool")).toHaveLength(
      CLUSTER_MIN,
    );
  });

  it("marks a failed command as an error", () => {
    const graph = buildThinkingGraph([
      bash("a1"),
      observation("o1", "a1", "ExecuteBashObservation", { exit_code: 2 }),
    ]);

    expect(graph.nodes[0].status).toBe("error");
  });
});
