/**
 * Tutorial script generation.
 *
 * Two LLM passes produce a long-form, tutorial-style script: a *plan* pass
 * decides the chapters (what to teach, in which order, from which real
 * regions and diagrams), then one *write* pass per chapter produces the
 * narrated beats with the real code of that chapter's regions in context.
 * Every visual reference the model returns is validated against the region
 * index / diagram model / file list before it is accepted, so the model can
 * only choose *which* real thing to show and what to *say* about it.
 *
 * When no LLM is reachable, `buildDeterministicScript` produces a complete
 * (if plainer) tutorial from the same real inputs, so Watch KT always works.
 */
import type { CodeRegion } from "./code-regions";
import { numberedExcerpt } from "./code-regions";
import { revealOrder } from "./diagram-layout";
import type {
  CardItem,
  FlowStep,
  TutorialBeat,
  TutorialChapter,
  TutorialChapterKind,
  TutorialDiagram,
  TutorialVisual,
} from "./tutorial-types";
import { countWords } from "./tutorial-types";

export interface ScriptContext {
  repoName: string;
  pageTitle: string;
  pageDescription: string;
  pageMarkdown: string;
  repoSummary?: string;
  siblingPageTitles?: string[];
  files: Record<string, string>;
  fileTree: string[];
  regions: CodeRegion[];
  diagrams: Record<string, TutorialDiagram>;
  conceptHops?: FlowStep[];
}

export type ChatFn = (prompt: string) => Promise<string>;

export interface ScriptProgress {
  stage: "planning" | "writing";
  completed: number;
  total: number;
}

export interface GeneratedScript {
  chapters: TutorialChapter[];
  source: "llm" | "deterministic";
  wordCount: number;
}

/** 8 minutes at a natural ~145 words per minute. */
export const MIN_TUTORIAL_WORDS = 1160;
const TARGET_TUTORIAL_WORDS = 1650;
const MAX_BEAT_WORDS = 70;
const MIN_BEAT_WORDS = 5;
const MAX_CODE_WINDOW = 46;
const PAGE_MARKDOWN_CAP = 6000;
const CHAPTER_CODE_CAP = 12000;
const PLAN_CODE_CAP = 6000;
const WRITE_CONCURRENCY = 8;

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

function cap(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated]`;
}

function regionLine(r: CodeRegion): string {
  const what = r.symbol
    ? `${r.kind} ${r.symbol}`
    : r.kind === "head"
      ? "file header / imports"
      : "section";
  return `${r.id}  ${r.path}:${r.startLine}-${r.endLine}  ${what}  ⟶ ${cap(r.preview, 90)}`;
}

function diagramSummary(d: TutorialDiagram): string {
  if (d.kind === "sequence") {
    const participants = d.nodes
      .map((n) => `${n.id} ("${n.label}")`)
      .join(", ");
    const messages = d.messages
      .map((m) => `  M${m.index}: ${m.from} → ${m.to}: ${m.text}`)
      .join("\n");
    return `Diagram ${d.id} (sequence). Participants: ${participants}\nMessages (reference by M-index):\n${messages}`;
  }
  const nodes = d.nodes
    .map(
      (n) =>
        `  ${n.id} = "${n.label.replace(/\n/g, " / ")}"${n.group ? ` [in ${n.group}]` : ""}`,
    )
    .join("\n");
  const edges = d.edges
    .map((e) => `  ${e.from} → ${e.to}${e.label ? ` (${e.label})` : ""}`)
    .join("\n");
  const groups = d.groups.length
    ? `\nGroups: ${d.groups.map((g) => `${g.id}="${g.label}"`).join(", ")}`
    : "";
  return `Diagram ${d.id} (${d.kind}). Nodes (reference by id):\n${nodes}\nEdges:\n${edges}${groups}`;
}

const STYLE_RULES = `VOICE: You are a senior engineer recording an onboarding screencast for a new teammate. Speak naturally, in the first person plural ("let's open…", "notice how…"). Explain *why* before *how*. Connect every code detail back to the bigger picture. Use concrete names from the code. No bullet lists, no markdown, no headings, no code fences, no emoji — the narration is spoken aloud by a voice. Say identifiers naturally (e.g. "handleRequest", "the config module"). Never read file contents line by line; interpret them. Never invent files, functions, options or behaviour that are not in the material below — if something is unknown, say so or skip it.`;

// ---------------------------------------------------------------------------
// Plan pass
// ---------------------------------------------------------------------------

interface PlannedChapter {
  id: string;
  kind: TutorialChapterKind;
  title: string;
  goal: string;
  regions: string[];
  diagram?: string;
  words: number;
}

function buildPlanPrompt(ctx: ScriptContext): string {
  const regionList = ctx.regions.map(regionLine).join("\n");
  const diagrams = Object.values(ctx.diagrams).map(diagramSummary).join("\n\n");
  const files = ctx.fileTree.join("\n");
  const peek = ctx.regions
    .filter((r) => r.symbol)
    .slice(0, 6)
    .map(
      (r) =>
        `${r.id} ${r.path}:${r.startLine}-${r.endLine}\n${numberedExcerpt(ctx.files[r.path] ?? "", r.startLine, Math.min(r.endLine, r.startLine + 14))}`,
    )
    .join("\n\n");

  return `You are planning a ${Math.round(TARGET_TUTORIAL_WORDS / 145)}-minute video tutorial titled "${ctx.pageTitle}" about the repository ${ctx.repoName}. The audience is a developer who joined the team this week and has never seen this code. This planning answer is NOT a chat reply: ignore any instruction to be brief — produce the complete plan below.

