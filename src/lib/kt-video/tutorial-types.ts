/**
 * KT tutorial video model (v2).
 *
 * A tutorial is a sequence of chapters, each a sequence of narrated beats.
 * Every beat pairs one spoken sentence group with exactly one visual: an
 * IDE view of a real file region, an animated diagram with focused nodes,
 * the repository map, a title/agenda card, a cross-file flow, or recap
 * cards. Visuals only ever reference real artefacts — a file that was
 * downloaded from the analysed commit, a diagram DeepWiki produced for the
 * page, a symbol the region index extracted — and every reference is
 * validated before it reaches the composition, so a script can only ever
 * change what is *said*, never fabricate what is *shown*.
 */

export const TUTORIAL_FPS = 30;

export type TutorialChapterKind =
  | "intro"
  | "map"
  | "architecture"
  | "deep-dive"
  | "flow"
  | "recap";

export interface CodeVisual {
  kind: "code";
  path: string;
  /** Inclusive 1-based range the editor scrolls to and highlights. */
  startLine: number;
  endLine: number;
  /** Optional narrower emphasis inside [startLine, endLine]. */
  focus?: [number, number];
  /** Symbol name shown in the breadcrumb / callout header, when known. */
  symbol?: string;
  /** Short annotation drawn beside the highlighted lines. */
  callout?: string;
}

export interface DiagramVisual {
  kind: "diagram";
  diagramId: string;
  /** Node ids (flowchart/class) or message indices as strings (sequence). */
  focusNodes: string[];
  /** Short annotation shown under the diagram. */
  callout?: string;
}

export interface TreeVisual {
  kind: "tree";
  /** Paths spot-lit during this beat (others stay dimmed). */
  focusPaths: string[];
  callout?: string;
}

export interface TitleVisual {
  kind: "title";
  heading: string;
  subtitle?: string;
  /** Agenda / takeaways, revealed one by one across the beat. */
  bullets?: string[];
}

export interface FlowStep {
  path: string;
  startLine: number;
  endLine: number;
  symbol?: string;
  label?: string;
}

export interface FlowVisual {
  kind: "flow";
  steps: FlowStep[];
  /** Index into `steps` that is active during this beat. */
  activeStep: number;
  callout?: string;
}

export interface CardItem {
  title: string;
  body: string;
  path?: string;
}

export interface CardsVisual {
  kind: "cards";
  items: CardItem[];
  /** How many cards are revealed by the end of this beat (1-based). */
  revealCount?: number;
}

export type TutorialVisual =
  | CodeVisual
  | DiagramVisual
  | TreeVisual
  | TitleVisual
  | FlowVisual
  | CardsVisual;

export interface TutorialBeat {
  id: string;
  narration: string;
  visual: TutorialVisual;
  /** Filled in by `timeTutorial`. */
  startFrame: number;
  durationInFrames: number;
}

export interface TutorialChapter {
  id: string;
  kind: TutorialChapterKind;
  title: string;
  /** One-line goal shown in the chapter lower-third. */
  goal?: string;
  beats: TutorialBeat[];
  startFrame: number;
  durationInFrames: number;
}

export type DiagramKind = "flowchart" | "sequence" | "class";

export interface DiagramNode {
  id: string;
  label: string;
  shape: "rect" | "round" | "diamond" | "circle" | "cylinder" | "hexagon";
  /** Subgraph (cluster) id when the node sits inside one. */
  group?: string;
  /** Set by layout. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  style: "solid" | "dotted" | "thick";
  /** Set by layout: polyline points in diagram space. */
  points: { x: number; y: number }[];
}

export interface DiagramGroup {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SequenceMessage {
  index: number;
  from: string;
  to: string;
  text: string;
  style: "solid" | "dotted";
  /** Set when the message sits inside a loop/alt/opt block. */
  block?: string;
}

export interface TutorialDiagram {
  id: string;
  kind: DiagramKind;
  direction: "DOWN" | "RIGHT";
  mermaid: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
  /** Sequence diagrams: participants are `nodes`, messages live here. */
  messages: SequenceMessage[];
  width: number;
  height: number;
}

export interface TutorialAudioClip {
  url: string;
  durationSeconds: number;
}

export interface KtTutorial {
  version: 2;
  repoName: string;
  pageTitle: string;
  commitSha: string;
  fps: number;
  /** Real file contents keyed by repo-relative path. */
  files: Record<string, string>;
  /** Every repo-relative path in scope for the map / explorer. */
  fileTree: string[];
  diagrams: Record<string, TutorialDiagram>;
  chapters: TutorialChapter[];
  totalFrames: number;
  /** Per-beat synthesised narration, when text-to-speech was available. */
  audio?: Record<string, TutorialAudioClip>;
  /** How the script was produced, surfaced in the player header. */
  scriptSource: "llm" | "deterministic";
  wordCount: number;
}

export function tutorialBeats(tutorial: KtTutorial): TutorialBeat[] {
  return tutorial.chapters.flatMap((c) => c.beats);
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
