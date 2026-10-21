import { describe, expect, it } from "vitest";
import { cleanLabel, parseMermaid } from "#/lib/kt-video/mermaid-parse";

describe("parseMermaid", () => {
  it("reads a flowchart with shapes, labelled edges, chains and subgraphs", () => {
    const parsed = parseMermaid(`graph LR
  subgraph api [API layer]
    Router[/Router/] -->|parses| Handler(Request handler)
  end
  Handler --> Store[(Database)] --> Cache{{Cache}}
  Router -. "retry" .-> Handler
  style Router fill:#fff
`);

    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe("flowchart");
    expect(parsed?.direction).toBe("RIGHT");
    expect(parsed?.nodes.map((n) => n.id)).toEqual([
      "Router",
      "Handler",
      "Store",
      "Cache",
    ]);
    expect(parsed?.nodes.find((n) => n.id === "Store")).toMatchObject({
      label: "Database",
      shape: "cylinder",
    });
    expect(parsed?.nodes.find((n) => n.id === "Router")?.group).toBe("api");
    expect(parsed?.groups).toEqual([{ id: "api", label: "API layer" }]);
    expect(parsed?.edges).toEqual([
      expect.objectContaining({
        from: "Router",
        to: "Handler",
        label: "parses",
      }),
      expect.objectContaining({ from: "Handler", to: "Store", style: "solid" }),
      expect.objectContaining({ from: "Store", to: "Cache" }),
      expect.objectContaining({
        from: "Router",
        to: "Handler",
        label: "retry",
        style: "dotted",
      }),
    ]);
  });

  it("fans `A & B --> C` out into one edge per source", () => {
    const parsed = parseMermaid("flowchart TD\n  A & B --> C");

    expect(parsed?.edges.map((e) => `${e.from}>${e.to}`)).toEqual([
      "A>C",
      "B>C",
    ]);
  });

  it("reads a sequence diagram with participants, blocks and reply arrows", () => {
    const parsed = parseMermaid(`sequenceDiagram
  participant U as User
  participant S as Server
  U->>S: GET /items
  loop retry
    S-->>U: 503
  end
  S-->>U: 200 OK
`);

    expect(parsed?.kind).toBe("sequence");
    expect(parsed?.nodes).toEqual([
      { id: "U", label: "User", shape: "rect" },
      { id: "S", label: "Server", shape: "rect" },
    ]);
    expect(parsed?.messages).toHaveLength(3);
    expect(parsed?.messages[1]).toMatchObject({
      from: "S",
      to: "U",
      text: "503",
      style: "dotted",
      block: "loop retry",
    });
    expect(parsed?.messages[2].block).toBeUndefined();
  });

  it("reads a class diagram and points inheritance at the parent", () => {
    const parsed = parseMermaid(`classDiagram
  class Animal {
    +String name
    +speak()
  }
  Animal <|-- Dog
  Dog --> Collar : wears
`);

    expect(parsed?.kind).toBe("class");
    expect(parsed?.nodes.map((n) => n.id)).toEqual(["Animal", "Dog", "Collar"]);
    expect(parsed?.nodes[0].label).toContain("String name");
    expect(parsed?.edges[0]).toMatchObject({ from: "Dog", to: "Animal" });
    expect(parsed?.edges[1]).toMatchObject({
      from: "Dog",
      to: "Collar",
      label: "wears",
    });
  });

  it("maps a state diagram onto the flowchart model", () => {
    const parsed = parseMermaid(`stateDiagram-v2
  [*] --> Idle
  Idle --> Running : start
  Running --> [*]
`);

    expect(parsed?.kind).toBe("flowchart");
    expect(parsed?.nodes.map((n) => n.id)).toEqual([
      "start_end",
      "Idle",
      "Running",
    ]);
    expect(parsed?.edges[1]).toMatchObject({
      from: "Idle",
      to: "Running",
      label: "start",
    });
  });

  it("returns null for diagram types it cannot animate and for single-node graphs", () => {
    expect(parseMermaid('pie title Pets\n  "Dogs" : 3')).toBeNull();
    expect(parseMermaid("graph TD\n  Only[One node]")).toBeNull();
    expect(parseMermaid("")).toBeNull();
  });

  it("cleans quoted labels, line breaks and HTML out of labels", () => {
    expect(cleanLabel('"Order <br/> service"')).toBe("Order\nservice");
    expect(cleanLabel("**bold** `code` &amp; <b>x</b>")).toBe("bold code & x");
  });
});