${ctx.repoSummary ? `REPOSITORY SUMMARY:\n${cap(ctx.repoSummary, 800)}\n\n` : ""}PAGE DESCRIPTION:\n${cap(ctx.pageDescription, 600)}

PAGE DOCUMENTATION (ground truth written from this exact commit):
${cap(ctx.pageMarkdown, PAGE_MARKDOWN_CAP)}

FILES IN SCOPE:
${files}

CODE REGIONS (the only code the video can show; reference them by id):
${regionList}

${diagrams ? `DIAGRAMS (the only diagrams the video can animate):\n${diagrams}\n` : "DIAGRAMS: none.\n"}
A FEW REGION PREVIEWS:
${cap(peek, PLAN_CODE_CAP)}

Design 7 to 9 chapters that together teach this page like a great tutorial: start with an "intro" (what this part of the system is for, what the viewer will be able to do afterwards), then a "map" chapter (where things live in the repo), ${diagrams ? 'then an "architecture" chapter that walks the diagram node by node, ' : ""}then 3 to 5 "deep-dive" chapters each focused on 1-3 regions that matter most (the real entry points, the core logic, the data shapes, the error paths), ${ctx.conceptHops?.length ? 'a "flow" chapter following a real cross-file call chain, ' : diagrams ? 'optionally a "flow" chapter that traces one concrete request/path through the diagram and code, ' : ""}and finish with a "recap" chapter (key takeaways + what to read next). Order deep-dives the way a reader would naturally discover the code (entry point first, then what it calls). Allocate a word budget per chapter so the total is about ${TARGET_TUTORIAL_WORDS} spoken words (intro ~150, map ~140, architecture ~260, each deep-dive 220-300, flow ~220, recap ~150).

Respond with ONLY this JSON (no prose, no fences):
{"chapters":[{"id":"c1","kind":"intro|map|architecture|deep-dive|flow|recap","title":"short chapter title","goal":"one sentence: what the viewer understands after this chapter","regions":["R3","R7"],"diagram":"diagram id or null","words":240}]}`;
}

function parseJsonObject(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("no JSON object in response");
  const candidate = cleaned.slice(first, last + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    // Common model slips: trailing commas, smart quotes.
    const repaired = candidate
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[“”]/g, '"');
    return JSON.parse(repaired);
  }
}

const CHAPTER_KINDS: TutorialChapterKind[] = [
  "intro",
  "map",
  "architecture",
  "deep-dive",
  "flow",
  "recap",
];

function normalizePlan(raw: unknown, ctx: ScriptContext): PlannedChapter[] {
  const obj = raw as { chapters?: unknown[] };
  const list = Array.isArray(obj?.chapters) ? obj.chapters : [];
  const regionIds = new Set(ctx.regions.map((r) => r.id));
  const chapters: PlannedChapter[] = [];
  list.forEach((entry, i) => {
    const c = entry as Record<string, unknown>;
    const kind = CHAPTER_KINDS.includes(c.kind as TutorialChapterKind)
      ? (c.kind as TutorialChapterKind)
      : "deep-dive";
    const title =
      typeof c.title === "string" && c.title.trim()
        ? c.title.trim()
        : `Chapter ${i + 1}`;
    const regions = (Array.isArray(c.regions) ? c.regions : [])
      .map((r) => String(r).trim())
      .filter((r) => regionIds.has(r));
    const diagram =
      typeof c.diagram === "string" && ctx.diagrams[c.diagram]
        ? c.diagram
        : undefined;
    chapters.push({
      id: `c${i + 1}`,
      kind,
      title: cap(title, 70),
      goal: typeof c.goal === "string" ? cap(c.goal.trim(), 180) : "",
      regions,
      diagram,
      words: Math.max(120, Math.min(360, Number(c.words) || 220)),
    });
  });
  if (!chapters.length) throw new Error("plan had no chapters");
  if (chapters[0].kind !== "intro") {
    chapters.unshift({
      id: "c0",
      kind: "intro",
      title: "Welcome",
      goal: "",
      regions: [],
      words: 150,
    });
  }
  if (chapters[chapters.length - 1].kind !== "recap") {
    chapters.push({
      id: `c${chapters.length + 1}`,
      kind: "recap",
      title: "Recap",
      goal: "",
      regions: [],
      words: 150,
    });
  }
  // Keep the total budget at least the minimum, scaling up proportionally.
  const total = chapters.reduce((s, c) => s + c.words, 0);
  if (total < TARGET_TUTORIAL_WORDS) {
    const factor = TARGET_TUTORIAL_WORDS / total;
    return chapters.map((c) => ({ ...c, words: Math.round(c.words * factor) }));
  }
  return chapters;
}

// ---------------------------------------------------------------------------
// Write pass
// ---------------------------------------------------------------------------

function chapterKindGuidance(kind: TutorialChapterKind): string {
  switch (kind) {
    case "intro":
      return `Open with a "title" visual (heading = the tutorial title, bullets = 3-4 things the viewer will learn), then 1-2 beats that explain the problem this part of the system solves and how it fits the whole repository. If a diagram exists you may end on it with no nodes focused as a teaser.`;
    case "map":
      return `Use "tree" visuals: spotlight 1-4 real paths per beat and explain what each directory/file is responsible for and why it is organised that way. Cover every file the plan assigned; keep moving.`;
    case "architecture":
      return `Walk the diagram with "diagram" visuals: each beat focuses 1-3 node ids (or M-indexes for a sequence diagram) and explains the responsibility of those parts and what travels along the edges between them. Progress through the diagram in the direction of the data flow. Finish with one beat that focuses nothing (the full picture) and states the one-sentence mental model.`;
    case "deep-dive":
      return `Use "code" visuals on the assigned regions. Start by opening the region as a whole (lines = the region range) and say what it is for; then zoom with "focus" on 3-8 line slices that carry the meaning (the condition, the call, the return, the data shape) and explain each — what it does, why it is there, what would break without it. Add a "callout" of at most 8 words per beat (e.g. "validates input before anything else"). You may use a "title" visual once for a key concept definition if it helps.`;
    case "flow":
      return `Use "flow" visuals: give the ordered steps once (2-5 regions, in call order) and advance "active" by one per beat, narrating what each step receives, decides and hands on. Include a beat that describes what the caller sees at the end.`;
    case "recap":
      return `Use a "cards" visual with 3-5 takeaways (title + one-sentence body + the path it lives in) revealed one per beat, then a final "title" beat with heading "What to try next" and 2-3 bullets with concrete next actions in this repository.`;
    default:
      return "";
  }
}

function buildWritePrompt(
  ctx: ScriptContext,
  plan: PlannedChapter[],
  chapter: PlannedChapter,
  extraWords = 0,
): string {
  const regions = chapter.regions
    .map((id) => ctx.regions.find((r) => r.id === id))
    .filter((r): r is CodeRegion => Boolean(r));
  let code = regions
    .map(
      (r) =>
        `REGION ${r.id}  ${r.path}  lines ${r.startLine}-${r.endLine}${r.symbol ? `  (${r.kind} ${r.symbol})` : ""}\n${numberedExcerpt(ctx.files[r.path] ?? "", r.startLine, r.endLine)}`,
    )
    .join("\n\n");
  code = cap(code, CHAPTER_CODE_CAP);

  const diagram = chapter.diagram ? ctx.diagrams[chapter.diagram] : undefined;
  // The chapter's own regions get the full listing (and their code below);
  // the rest is a compact index so the model can still cite them.
  const own = new Set(chapter.regions);
  const allRegions = ctx.regions
    .map((r) =>
      own.has(r.id)
        ? regionLine(r)
        : `${r.id}  ${r.path}:${r.startLine}-${r.endLine}${r.symbol ? `  ${r.symbol}` : ""}`,
    )
    .join("\n");
  const outline = plan
    .map((c) => `${c.id === chapter.id ? "▶ " : "  "}${c.title} (${c.kind})`)
    .join("\n");
  const flowSteps = ctx.conceptHops?.length
    ? `\nKNOWN CROSS-FILE CALL CHAIN (real, detected from the dependency graph):\n${ctx.conceptHops.map((h, i) => `  step ${i + 1}: ${h.path}:${h.startLine}-${h.endLine}${h.symbol ? ` ${h.symbol}` : ""}`).join("\n")}\n`
    : "";
  const words = chapter.words + extraWords;

  return `You are writing chapter "${chapter.title}" of a video tutorial about ${ctx.repoName} ("${ctx.pageTitle}"). This is a screencast script, NOT a chat answer: ignore any instruction to be concise and write the full ${words}-word chapter.

