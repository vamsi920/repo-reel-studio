/**
 * Small Mermaid parser for the diagram types DeepWiki actually emits
 * (flowchart/graph, sequenceDiagram, classDiagram, stateDiagram), producing
 * a plain node/edge model the tutorial renderer can lay out and animate.
 *
 * This is deliberately a parser, not a renderer: it reads the *real* diagram
 * source exactly as DeepWiki generated it and never adds or renames a node.
 * Anything it can't understand returns `null`, and the caller falls back to
 * Mermaid's own static SVG for that diagram.
 */

import type {
  DiagramEdge,
  DiagramGroup,
  DiagramKind,
  DiagramNode,
  SequenceMessage,
} from "./tutorial-types";

export interface ParsedDiagram {
  kind: DiagramKind;
  direction: "DOWN" | "RIGHT";
  nodes: Omit<DiagramNode, "x" | "y" | "width" | "height">[];
  edges: Omit<DiagramEdge, "points">[];
  groups: Omit<DiagramGroup, "x" | "y" | "width" | "height">[];
  messages: SequenceMessage[];
}

type Shape = DiagramNode["shape"];

const SHAPE_OPENERS: { open: string; close: string; shape: Shape }[] = [
  { open: "((", close: "))", shape: "circle" },
  { open: "([", close: "])", shape: "round" },
  { open: "[(", close: ")]", shape: "cylinder" },
  { open: "[[", close: "]]", shape: "rect" },
  { open: "{{", close: "}}", shape: "hexagon" },
  { open: "[/", close: "/]", shape: "rect" },
  { open: "[\\", close: "\\]", shape: "rect" },
  { open: "[", close: "]", shape: "rect" },
  { open: "(", close: ")", shape: "round" },
  { open: "{", close: "}", shape: "diamond" },
  { open: ">", close: "]", shape: "rect" },
];

