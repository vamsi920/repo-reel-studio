/**
 * Cheap, deterministic prompt signals for the complexity scorer. Runs on the
 * user's raw text only — injected memory / KT blocks would make every turn
 * look "complex".
 */
// @spec MR-003 — Prompt feature extraction
export interface PromptFeatures {
  chars: number;
  estTokens: number;
  codeBlocks: number;
  hasStackTrace: boolean;
  filePathCount: number;
  listItems: number;
  heavyHits: number;
  lightHits: number;
  isTrivial: boolean;
  isCommand: boolean;
}

const HEAVY_PATTERNS: RegExp[] = [
  /\brefactor/i,
  /\barchitect/i,
  /\bmigrat/i,
  /\bredesign/i,
  /\bimplement/i,
  /\bdesign\b/i,
  /\bdebug/i,
  /\binvestigat/i,
  /\broot cause/i,
  /\boptimi[sz]/i,
  /\bperformance\b/i,
  /\bsecurity\b|\bvulnerab/i,
  /\bconcurren|\brace condition/i,
  /\bend[- ]to[- ]end\b/i,
  /\bacross (the|all|every)\b/i,
  /\bentire\b|\bwhole (codebase|repo|project)\b/i,
  /\bintegrat/i,
  /\bscal(e|able|ability)\b/i,
  /\balgorithm/i,
  /\bstep[- ]by[- ]step plan\b|\bplan (out|the)\b/i,
  /\bwhy (does|is|did)\b.*\b(fail|break|crash|hang)/i,
];

const LIGHT_PATTERNS: RegExp[] = [
  /\brename\b/i,
  /\btypo\b/i,
  /\bformat(ting)?\b/i,
  /^\s*what('s| is)\b/i,
  /\bsummari[sz]e\b|\btl;?dr\b/i,
  /\btranslate\b/i,
  /\bquick(ly)?\b/i,
  /\bsimple\b|\bsmall\b|\bone[- ]line\b/i,
  /\blist (the|all)\b/i,
];

const TRIVIAL =
  /^(ok(ay)?|k|thanks?( you)?|thx|ty|yes|yep|y|no|nope|n|sure|continue|go on|go ahead|proceed|next|done|great|cool|nice|lgtm|perfect|👍|🙏)[\s.!]*$/i;

const FILE_PATH = /(?:^|[\s`'"(])(?:[\w.-]+\/)+[\w.-]+\.\w{1,6}\b/g;
const STACK_TRACE =
  /(Traceback \(most recent call last\)|^\s+at .+\(.+:\d+:\d+\)|Exception in thread|Error: .+\n\s+at |panic:)/m;
const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+\S/gm;

export function extractPromptFeatures(raw: string): PromptFeatures {
  const text = raw ?? "";
  const trimmed = text.trim();
  const chars = trimmed.length;
  return {
    chars,
    estTokens: Math.ceil(chars / 4),
    codeBlocks: Math.floor((text.match(/```/g)?.length ?? 0) / 2),
    hasStackTrace: STACK_TRACE.test(text),
    filePathCount: text.match(FILE_PATH)?.length ?? 0,
    listItems: text.match(LIST_ITEM)?.length ?? 0,
    heavyHits: HEAVY_PATTERNS.filter((p) => p.test(text)).length,
    lightHits: LIGHT_PATTERNS.filter((p) => p.test(text)).length,
    isTrivial: TRIVIAL.test(trimmed),
    isCommand: trimmed.startsWith("/"),
  };
}