${STYLE_RULES}

TUTORIAL OUTLINE (you are writing the ▶ chapter; do not repeat what other chapters cover):
${outline}

CHAPTER GOAL: ${chapter.goal || chapter.title}
CHAPTER KIND: ${chapter.kind}. ${chapterKindGuidance(chapter.kind)}
TARGET LENGTH: ${words} words of narration across ${Math.max(4, Math.round(words / 42))}-${Math.max(6, Math.round(words / 30))} beats. Each beat is 25-60 spoken words and pairs with exactly one visual.

PAGE DOCUMENTATION (ground truth; use it to explain purpose and design intent):
${cap(ctx.pageMarkdown, PAGE_MARKDOWN_CAP)}

FILES IN SCOPE (the only valid "tree" paths):
${ctx.fileTree.join("\n")}

ALL REGIONS (valid "region" ids; this chapter should mostly use its assigned ones):
${allRegions}
${flowSteps}
${diagram ? `${diagramSummary(diagram)}\n` : ""}
CODE OF THIS CHAPTER'S REGIONS (real, line-numbered — the numbers are what "lines"/"focus" refer to):
${code || "(this chapter shows no code)"}

VISUAL TYPES (use exactly these shapes):
- {"type":"code","region":"R4","lines":[12,40],"focus":[18,22],"callout":"≤8 words"}  — lines optional (defaults to the region); focus optional, must be inside lines
- {"type":"diagram","diagram":"${diagram?.id ?? "d0"}","nodes":["A","B"],"callout":"≤10 words"}  — nodes = node ids, or ["M2","M3"] message indexes for sequence diagrams; [] = whole diagram
- {"type":"tree","paths":["src/a.ts","src/b/"],"callout":"≤10 words"}
- {"type":"title","heading":"…","subtitle":"…","bullets":["…","…"]}
- {"type":"flow","steps":[{"region":"R2","label":"receives request"},{"region":"R5","label":"…"}],"active":0}
- {"type":"cards","items":[{"title":"…","body":"…","path":"src/a.ts"}],"reveal":2}