export function cleanLabel(raw: string): string {
  let text = raw.trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1);
  }
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/#quot;/g, '"')
    .replace(/<[^>]+>/g, "")
    .replace(/\\n/g, "\n");
  // Mermaid markdown-ish emphasis inside labels
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function stripComments(source: string): string[] {
  return source
    .split("\n")
    .map((line) => line.replace(/%%.*$/, "").trimEnd())
    .filter((line) => line.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Flowchart / graph / stateDiagram
// ---------------------------------------------------------------------------

const ID_RE = /^[A-Za-z0-9_$][A-Za-z0-9_$.-]*/;
const ARROW_TEXT_RE =
  /^\s*(--|==|-\.)\s+([^\n]*?)\s+(-->|---|==>|===|\.->|\.-)\s*/;
const ARROW_RE =
  /^\s*(<)?(-{2,}|={2,}|-\.+-?|\.-+)(>|o|x)?\s*(?:\|([^|]*)\|)?\s*/;

interface FlowchartScan {
  direction: "DOWN" | "RIGHT";
  nodes: Map<string, Omit<DiagramNode, "x" | "y" | "width" | "height">>;
  edges: Omit<DiagramEdge, "points">[];
  groups: Omit<DiagramGroup, "x" | "y" | "width" | "height">[];
}

function readNode(
  stmt: string,
  pos: number,
  scan: FlowchartScan,
  group: string | undefined,
): { id: string; next: number } | null {
  const rest = stmt.slice(pos);
  const idMatch = ID_RE.exec(rest);
  if (!idMatch) return null;
  let id = idMatch[0];
  let next = pos + id.length;
  // `A:::className` — class annotation glued to the id.
  const classIdx = id.indexOf(":::");
  if (classIdx >= 0) id = id.slice(0, classIdx);
  if (id.endsWith(".")) id = id.slice(0, -1);
  if (!id) return null;

  let label = id;
  let shape: Shape = "rect";
  const afterId = stmt.slice(next);
  const opener = SHAPE_OPENERS.find((o) => afterId.startsWith(o.open));
  if (opener) {
    const closeIdx = afterId.indexOf(opener.close, opener.open.length);
    if (closeIdx >= 0) {
      label = cleanLabel(afterId.slice(opener.open.length, closeIdx));
      shape = opener.shape;
      next += closeIdx + opener.close.length;
    }
  }
  const classTail = /^:::[\w-]+/.exec(stmt.slice(next));
  if (classTail) next += classTail[0].length;

  const existing = scan.nodes.get(id);
  if (!existing) {
    scan.nodes.set(id, { id, label: label || id, shape, group });
  } else {
    if (opener) {
      existing.label = label || id;
      existing.shape = shape;
    }
    if (group && !existing.group) existing.group = group;
  }
  return { id, next };
}

function readEdge(
  stmt: string,
  pos: number,
): { label?: string; style: DiagramEdge["style"]; next: number } | null {
  const rest = stmt.slice(pos);
  const textForm = ARROW_TEXT_RE.exec(rest);
  if (textForm) {
    const marker = textForm[1] + textForm[3];
    return {
      label: cleanLabel(textForm[2]),
      style: marker.includes(".")
        ? "dotted"
        : marker.includes("=")
          ? "thick"
          : "solid",
      next: pos + textForm[0].length,
    };
  }
  const plain = ARROW_RE.exec(rest);
  if (!plain) return null;
  const body = plain[2];
  return {
    label: plain[4] !== undefined ? cleanLabel(plain[4]) : undefined,
    style: body.includes(".")
      ? "dotted"
      : body.includes("=")
        ? "thick"
        : "solid",
    next: pos + plain[0].length,
  };
}

function parseFlowStatement(
  stmt: string,
  scan: FlowchartScan,
  group: string | undefined,
): void {
  let pos = 0;
  let previous: string[] = [];
  let current: string[] = [];
  let pendingEdge: { label?: string; style: DiagramEdge["style"] } | null =
    null;

  const flush = () => {
    if (pendingEdge && previous.length && current.length) {
      for (const from of previous) {
        for (const to of current) {
          scan.edges.push({
            id: `e${scan.edges.length}`,
            from,
            to,
            label: pendingEdge.label || undefined,
            style: pendingEdge.style,
          });
        }
      }
    }
  };

  while (pos < stmt.length) {
    while (pos < stmt.length && /\s/.test(stmt[pos])) pos += 1;
    if (pos >= stmt.length) break;
    const node = readNode(stmt, pos, scan, group);
    if (!node) break;
    current.push(node.id);
    pos = node.next;
    while (pos < stmt.length && /\s/.test(stmt[pos])) pos += 1;
    if (stmt[pos] === "&") {
      pos += 1;
      continue;
    }
    const edge = readEdge(stmt, pos);
    if (!edge) break;
    flush();
    previous = current;
    current = [];
    pendingEdge = { label: edge.label, style: edge.style };
    pos = edge.next;
  }
  flush();
}

const FLOW_IGNORED =
  /^(style|classDef|class|linkStyle|click|direction|accTitle|accDescr|title)\b/i;

function parseFlowchart(
  lines: string[],
  kind: "flowchart" | "state",
): ParsedDiagram | null {
  const header = lines[0] ?? "";
  const dirMatch = /\b(TD|TB|LR|RL|BT)\b/.exec(header);
  const direction: "DOWN" | "RIGHT" =
    dirMatch && (dirMatch[1] === "LR" || dirMatch[1] === "RL")
      ? "RIGHT"
      : "DOWN";

  const scan: FlowchartScan = {
    direction,
    nodes: new Map(),
    edges: [],
    groups: [],
  };
  const groupStack: string[] = [];

  for (const raw of lines.slice(1)) {
    for (const stmtRaw of raw.split(";")) {
      const stmt = stmtRaw.trim();
      if (!stmt) continue;
      const sub = /^subgraph\s+(.+)$/i.exec(stmt);
      if (sub) {
        const spec = sub[1].trim();
        const titled = /^([^\s[]+)\s*\[(.+)\]$/.exec(spec);
        const id = titled ? titled[1] : spec.replace(/\s+/g, "_");
        const label = cleanLabel(titled ? titled[2] : spec);
        if (!scan.groups.some((g) => g.id === id)) {
          scan.groups.push({ id, label });
        }
        groupStack.push(id);
        continue;
      }
      if (/^end$/i.test(stmt)) {
        groupStack.pop();
        continue;
      }
      if (FLOW_IGNORED.test(stmt)) continue;
      if (kind === "state") {
        // `A : description` names a state without an edge.
        const desc = /^([A-Za-z0-9_\-[\]*]+)\s*:\s*(.+)$/.exec(stmt);
        if (desc && !stmt.includes("-->")) {
          const id = desc[1].replace(/\[\*\]/g, "start_end");
          const existing = scan.nodes.get(id);
          if (existing) existing.label = cleanLabel(desc[2]);
          else
            scan.nodes.set(id, {
              id,
              label: cleanLabel(desc[2]),
              shape: "round",
              group: groupStack[groupStack.length - 1],
            });
          continue;
        }
        // `A --> B : label` → `A -->|label| B`
        const transition = /^(.+?)\s*-->\s*(.+?)(?:\s*:\s*(.+))?$/.exec(stmt);
        if (transition) {
          const [, from, to, label] = transition;
          const norm = (s: string) =>
            s.trim() === "[*]" ? "start_end((●))" : s.trim();
          parseFlowStatement(
            `${norm(from)} -->${label ? `|${label.trim()}|` : ""} ${norm(to)}`,
            scan,
            groupStack[groupStack.length - 1],
          );
          continue;
        }
      }
      parseFlowStatement(stmt, scan, groupStack[groupStack.length - 1]);
    }
  }

  const nodes = [...scan.nodes.values()];
  if (nodes.length < 2) return null;
  return {
    kind: "flowchart",
    direction,
    nodes,
    edges: scan.edges,
    groups: scan.groups.filter((g) => nodes.some((n) => n.group === g.id)),
    messages: [],
  };
}

// ---------------------------------------------------------------------------
// Sequence diagram
// ---------------------------------------------------------------------------

const MESSAGE_RE =
  /^(.+?)\s*(-->>|->>|-->|->|--\)|-\)|--x|-x)\s*([^:]+?)\s*:\s*(.*)$/;

function parseSequence(lines: string[]): ParsedDiagram | null {
  const participants = new Map<string, string>();
  const messages: SequenceMessage[] = [];
  const blockStack: string[] = [];

  const ensure = (rawId: string, label?: string) => {
    const id = rawId.trim().replace(/^"|"$/g, "");
    if (!id) return "";
    if (!participants.has(id)) participants.set(id, cleanLabel(label ?? id));
    else if (label) participants.set(id, cleanLabel(label));
    return id;
  };

  for (const raw of lines.slice(1)) {
    const stmt = raw.trim();
    const participant =
      /^(?:participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/i.exec(stmt);
    if (participant) {
      ensure(participant[1], participant[2]);
      continue;
    }
    const block = /^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i.exec(
      stmt,
    );
    if (block) {
      blockStack.push(cleanLabel(`${block[1]} ${block[2]}`.trim()));
      continue;
    }
    if (/^(else|and|option)\b/i.test(stmt)) {
      blockStack[blockStack.length - 1] = cleanLabel(stmt);
      continue;
    }
    if (/^end$/i.test(stmt)) {
      blockStack.pop();
      continue;
    }
    if (
      /^(note|activate|deactivate|autonumber|title|accTitle|accDescr|box|link|links|properties|details)\b/i.test(
        stmt,
      )
    ) {
      continue;
    }
    const message = MESSAGE_RE.exec(stmt);
    if (!message) continue;
    const from = ensure(message[1].replace(/\+|-$/g, ""));
    const to = ensure(message[3].replace(/^\+|^-/g, ""));
    if (!from || !to) continue;
    messages.push({
      index: messages.length,
      from,
      to,
      text: cleanLabel(message[4]),
      style: message[2].startsWith("--") ? "dotted" : "solid",
      block: blockStack[blockStack.length - 1],
    });
  }

  if (participants.size < 2 || messages.length === 0) return null;
  return {
    kind: "sequence",
    direction: "RIGHT",
    nodes: [...participants.entries()].map(([id, label]) => ({
      id,
      label,
      shape: "rect" as const,
    })),
    edges: [],
    groups: [],
    messages,
  };
}

// ---------------------------------------------------------------------------
// Class diagram
// ---------------------------------------------------------------------------

const CLASS_REL_RE =
  /^([\w.]+)(?:\s+"[^"]*")?\s*(<\|--|<\|\.\.|\*--|o--|-->|\.\.>|\.\.\|>|--\*|--o|--|\.\.|<--|<\.\.)\s*(?:"[^"]*"\s+)?([\w.]+)(?:\s*:\s*(.*))?$/;

function parseClass(lines: string[]): ParsedDiagram | null {
  const nodes = new Map<
    string,
    Omit<DiagramNode, "x" | "y" | "width" | "height">
  >();
  const edges: Omit<DiagramEdge, "points">[] = [];
  let openClass: string | null = null;
  const members = new Map<string, string[]>();

  const ensure = (id: string, label?: string) => {
    if (!nodes.has(id))
      nodes.set(id, { id, label: label ?? id, shape: "rect" });
    else if (label) nodes.get(id)!.label = label;
  };

  for (const raw of lines.slice(1)) {
    const stmt = raw.trim();
    if (openClass) {
      if (stmt === "}") {
        openClass = null;
        continue;
      }
      const list = members.get(openClass) ?? [];
      if (list.length < 4 && !/^<</.test(stmt))
        list.push(stmt.replace(/^[+\-#~]\s*/, ""));
      members.set(openClass, list);
      continue;
    }
    const classDecl = /^class\s+([\w.]+)(?:\["([^"]*)"\])?\s*(\{)?\s*$/.exec(
      stmt,
    );
    if (classDecl) {
      ensure(classDecl[1], classDecl[2]);
      if (classDecl[3]) openClass = classDecl[1];
      continue;
    }
    const memberLine = /^([\w.]+)\s*:\s*(.+)$/.exec(stmt);
    if (memberLine && !/[<>-]/.test(memberLine[1])) {
      ensure(memberLine[1]);
      const list = members.get(memberLine[1]) ?? [];
      if (list.length < 4) list.push(memberLine[2].replace(/^[+\-#~]\s*/, ""));
      members.set(memberLine[1], list);
      continue;
    }
    const rel = CLASS_REL_RE.exec(stmt);
    if (rel) {
      const [, a, op, b, label] = rel;
      ensure(a);
      ensure(b);
      // Mermaid draws `A <|-- B` as B inheriting from A; keep the arrow
      // pointing at the head side so the animation flows toward it.
      const headOnLeft = op.startsWith("<");
      edges.push({
        id: `e${edges.length}`,
        from: headOnLeft ? b : a,
        to: headOnLeft ? a : b,
        label: label ? cleanLabel(label) : undefined,
        style: op.includes("..") ? "dotted" : "solid",
      });
    }
  }

  if (nodes.size < 2) return null;
  for (const [id, list] of members) {
    const node = nodes.get(id);
    if (node && list.length)
      node.label = `${node.label}\n${list.slice(0, 3).join("\n")}`;
  }
  return {
    kind: "class",
    direction: "DOWN",
    nodes: [...nodes.values()],
    edges,
    groups: [],
    messages: [],
  };
}

// ---------------------------------------------------------------------------

export function parseMermaid(source: string): ParsedDiagram | null {
  const lines = stripComments(source);
  if (!lines.length) return null;
  const header = lines[0].trim().toLowerCase();
  try {
    if (/^(flowchart|graph)\b/.test(header))
      return parseFlowchart(lines, "flowchart");
    if (/^statediagram/.test(header)) return parseFlowchart(lines, "state");
    if (/^sequencediagram/.test(header)) return parseSequence(lines);
    if (/^classdiagram/.test(header)) return parseClass(lines);
  } catch {
    return null;
  }
  return null;
}