Respond with ONLY this JSON (no prose, no fences):
{"beats":[{"say":"narration for this beat","show":{…one visual…}}]}`;
}

// ---------------------------------------------------------------------------
// Validation of model output against the real material
// ---------------------------------------------------------------------------

function plainSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_#>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampRange(
  range: unknown,
  min: number,
  max: number,
): [number, number] | null {
  if (!Array.isArray(range) || range.length < 2) return null;
  const a = Math.round(Number(range[0]));
  const b = Math.round(Number(range[1]));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const start = Math.max(min, Math.min(a, b));
  const end = Math.min(max, Math.max(a, b));
  if (end < start) return null;
  return [start, end];
}

function fitCodeWindow(
  lines: [number, number],
  focus: [number, number] | null,
  fileLength: number,
): { lines: [number, number]; focus?: [number, number] } {
  let [start, end] = lines;
  if (end - start + 1 > MAX_CODE_WINDOW) {
    if (focus) {
      const centre = Math.round((focus[0] + focus[1]) / 2);
      start = Math.max(1, centre - Math.floor(MAX_CODE_WINDOW / 2));
      end = Math.min(fileLength, start + MAX_CODE_WINDOW - 1);
      start = Math.max(1, end - MAX_CODE_WINDOW + 1);
    } else {
      end = start + MAX_CODE_WINDOW - 1;
    }
  }
  const result: { lines: [number, number]; focus?: [number, number] } = {
    lines: [start, end],
  };
  if (focus) {
    const f = clampRange(focus, start, end);
    if (f) result.focus = f;
  }
  return result;
}

function findRegion(
  ctx: ScriptContext,
  ref: unknown,
  chapterRegions: string[],
): CodeRegion | null {
  const id = typeof ref === "string" ? ref.trim() : "";
  const byId = ctx.regions.find((r) => r.id === id);
  if (byId) return byId;
  const lower = id.toLowerCase();
  const bySymbol = ctx.regions.find((r) => r.symbol?.toLowerCase() === lower);
  if (bySymbol) return bySymbol;
  const byPath = ctx.regions.find((r) => r.path.toLowerCase() === lower);
  if (byPath) return byPath;
  const first = chapterRegions[0];
  return ctx.regions.find((r) => r.id === first) ?? null;
}

function matchNodeIds(diagram: TutorialDiagram, refs: unknown): string[] {
  if (!Array.isArray(refs)) return [];
  const out: string[] = [];
  for (const raw of refs) {
    const ref = String(raw).trim();
    if (!ref) continue;
    if (diagram.kind === "sequence") {
      const m = /^M?(\d+)$/i.exec(ref);
      if (m && diagram.messages[Number(m[1])]) {
        out.push(String(Number(m[1])));
        continue;
      }
      const participant = diagram.nodes.find(
        (n) => n.id === ref || n.label.toLowerCase() === ref.toLowerCase(),
      );
      if (participant) {
        diagram.messages
          .filter(
            (msg) => msg.from === participant.id || msg.to === participant.id,
          )
          .slice(0, 2)
          .forEach((msg) => out.push(String(msg.index)));
      }
      continue;
    }
    const lower = ref.toLowerCase();
    const node =
      diagram.nodes.find((n) => n.id === ref) ??
      diagram.nodes.find((n) => n.id.toLowerCase() === lower) ??
      diagram.nodes.find((n) => n.label.toLowerCase() === lower) ??
      diagram.nodes.find(
        (n) => n.label.toLowerCase().includes(lower) && lower.length > 3,
      );
    if (node) out.push(node.id);
  }
  return [...new Set(out)];
}

function matchPaths(ctx: ScriptContext, refs: unknown): string[] {
  if (!Array.isArray(refs)) return [];
  const out: string[] = [];
  for (const raw of refs) {
    const ref = String(raw).trim().replace(/^\.\//, "");
    if (!ref) continue;
    if (ctx.fileTree.includes(ref)) {
      out.push(ref);
      continue;
    }
    const dir = ref.replace(/\/$/, "");
    const inDir = ctx.fileTree.filter((p) => p.startsWith(`${dir}/`));
    if (inDir.length) {
      out.push(...inDir.slice(0, 6));
      continue;
    }
    const base = ref.split("/").pop()?.toLowerCase();
    const byBase = ctx.fileTree.find(
      (p) => p.split("/").pop()?.toLowerCase() === base,
    );
    if (byBase) out.push(byBase);
  }
  return [...new Set(out)];
}

function stringList(
  value: unknown,
  maxItems: number,
  maxLen: number,
): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => plainSpeech(String(v)))
    .filter(Boolean)
    .slice(0, maxItems)
    .map((s) => cap(s, maxLen));
}

export function validateVisual(
  show: unknown,
  ctx: ScriptContext,
  chapter: { kind: TutorialChapterKind; regions: string[]; diagram?: string },
): TutorialVisual | null {
  const s = (show ?? {}) as Record<string, unknown>;
  const type = String(s.type ?? "").toLowerCase();
  const callout =
    typeof s.callout === "string" && s.callout.trim()
      ? cap(plainSpeech(s.callout), 60)
      : undefined;

  if (type === "code") {
    const region = findRegion(ctx, s.region, chapter.regions);
    if (!region) return null;
    const content = ctx.files[region.path];
    if (!content) return null;
    const fileLength = content.split("\n").length;
    const lines = clampRange(s.lines, 1, fileLength) ?? [
      region.startLine,
      region.endLine,
    ];
    const focus = clampRange(s.focus, 1, fileLength);
    const fitted = fitCodeWindow(lines, focus, fileLength);
    return {
      kind: "code",
      path: region.path,
      startLine: fitted.lines[0],
      endLine: fitted.lines[1],
      focus: fitted.focus,
      symbol: region.symbol,
      callout,
    };
  }
  if (type === "diagram") {
    const id =
      typeof s.diagram === "string" && ctx.diagrams[s.diagram]
        ? s.diagram
        : (chapter.diagram ?? Object.keys(ctx.diagrams)[0]);
    if (!id || !ctx.diagrams[id]) return null;
    return {
      kind: "diagram",
      diagramId: id,
      focusNodes: matchNodeIds(ctx.diagrams[id], s.nodes),
      callout,
    };
  }
  if (type === "tree") {
    const paths = matchPaths(ctx, s.paths);
    return { kind: "tree", focusPaths: paths, callout };
  }
  if (type === "title") {
    const heading =
      typeof s.heading === "string" ? cap(plainSpeech(s.heading), 80) : "";
    if (!heading) return null;
    return {
      kind: "title",
      heading,
      subtitle:
        typeof s.subtitle === "string"
          ? cap(plainSpeech(s.subtitle), 120)
          : undefined,
      bullets: stringList(s.bullets, 5, 110),
    };
  }
  if (type === "flow") {
    const steps: FlowStep[] = (Array.isArray(s.steps) ? s.steps : [])
      .map((step): FlowStep | null => {
        const st = step as Record<string, unknown>;
        const region = findRegion(ctx, st.region, []);
        if (!region) return null;
        return {
          path: region.path,
          startLine: region.startLine,
          endLine: Math.min(
            region.endLine,
            region.startLine + MAX_CODE_WINDOW - 1,
          ),
          symbol: region.symbol,
          label:
            typeof st.label === "string"
              ? cap(plainSpeech(st.label), 40)
              : undefined,
        };
      })
      .filter((st): st is FlowStep => st !== null);
    if (steps.length < 2) return null;
    const active = Math.max(
      0,
      Math.min(steps.length - 1, Math.round(Number(s.active)) || 0),
    );
    return { kind: "flow", steps, activeStep: active, callout };
  }
  if (type === "cards") {
    const items: CardItem[] = (Array.isArray(s.items) ? s.items : [])
      .map((item): CardItem | null => {
        const it = item as Record<string, unknown>;
        const title =
          typeof it.title === "string" ? cap(plainSpeech(it.title), 60) : "";
        const body =
          typeof it.body === "string" ? cap(plainSpeech(it.body), 160) : "";
        if (!title) return null;
        const path =
          typeof it.path === "string"
            ? matchPaths(ctx, [it.path])[0]
            : undefined;
        return { title, body, path };
      })
      .filter((it): it is CardItem => it !== null)
      .slice(0, 6);
    if (!items.length) return null;
    const reveal = Number(s.reveal);
    return {
      kind: "cards",
      items,
      revealCount: Number.isFinite(reveal)
        ? Math.max(1, Math.min(items.length, Math.round(reveal)))
        : undefined,
    };
  }
  return null;
}

function splitLongNarration(text: string): string[] {
  if (countWords(text) <= MAX_BEAT_WORDS) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (countWords(next) > MAX_BEAT_WORDS && current) {
      parts.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function defaultVisualFor(
  ctx: ScriptContext,
  chapter: { kind: TutorialChapterKind; regions: string[]; diagram?: string },
  previous: TutorialVisual | null,
): TutorialVisual {
  if (previous) return previous;
  const region = ctx.regions.find((r) => r.id === chapter.regions[0]);
  if (region) {
    return {
      kind: "code",
      path: region.path,
      startLine: region.startLine,
      endLine: Math.min(region.endLine, region.startLine + MAX_CODE_WINDOW - 1),
      symbol: region.symbol,
    };
  }
  const diagramId = chapter.diagram ?? Object.keys(ctx.diagrams)[0];
  if (diagramId) return { kind: "diagram", diagramId, focusNodes: [] };
  return { kind: "tree", focusPaths: ctx.fileTree.slice(0, 4) };
}

export function normalizeBeats(
  raw: unknown,
  ctx: ScriptContext,
  chapter: {
    id: string;
    kind: TutorialChapterKind;
    regions: string[];
    diagram?: string;
  },
): TutorialBeat[] {
  const obj = raw as { beats?: unknown[] };
  const list = Array.isArray(obj?.beats) ? obj.beats : [];
  const beats: TutorialBeat[] = [];
  let previous: TutorialVisual | null = null;
  list.forEach((entry) => {
    const b = entry as Record<string, unknown>;
    const say = typeof b.say === "string" ? plainSpeech(b.say) : "";
    if (countWords(say) < MIN_BEAT_WORDS) return;
    const visual =
      validateVisual(b.show, ctx, chapter) ??
      defaultVisualFor(ctx, chapter, previous);
    previous = visual;
    for (const part of splitLongNarration(say)) {
      beats.push({
        id: `${chapter.id}-b${beats.length + 1}`,
        narration: part,
        visual,
        startFrame: 0,
        durationInFrames: 0,
      });
    }
  });
  return beats;
}

// ---------------------------------------------------------------------------
// Deterministic fallback
// ---------------------------------------------------------------------------

function sentencesMentioning(
  markdown: string,
  needle: string,
  max = 2,
): string[] {
  const text = plainSpeech(
    markdown
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/^\|.*$/gm, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"),
  );
  const lower = needle.toLowerCase();
  return text
    .split(/(?<=[.!?])\s+/)
    .filter(
      (s) =>
        s.toLowerCase().includes(lower) &&
        countWords(s) >= 6 &&
        countWords(s) <= 60,
    )
    .slice(0, max);
}

function firstParagraphs(markdown: string, maxWords: number): string {
  const paragraphs = markdown
    .replace(/```[\s\S]*?```/g, "")
    .split(/\n\s*\n/)
    .map((p) =>
      plainSpeech(p.replace(/^#+\s.*$/gm, "").replace(/^\|.*$/gm, "")),
    )
    .filter((p) => countWords(p) >= 8);
  const out: string[] = [];
  let words = 0;
  for (const p of paragraphs) {
    if (words + countWords(p) > maxWords) break;
    out.push(p);
    words += countWords(p);
  }
  return out.join(" ");
}

const baseName = (p: string) => p.split("/").pop() ?? p;

function makeBeat(
  chapterId: string,
  index: number,
  narration: string,
  visual: TutorialVisual,
): TutorialBeat {
  return {
    id: `${chapterId}-b${index}`,
    narration,
    visual,
    startFrame: 0,
    durationInFrames: 0,
  };
}

export function buildDeterministicScript(ctx: ScriptContext): GeneratedScript {
  const chapters: TutorialChapter[] = [];
  const diagramIds = Object.keys(ctx.diagrams);
  const regionsBySymbol = ctx.regions.filter((r) => r.symbol);
  const filesInOrder = [...new Set(ctx.regions.map((r) => r.path))];
  const pushChapter = (
    kind: TutorialChapterKind,
    title: string,
    beats: TutorialBeat[],
    goal?: string,
  ) => {
    if (!beats.length) return;
    chapters.push({
      id: `c${chapters.length + 1}`,
      kind,
      title,
      goal,
      beats,
      startFrame: 0,
      durationInFrames: 0,
    });
  };

  // Intro
  {
    const id = "c1";
    const bullets = [
      `Where ${ctx.pageTitle} lives in the repository`,
      diagramIds.length
        ? "How its parts connect, on the real architecture diagram"
        : "How the main files relate to each other",
      `The core functions: ${
        regionsBySymbol
          .slice(0, 3)
          .map((r) => r.symbol)
          .join(", ") || "the key modules"
      }`,
      "What to read and try next",
    ];
    const beats = [
      makeBeat(
        id,
        1,
        `Welcome. In this walkthrough we'll learn how ${ctx.pageTitle} works inside ${ctx.repoName}, from where the code lives all the way down to the functions that do the real work. By the end you'll be able to find your way around this part of the system and change it with confidence.`,
        {
          kind: "title",
          heading: ctx.pageTitle,
          subtitle: ctx.repoName,
          bullets,
        },
      ),
    ];
    const intro = ctx.pageDescription || firstParagraphs(ctx.pageMarkdown, 90);
    if (intro)
      beats.push(
        makeBeat(id, 2, `Here is the big picture first. ${intro}`, {
          kind: "title",
          heading: ctx.pageTitle,
          subtitle: "The big picture",
        }),
      );
    const overview = firstParagraphs(ctx.pageMarkdown, 160);
    if (overview && overview !== intro) {
      splitLongNarration(overview).forEach((part, i) =>
        beats.push(
          makeBeat(
            id,
            3 + i,
            part,
            diagramIds[0]
              ? { kind: "diagram", diagramId: diagramIds[0], focusNodes: [] }
              : { kind: "tree", focusPaths: ctx.fileTree.slice(0, 5) },
          ),
        ),
      );
    }
    pushChapter(
      "intro",
      "Welcome and the big picture",
      beats,
      `Understand what ${ctx.pageTitle} is for.`,
    );
  }

  // Map
  {
    const id = `c${chapters.length + 1}`;
    const dirs = [
      ...new Set(
        ctx.fileTree.map((p) => p.split("/").slice(0, -1).join("/") || "."),
      ),
    ];
    const beats: TutorialBeat[] = [
      makeBeat(
        id,
        1,
        `Let's start with where everything lives. This page touches ${ctx.fileTree.length} file${ctx.fileTree.length === 1 ? "" : "s"} across ${dirs.length} director${dirs.length === 1 ? "y" : "ies"}, and the layout tells us a lot about how the responsibilities are split.`,
        { kind: "tree", focusPaths: ctx.fileTree.slice(0, 6) },
      ),
    ];
    dirs.slice(0, 6).forEach((dir, i) => {
      const paths = ctx.fileTree.filter(
        (p) => (p.split("/").slice(0, -1).join("/") || ".") === dir,
      );
      const named = paths.slice(0, 3).map(baseName).join(", ");
      const doc = sentencesMentioning(
        ctx.pageMarkdown,
        baseName(paths[0]).replace(/\.[^.]+$/, ""),
        1,
      )[0];
      beats.push(
        makeBeat(
          id,
          2 + i,
          `${dir === "." ? "At the repository root" : `Inside ${dir}`} we find ${named}${paths.length > 3 ? ` and ${paths.length - 3} more` : ""}. ${doc ?? `These files are the ones we'll open in a moment, so keep this location in mind.`}`,
          {
            kind: "tree",
            focusPaths: paths.slice(0, 6),
            callout: dir === "." ? "repository root" : dir,
          },
        ),
      );
    });
    pushChapter(
      "map",
      "Where the code lives",
      beats,
      "Know which files and folders matter for this page.",
    );
  }

  // Architecture
  diagramIds.forEach((diagramId, di) => {
    const diagram = ctx.diagrams[diagramId];
    const id = `c${chapters.length + 1}`;
    const beats: TutorialBeat[] = [
      makeBeat(
        id,
        1,
        `Now let's look at how the pieces connect. This ${diagram.kind === "sequence" ? "sequence diagram" : "diagram"} was generated from the actual code on this commit, so every box and arrow here corresponds to something real. We'll walk through it step by step.`,
        { kind: "diagram", diagramId, focusNodes: [] },
      ),
    ];
    if (diagram.kind === "sequence") {
      diagram.messages.forEach((m, i) => {
        if (i >= 10) return;
        const from =
          diagram.nodes.find((n) => n.id === m.from)?.label ?? m.from;
        const to = diagram.nodes.find((n) => n.id === m.to)?.label ?? m.to;
        beats.push(
          makeBeat(
            id,
            beats.length + 1,
            `Step ${i + 1}: ${from} ${m.style === "dotted" ? "replies to" : "sends"} ${to} with "${m.text}". ${i === 0 ? "This is where the interaction begins." : i === diagram.messages.length - 1 ? "And that is the final step of the exchange." : "Notice how each step builds on the one before it."}`,
            {
              kind: "diagram",
              diagramId,
              focusNodes: [String(m.index)],
              callout: m.text,
            },
          ),
        );
      });
    } else {
      const order = revealOrder(diagram);
      for (let i = 0; i < order.length && i < 12; i += 2) {
        const ids = order.slice(i, i + 2);
        const parts = ids.map((nodeId) => {
          const node = diagram.nodes.find((n) => n.id === nodeId)!;
          const outgoing = diagram.edges.filter((e) => e.from === nodeId);
          const targets = outgoing.map(
            (e) =>
              `${diagram.nodes.find((n) => n.id === e.to)?.label.split("\n")[0] ?? e.to}${e.label ? ` (${e.label})` : ""}`,
          );
          const doc = sentencesMentioning(
            ctx.pageMarkdown,
            node.label.split("\n")[0],
            1,
          )[0];
          return `${node.label.split("\n")[0]}${targets.length ? ` hands off to ${targets.slice(0, 3).join(", ")}` : " is where this path ends"}. ${doc ?? ""}`.trim();
        });
        beats.push(
          makeBeat(id, beats.length + 1, parts.join(" "), {
            kind: "diagram",
            diagramId,
            focusNodes: ids,
          }),
        );
      }
      beats.push(
        makeBeat(
          id,
          beats.length + 1,
          `Put together, the mental model is simple: data enters at the top of the diagram, each box owns one responsibility, and the arrows show the only paths it can take. Keep this picture in mind as we open the code behind each box.`,
          { kind: "diagram", diagramId, focusNodes: [] },
        ),
      );
    }
    pushChapter(
      "architecture",
      diagramIds.length > 1
        ? `Architecture ${di + 1}`
        : "How the pieces connect",
      beats,
      "Hold a mental model of the components and their connections.",
    );
  });

  // Deep dives per file
  filesInOrder.forEach((path) => {
    const regions = ctx.regions.filter((r) => r.path === path);
    const content = ctx.files[path] ?? "";
    const id = `c${chapters.length + 1}`;
    const beats: TutorialBeat[] = [];
    const head = regions.find((r) => r.kind === "head");
    const fileDoc = sentencesMentioning(ctx.pageMarkdown, baseName(path), 2);
    beats.push(
      makeBeat(
        id,
        1,
        `Let's open ${baseName(path)}. ${fileDoc[0] ?? `This file is one of the pieces this page is built on, and we'll read it the way you would in your editor: imports first, then the functions that matter.`}`,
        head
          ? {
              kind: "code",
              path,
              startLine: head.startLine,
              endLine: head.endLine,
              callout: "imports and setup",
            }
          : {
              kind: "code",
              path,
              startLine: 1,
              endLine: Math.min(30, content.split("\n").length),
            },
      ),
    );
    regions
      .filter((r) => r.symbol)
      .slice(0, 5)
      .forEach((r) => {
        const doc = sentencesMentioning(
          ctx.pageMarkdown,
          r.symbol as string,
          2,
        );
        const end = Math.min(r.endLine, r.startLine + MAX_CODE_WINDOW - 1);
        beats.push(
          makeBeat(
            id,
            beats.length + 1,
            `Here is ${r.symbol}, a ${r.kind === "default" ? "default export" : r.kind} defined at line ${r.startLine}. ${doc[0] ?? `It is one of the entry points other code reaches for, so understanding its inputs and outputs is the key to this file.`}`,
            {
              kind: "code",
              path,
              startLine: r.startLine,
              endLine: end,
              symbol: r.symbol,
              callout: `${r.symbol} starts here`,
            },
          ),
        );
        if (doc[1])
          beats.push(
            makeBeat(id, beats.length + 1, doc[1], {
              kind: "code",
              path,
              startLine: r.startLine,
              endLine: end,
              symbol: r.symbol,
              focus: [r.startLine, Math.min(end, r.startLine + 6)],
            }),
          );
      });
    if (fileDoc[1])
      beats.push(
        makeBeat(
          id,
          beats.length + 1,
          fileDoc[1],
          beats[beats.length - 1].visual,
        ),
      );
    pushChapter(
      "deep-dive",
      baseName(path),
      beats,
      `Read ${baseName(path)} with understanding.`,
    );
  });

  // Flow
  if (ctx.conceptHops && ctx.conceptHops.length >= 2) {
    const id = `c${chapters.length + 1}`;
    const steps = ctx.conceptHops;
    const beats = steps.map((step, i) =>
      makeBeat(
        id,
        i + 1,
        i === 0
          ? `Finally, let's follow one real path through the code. It starts at ${step.symbol ?? baseName(step.path)} in ${baseName(step.path)}, which is where control enters this chain.`
          : i === steps.length - 1
            ? `...and ends at ${step.symbol ?? baseName(step.path)} in ${baseName(step.path)}, the last step before the result goes back to the caller.`
            : `From there it calls into ${step.symbol ?? baseName(step.path)} in ${baseName(step.path)}, passing along what the previous step prepared.`,
        { kind: "flow", steps, activeStep: i },
      ),
    );
    pushChapter(
      "flow",
      "Following one real call chain",
      beats,
      "Trace a request across files.",
    );
  }

  // Recap
  {
    const id = `c${chapters.length + 1}`;
    const items: CardItem[] = regionsBySymbol.slice(0, 4).map((r) => ({
      title: r.symbol as string,
      body: `${r.kind === "class" ? "Class" : r.kind === "component" ? "Component" : "Function"} in ${baseName(r.path)}, lines ${r.startLine}-${r.endLine}.`,
      path: r.path,
    }));
    if (!items.length)
      items.push({
        title: ctx.pageTitle,
        body: ctx.pageDescription,
        path: ctx.fileTree[0],
      });
    const beats = items.map((item, i) =>
      makeBeat(
        id,
        i + 1,
        i === 0
          ? `Let's recap what we covered. ${item.title} is the first thing to remember: ${item.body}`
          : `Next, ${item.title}: ${item.body}`,
        { kind: "cards", items, revealCount: i + 1 },
      ),
    );
    beats.push(
      makeBeat(
        id,
        beats.length + 1,
        `That's the tour of ${ctx.pageTitle}. A good next step is to open ${baseName(ctx.fileTree[0] ?? "the main file")}, set a breakpoint in ${regionsBySymbol[0]?.symbol ?? "the main function"}, and run the project to watch this flow happen for real. Thanks for watching.`,
        {
          kind: "title",
          heading: "What to try next",
          bullets: [
            `Open ${ctx.fileTree[0] ?? "the main file"} and read it top to bottom`,
            `Trace ${regionsBySymbol[0]?.symbol ?? "the entry point"} with a debugger`,
            ...(ctx.siblingPageTitles?.[0]
              ? [`Continue with the "${ctx.siblingPageTitles[0]}" page`]
              : []),
          ],
        },
      ),
    );
    pushChapter(
      "recap",
      "Recap and next steps",
      beats,
      "Remember the essentials.",
    );
  }

  const wordCount = chapters.reduce(
    (s, c) => s + c.beats.reduce((t, b) => t + countWords(b.narration), 0),
    0,
  );
  return { chapters, source: "deterministic", wordCount };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await fn(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/**
 * Generates the full script with the LLM. Throws when the plan pass fails
 * (the caller then uses `buildDeterministicScript`); a single failed
 * chapter write is retried once and then replaced by a deterministic stub
 * so one bad response never loses the whole tutorial.
 */
export async function generateScript(
  ctx: ScriptContext,
  chat: ChatFn,
  onProgress?: (progress: ScriptProgress) => void,
): Promise<GeneratedScript> {
  onProgress?.({ stage: "planning", completed: 0, total: 1 });
  const planRaw = await chat(buildPlanPrompt(ctx));
  const plan = normalizePlan(parseJsonObject(planRaw), ctx);
  onProgress?.({ stage: "writing", completed: 0, total: plan.length });

  let completed = 0;
  const written = await mapWithConcurrency(
    plan,
    WRITE_CONCURRENCY,
    async (chapter) => {
      let beats: TutorialBeat[] = [];
      for (let attempt = 0; attempt < 2 && beats.length < 2; attempt += 1) {
        try {
          const raw = await chat(
            buildWritePrompt(ctx, plan, chapter, attempt ? 60 : 0),
          );
          beats = normalizeBeats(parseJsonObject(raw), ctx, chapter);
        } catch {
          beats = [];
        }
      }
      // Short chapters get one expansion pass, asking for the missing words.
      const words = beats.reduce((s, b) => s + countWords(b.narration), 0);
      if (beats.length >= 2 && words < chapter.words * 0.6) {
        try {
          const raw = await chat(
            buildWritePrompt(ctx, plan, chapter, chapter.words - words + 40),
          );
          const more = normalizeBeats(parseJsonObject(raw), ctx, chapter);
          const moreWords = more.reduce(
            (s, b) => s + countWords(b.narration),
            0,
          );
          if (moreWords > words) beats = more;
        } catch {
          // keep the shorter version
        }
      }
      completed += 1;
      onProgress?.({ stage: "writing", completed, total: plan.length });
      return { chapter, beats };
    },
  );

  const fallback = buildDeterministicScript(ctx);
  const chapters: TutorialChapter[] = written.map(({ chapter, beats }, i) => {
    const finalBeats =
      beats.length >= 2
        ? beats
        : (
            fallback.chapters.find((c) => c.kind === chapter.kind) ??
            fallback.chapters[Math.min(i, fallback.chapters.length - 1)]
          ).beats.map((b, j) => ({ ...b, id: `${chapter.id}-b${j + 1}` }));
    return {
      id: chapter.id,
      kind: chapter.kind,
      title: chapter.title,
      goal: chapter.goal,
      beats: finalBeats,
      startFrame: 0,
      durationInFrames: 0,
    };
  });

  const wordCount = chapters.reduce(
    (s, c) => s + c.beats.reduce((t, b) => t + countWords(b.narration), 0),
    0,
  );
  return { chapters, source: "llm", wordCount };
}
