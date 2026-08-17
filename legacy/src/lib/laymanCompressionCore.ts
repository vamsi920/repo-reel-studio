export type LaymanCompressionMode =
  | "summary"
  | "explain"
  | "brief"
  | "lite"
  | "full"
  | "ultra"
  | "wenyan";

export type LaymanBriefMode = "lite" | "full" | "ultra";

export type LaymanSegmentKind = "prose" | "code_fence";

export type LaymanSkipReason =
  | "not_natural_language"
  | "sensitive_path"
  | "file_too_large"
  | "already_backup_file"
  | "empty_input";

export type LaymanValidationErrorCode =
  | "heading_count_mismatch"
  | "heading_text_or_order_changed"
  | "code_blocks_not_preserved"
  | "url_mismatch"
  | "inline_code_mismatch"
  | "table_shape_mismatch";

export type LaymanValidationWarningCode = "path_mismatch" | "bullet_count_changed";

export type LaymanPreservationRules = {
  preserveCodeFences: boolean;
  preserveInlineCode: boolean;
  preserveUrls: boolean;
  preserveHeadings: boolean;
  preservePaths: boolean;
  preserveCommands: boolean;
};

export type LaymanSensitivePathMatch = {
  matched: boolean;
  reason: LaymanSensitiveRefusalCode | null;
};

export type LaymanSegment = {
  kind: LaymanSegmentKind;
  text: string;
  startLine: number;
  endLine: number;
};

export type LaymanProtectedTokenKind =
  | "inline_code"
  | "markdown_link"
  | "url"
  | "path"
  | "line_number"
  | "heading"
  | "table_row"
  | "date"
  | "version"
  | "env_var"
  | "command_line";

export type LaymanProtectedToken = {
  token: string;
  kind: LaymanProtectedTokenKind;
  value: string;
};

export type LaymanProtectedProseSegment = {
  template: string;
  protectedTokens: LaymanProtectedToken[];
};

export type LaymanTokenEstimate = {
  chars: number;
  words: number;
  estimatedTokens: number;
};

export type LaymanTokenEstimateMetrics = {
  before: LaymanTokenEstimate;
  after: LaymanTokenEstimate;
  savedTokens: number;
  savedRatio: number;
};

export type LaymanCompressionRuleResult = {
  mode: LaymanBriefMode;
  input: string;
  output: string;
  changed: boolean;
};

export type LaymanTokenEstimateSummary = {
  mode: LaymanBriefMode;
  originalTokens: number;
  compressedTokens: number;
  savedTokens: number;
};

export type LaymanValidatedCompressionResult = {
  text: string;
  validation: LaymanValidationResult;
  revertedToOriginal: boolean;
};

export type LaymanPromptCompressionFallbackReason =
  | "unsafe"
  | "noncompressible"
  | "validation_failed"
  | "savings_too_small";

export type LaymanPromptCompressionOptions = {
  path?: string;
  mode?: LaymanBriefMode;
  minSavedTokens?: number;
  maxBytes?: number;
  maxContextChars?: number;
  maxSegmentChars?: number;
  simplifyProse?: (proseTemplate: string, mode: LaymanBriefMode) => string;
};

export type LaymanPromptCompressionResult = {
  text: string;
  usedCompression: boolean;
  fallbackReason: LaymanPromptCompressionFallbackReason | null;
  mode: LaymanBriefMode;
  metrics: LaymanTokenEstimateSummary;
  eligibility: LaymanEligibility;
  validation: LaymanValidationResult | null;
};

export type LaymanValidationIssue<TCode extends string> = {
  code: TCode;
  message: string;
};

export type LaymanValidationResult = {
  isValid: boolean;
  errors: LaymanValidationIssue<LaymanValidationErrorCode>[];
  warnings: LaymanValidationIssue<LaymanValidationWarningCode>[];
};

export type LaymanEligibility = {
  shouldCompress: boolean;
  reason: LaymanSkipReason | null;
  refusal: LaymanCompressionRefusal | null;
};

export type LaymanContentKind =
  | "natural_language"
  | "code"
  | "config"
  | "binary"
  | "generated"
  | "unknown";

export type LaymanSensitiveRefusalCode =
  | "sensitive_basename"
  | "sensitive_path_component"
  | "sensitive_name_token";

export type LaymanCompressionRefusal = {
  code:
    | "empty_input"
    | "already_backup_file"
    | "file_too_large"
    | "not_natural_language"
    | "sensitive_path";
  message: string;
  sensitiveCode?: LaymanSensitiveRefusalCode;
};

export type LaymanCompressionPayload = {
  path: string;
  mode: LaymanCompressionMode;
  sourceText: string;
  segments: LaymanSegment[];
  tokenEstimate: LaymanTokenEstimate;
};

const NATURAL_LANGUAGE_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".rst"]);
const CODE_OR_CONFIG_EXTENSIONS = new Set([
  ".py",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".env",
  ".lock",
  ".css",
  ".scss",
  ".html",
  ".xml",
  ".sql",
  ".sh",
  ".bash",
  ".zsh",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".lua",
  ".dockerfile",
  ".makefile",
  ".csv",
  ".ini",
  ".cfg",
]);
const CONFIG_EXTENSIONS = new Set([".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".env"]);
const GENERATED_ARTIFACT_EXTENSIONS = new Set([
  ".map",
  ".snap",
  ".svgz",
  ".class",
  ".pyc",
  ".wasm",
]);
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".mp3",
  ".mp4",
  ".mov",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
]);

const URL_REGEX = /https?:\/\/[^\s)]+/g;
const PATH_REGEX = /(?:\.\/|\.\.\/|\/|[A-Za-z]:\\)[\w\-/\\.]+|[\w\-.]+[/\\][\w\-/\\.]+/g;
const HEADING_REGEX = /^(#{1,6})\s+(.*)$/gm;
const BULLET_REGEX = /^\s*[-*+]\s+/gm;
const FENCE_OPEN_REGEX = /^(\s{0,3})(`{3,}|~{3,})(.*)$/;
const INLINE_CODE_REGEX = /`[^`\n]+`/g;
const MARKDOWN_LINK_REGEX = /\[[^\]]+\]\([^)]+\)/g;
const ENV_VAR_REGEX = /\$?[A-Z][A-Z0-9_]{1,}/g;
const DATE_REGEX = /\b\d{4}-\d{2}-\d{2}\b/g;
const VERSION_REGEX = /\bv?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/g;
const LINE_NUMBER_REGEX = /(?:\bline\s+\d+\b|\bL\d{1,6}\b|:\d{1,6}(?::\d{1,6})?)/gi;
const WHITESPACE_REGEX = /[ \t]{2,}/g;
const DEFAULT_MAX_CONTEXT_CHARS = 120_000;
const DEFAULT_MAX_SEGMENT_CHARS = 16_000;

const LITE_PHRASE_REPLACERS: Array<[RegExp, string]> = [
  [/\bin order to\b/gi, "to"],
  [/\bmake sure to\b/gi, "ensure"],
  [/\bthe reason is because\b/gi, "because"],
];

const FULL_PHRASE_REPLACERS: Array<[RegExp, string]> = [
  ...LITE_PHRASE_REPLACERS,
  [/\bit might be worth\b/gi, ""],
  [/\byou could consider\b/gi, ""],
  [/\bit would be good to\b/gi, ""],
  [/\byou should\b/gi, ""],
  [/\byou can\b/gi, ""],
  [/\bplease\b/gi, ""],
  [/\bwith the following components\b/gi, ""],
  [/\bis responsible for\b/gi, "manages"],
];

const ULTRA_PHRASE_REPLACERS: Array<[RegExp, string]> = [
  ...FULL_PHRASE_REPLACERS,
  [/\bthis is important because\b/gi, "because"],
  [/\bwhat changed\b/gi, "change"],
  [/\bwhy it matters\b/gi, "impact"],
];

const FILLER_WORDS = ["just", "really", "basically", "actually", "simply", "essentially", "generally"];
const CONNECTIVE_WORDS = ["however", "furthermore", "additionally", "in addition"];
const PLEASANTRIES = [
  "sure",
  "certainly",
  "of course",
  "happy to",
  "i'd recommend",
  "i would recommend",
];

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeWordSet(text: string, words: string[]): string {
  if (words.length === 0) return text;
  const pattern = new RegExp(`\\b(?:${words.map(escapeRegex).join("|")})\\b`, "gi");
  return text.replace(pattern, "");
}

function applyPhraseReplacers(text: string, replacers: Array<[RegExp, string]>): string {
  return replacers.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

function normalizeCompressedProse(text: string): string {
  return text
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])([A-Za-z0-9])/g, "$1 $2")
    .replace(WHITESPACE_REGEX, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\(\s+\)/g, "")
    .trim();
}

export function compressLaymanProseDeterministic(
  input: string,
  mode: LaymanBriefMode,
): LaymanCompressionRuleResult {
  let output = input;
  output = removeWordSet(output, FILLER_WORDS);
  output = removeWordSet(output, CONNECTIVE_WORDS);
  output = removeWordSet(output, PLEASANTRIES);

  if (mode === "lite") {
    output = applyPhraseReplacers(output, LITE_PHRASE_REPLACERS);
  } else if (mode === "full") {
    output = applyPhraseReplacers(output, FULL_PHRASE_REPLACERS);
    output = output.replace(/\b(you|we)\s+should\b/gi, "");
  } else {
    output = applyPhraseReplacers(output, ULTRA_PHRASE_REPLACERS);
    output = output
      .replace(/\b(you|we)\s+(should|can|need to)\b/gi, "")
      .replace(/\bis\b/gi, "")
      .replace(/\bare\b/gi, "");
  }

  output = normalizeCompressedProse(output);
  return {
    mode,
    input,
    output,
    changed: output !== normalizeCompressedProse(input),
  };
}

const SENSITIVE_BASENAME_REGEX =
  /^(?:\.env(?:\..+)?|\.netrc|credentials(?:\..+)?|secrets?(?:\..+)?|passwords?(?:\..+)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|authorized_keys|known_hosts|.*\.(?:pem|key|p12|pfx|crt|cer|jks|keystore|asc|gpg))$/i;
const SENSITIVE_PATH_COMPONENTS = new Set([".ssh", ".aws", ".gnupg", ".kube", ".docker"]);
const SENSITIVE_NAME_TOKENS = [
  "secret",
  "credential",
  "password",
  "passwd",
  "apikey",
  "accesskey",
  "token",
  "privatekey",
] as const;

export const DEFAULT_LAYMAN_PRESERVATION_RULES: LaymanPreservationRules = {
  preserveCodeFences: true,
  preserveInlineCode: true,
  preserveUrls: true,
  preserveHeadings: true,
  preservePaths: true,
  preserveCommands: true,
};

function extractFileName(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function extractExtension(path: string): string {
  const name = extractFileName(path).toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

function isCodeLikeLine(line: string): boolean {
  return (
    /^\s*(import |from .+ import |require\(|const |let |var )/.test(line) ||
    /^\s*(def |class |function |async function |export )/.test(line) ||
    /^\s*(if\s*\(|for\s*\(|while\s*\(|switch\s*\(|try\s*\{)/.test(line) ||
    /^\s*[}\]);]+\s*$/.test(line) ||
    /^\s*@\w+/.test(line) ||
    /^\s*"[^"]+"\s*:\s*/.test(line) ||
    /^\s*\w+\s*=\s*[{[("']/.test(line)
  );
}

function looksLikeYaml(lines: string[]): boolean {
  const window = lines.slice(0, 30);
  let indicators = 0;
  let nonEmpty = 0;
  for (const line of window) {
    const stripped = line.trim();
    if (!stripped) continue;
    nonEmpty += 1;
    if (
      stripped.startsWith("---") ||
      /^\w[\w\s]*:\s/.test(stripped) ||
      (stripped.startsWith("- ") && stripped.includes(":"))
    ) {
      indicators += 1;
    }
  }
  return nonEmpty > 0 && indicators / nonEmpty > 0.6;
}

function looksLikeJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function hasBinaryMarkers(text: string): boolean {
  if (!text) return false;
  if (text.includes("\u0000")) return true;
  const sample = text.slice(0, 8000);
  let suspicious = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const code = sample.charCodeAt(i);
    const isTabOrNewline = code === 9 || code === 10 || code === 13;
    const isPrintableAscii = code >= 32 && code <= 126;
    if (!isTabOrNewline && !isPrintableAscii) suspicious += 1;
  }
  return sample.length > 0 && suspicious / sample.length > 0.2;
}

function looksMinified(text: string): boolean {
  const sample = text.slice(0, 12000);
  const lines = sample.split(/\r?\n/);
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  if (nonEmpty.length === 0) return false;
  const longLines = nonEmpty.filter((line) => line.length > 220).length;
  const hasManySemicolons = (sample.match(/;/g)?.length ?? 0) > 40;
  const hasLowWhitespace = sample.length > 0 && (sample.match(/\s/g)?.length ?? 0) / sample.length < 0.08;
  return longLines / nonEmpty.length > 0.6 && hasManySemicolons && hasLowWhitespace;
}

function looksGeneratedByMarker(text: string): boolean {
  const head = text.slice(0, 2000).toLowerCase();
  return (
    head.includes("auto-generated") ||
    head.includes("autogenerated") ||
    head.includes("generated file") ||
    head.includes("do not edit") ||
    head.includes("code generated")
  );
}

function isLockfileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return (
    lower === "package-lock.json" ||
    lower === "pnpm-lock.yaml" ||
    lower === "yarn.lock" ||
    lower === "cargo.lock" ||
    lower.endsWith(".lock")
  );
}

export function detectCompressionContentKind(path: string, content: string): LaymanContentKind {
  const fileName = extractFileName(path).toLowerCase();
  const extension = extractExtension(path);

  if (BINARY_EXTENSIONS.has(extension) || hasBinaryMarkers(content)) {
    return "binary";
  }

  if (
    isLockfileName(fileName) ||
    GENERATED_ARTIFACT_EXTENSIONS.has(extension) ||
    fileName.endsWith(".min.js") ||
    fileName.endsWith(".min.css") ||
    looksGeneratedByMarker(content) ||
    looksMinified(content)
  ) {
    return "generated";
  }

  if (NATURAL_LANGUAGE_EXTENSIONS.has(extension)) {
    return "natural_language";
  }

  if (CONFIG_EXTENSIONS.has(extension)) {
    return "config";
  }

  if (CODE_OR_CONFIG_EXTENSIONS.has(extension)) {
    return "code";
  }

  const lines = content.split(/\r?\n/).slice(0, 50);
  if (looksLikeJson(content.slice(0, 10_000)) || looksLikeYaml(lines)) {
    return "config";
  }
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  if (nonEmpty.length === 0) {
    return "unknown";
  }
  const codeLikeCount = nonEmpty.filter((line) => isCodeLikeLine(line)).length;
  if (codeLikeCount / nonEmpty.length > 0.4) {
    return "code";
  }
  return "natural_language";
}

export function detectSensitivePath(path: string): LaymanSensitivePathMatch {
  const name = extractFileName(path);
  if (SENSITIVE_BASENAME_REGEX.test(name)) {
    return { matched: true, reason: "sensitive_basename" };
  }

  const normalized = path.replaceAll("\\", "/").toLowerCase();
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => SENSITIVE_PATH_COMPONENTS.has(part))) {
    return { matched: true, reason: "sensitive_path_component" };
  }

  const collapsed = name.toLowerCase().replace(/[_\-\s.]/g, "");
  if (SENSITIVE_NAME_TOKENS.some((token) => collapsed.includes(token))) {
    return { matched: true, reason: "sensitive_name_token" };
  }

  return { matched: false, reason: null };
}

function refusalFromSkipReason(
  reason: LaymanSkipReason,
  extra?: { maxBytes?: number; sensitiveCode?: LaymanSensitiveRefusalCode },
): LaymanCompressionRefusal {
  if (reason === "empty_input") {
    return { code: "empty_input", message: "Refusing compression: input is empty." };
  }
  if (reason === "already_backup_file") {
    return {
      code: "already_backup_file",
      message: "Refusing compression: .original.md backup files are never compressed.",
    };
  }
  if (reason === "file_too_large") {
    return {
      code: "file_too_large",
      message: `Refusing compression: file exceeds max bytes (${extra?.maxBytes ?? 500_000}).`,
    };
  }
  if (reason === "sensitive_path") {
    const base =
      extra?.sensitiveCode === "sensitive_basename"
        ? "filename matches secret/key credential patterns"
        : extra?.sensitiveCode === "sensitive_path_component"
          ? "path contains private credential directory"
          : "filename contains secret/token credential markers";
    return {
      code: "sensitive_path",
      sensitiveCode: extra?.sensitiveCode,
      message: `Refusing compression: ${base}. Sensitive files are blocked from compression payloads.`,
    };
  }
  return {
    code: "not_natural_language",
    message: "Refusing compression: file classified as non-compressible (code/config/binary/generated).",
  };
}

export function evaluateCompressionEligibility(params: {
  path: string;
  content: string;
  maxBytes?: number;
}): LaymanEligibility {
  const { path, content, maxBytes = 500_000 } = params;
  if (!content.trim()) {
    const reason: LaymanSkipReason = "empty_input";
    return { shouldCompress: false, reason, refusal: refusalFromSkipReason(reason) };
  }
  if (extractFileName(path).endsWith(".original.md")) {
    const reason: LaymanSkipReason = "already_backup_file";
    return { shouldCompress: false, reason, refusal: refusalFromSkipReason(reason) };
  }

  const size = new TextEncoder().encode(content).length;
  if (size > maxBytes) {
    const reason: LaymanSkipReason = "file_too_large";
    return { shouldCompress: false, reason, refusal: refusalFromSkipReason(reason, { maxBytes }) };
  }

  const sensitive = detectSensitivePath(path);
  if (sensitive.matched) {
    const reason: LaymanSkipReason = "sensitive_path";
    return {
      shouldCompress: false,
      reason,
      refusal: refusalFromSkipReason(reason, { sensitiveCode: sensitive.reason ?? undefined }),
    };
  }

  const kind = detectCompressionContentKind(path, content);
  if (kind === "natural_language") {
    return { shouldCompress: true, reason: null, refusal: null };
  }
  const reason: LaymanSkipReason = "not_natural_language";
  return { shouldCompress: false, reason, refusal: refusalFromSkipReason(reason) };
}

export function segmentMarkdownForCompression(input: string): LaymanSegment[] {
  const lines = input.split(/\r?\n/);
  const segments: LaymanSegment[] = [];
  let proseBuffer: string[] = [];
  let proseStart = 1;

  const flushProse = (endLine: number) => {
    if (proseBuffer.length === 0) return;
    segments.push({
      kind: "prose",
      text: proseBuffer.join("\n"),
      startLine: proseStart,
      endLine,
    });
    proseBuffer = [];
  };

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    const open = FENCE_OPEN_REGEX.exec(line);
    if (!open) {
      if (proseBuffer.length === 0) proseStart = i + 1;
      proseBuffer.push(line);
      i += 1;
      continue;
    }

    flushProse(i);
    const fenceChar = open[2][0];
    const fenceLen = open[2].length;
    const start = i + 1;
    const block: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const maybeClose = FENCE_OPEN_REGEX.exec(lines[i]);
      block.push(lines[i]);
      if (
        maybeClose &&
        maybeClose[2][0] === fenceChar &&
        maybeClose[2].length >= fenceLen &&
        maybeClose[3].trim() === ""
      ) {
        i += 1;
        break;
      }
      i += 1;
    }
    segments.push({
      kind: "code_fence",
      text: block.join("\n"),
      startLine: start,
      endLine: start + block.length - 1,
    });
    proseStart = i + 1;
  }

  flushProse(lines.length);
  return segments.filter((segment) => segment.text.length > 0);
}

function extractCodeBlocks(text: string): string[] {
  return segmentMarkdownForCompression(text)
    .filter((segment) => segment.kind === "code_fence")
    .map((segment) => segment.text);
}

function extractInlineCodeFromProse(text: string): string[] {
  const proseOnly = segmentMarkdownForCompression(text)
    .filter((segment) => segment.kind === "prose")
    .map((segment) => segment.text)
    .join("\n");
  return [...proseOnly.matchAll(INLINE_CODE_REGEX)].map((match) => match[0]);
}

function tableColumnCount(line: string): number | null {
  if (!isTableLine(line)) return null;
  const trimmed = line.trim();
  let parts = trimmed.split("|");
  if (trimmed.startsWith("|")) parts = parts.slice(1);
  if (trimmed.endsWith("|")) parts = parts.slice(0, -1);
  return parts.length;
}

function extractTableShapes(text: string): number[][] {
  const lines = text.split(/\r?\n/);
  const groups: number[][] = [];
  let current: number[] = [];
  for (const line of lines) {
    const count = tableColumnCount(line);
    if (count == null) {
      if (current.length > 0) {
        groups.push(current);
        current = [];
      }
      continue;
    }
    current.push(count);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function extractHeadings(text: string): Array<{ level: string; title: string }> {
  return [...text.matchAll(HEADING_REGEX)].map((match) => ({
    level: match[1],
    title: match[2].trim(),
  }));
}

function asSet(regex: RegExp, text: string): Set<string> {
  return new Set(text.match(regex) ?? []);
}

function countMatches(regex: RegExp, text: string): number {
  return text.match(regex)?.length ?? 0;
}

function isCommandLikeLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("#")) return false;
  if (trimmed.includes("://")) return false;
  return /^(npm|pnpm|yarn|bun|node|python3?|pip|uv|npx|git|docker|kubectl|make|bash|sh)\b/.test(
    trimmed,
  );
}

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  if (/^\|?[\s:-]+\|[\s|:-]*$/.test(trimmed)) return true;
  return trimmed.split("|").length >= 3;
}

function applyProtectedPattern(params: {
  input: string;
  kind: LaymanProtectedTokenKind;
  regex: RegExp;
  protectedTokens: LaymanProtectedToken[];
  nextIdRef: { value: number };
}): string {
  const { input, kind, regex, protectedTokens, nextIdRef } = params;
  if (input.length === 0) return input;
  return input.replace(regex, (match) => {
    const token = `@@${nextIdRef.value}@@`;
    nextIdRef.value += 1;
    protectedTokens.push({ token, kind, value: match });
    return token;
  });
}

export function protectProseForLaymanCompression(text: string): LaymanProtectedProseSegment {
  const protectedTokens: LaymanProtectedToken[] = [];
  const nextIdRef = { value: 0 };
  let template = text;

  const lines = template.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim().startsWith("#")) {
      const token = `@@${nextIdRef.value}@@`;
      nextIdRef.value += 1;
      protectedTokens.push({ token, kind: "heading", value: line });
      lines[i] = token;
      continue;
    }
    if (isTableLine(line)) {
      const token = `@@${nextIdRef.value}@@`;
      nextIdRef.value += 1;
      protectedTokens.push({ token, kind: "table_row", value: line });
      lines[i] = token;
      continue;
    }
    if (isCommandLikeLine(line)) {
      const token = `@@${nextIdRef.value}@@`;
      nextIdRef.value += 1;
      protectedTokens.push({ token, kind: "command_line", value: line });
      lines[i] = token;
    }
  }
  template = lines.join("\n");

  template = applyProtectedPattern({
    input: template,
    kind: "inline_code",
    regex: INLINE_CODE_REGEX,
    protectedTokens,
    nextIdRef,
  });
  template = applyProtectedPattern({
    input: template,
    kind: "markdown_link",
    regex: MARKDOWN_LINK_REGEX,
    protectedTokens,
    nextIdRef,
  });
  template = applyProtectedPattern({
    input: template,
    kind: "url",
    regex: URL_REGEX,
    protectedTokens,
    nextIdRef,
  });
  template = applyProtectedPattern({
    input: template,
    kind: "path",
    regex: PATH_REGEX,
    protectedTokens,
    nextIdRef,
  });
  template = applyProtectedPattern({
    input: template,
    kind: "line_number",
    regex: LINE_NUMBER_REGEX,
    protectedTokens,
    nextIdRef,
  });
  template = applyProtectedPattern({
    input: template,
    kind: "date",
    regex: DATE_REGEX,
    protectedTokens,
    nextIdRef,
  });
  template = applyProtectedPattern({
    input: template,
    kind: "version",
    regex: VERSION_REGEX,
    protectedTokens,
    nextIdRef,
  });
  template = applyProtectedPattern({
    input: template,
    kind: "env_var",
    regex: ENV_VAR_REGEX,
    protectedTokens,
    nextIdRef,
  });

  return { template, protectedTokens };
}

export function restoreProtectedLaymanTokens(
  template: string,
  protectedTokens: LaymanProtectedToken[],
): string {
  let result = template;
  for (const item of protectedTokens) {
    result = result.replaceAll(item.token, item.value);
  }
  return result;
}

function estimateTokensFromText(text: string): LaymanTokenEstimate {
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const estimatedTokens = Math.ceil(chars / 4);
  return { chars, words, estimatedTokens };
}

export function estimateTokens(text: string): number {
  return estimateTokensFromText(text).estimatedTokens;
}

function estimatePotentialSavingsTokens(text: string, mode: LaymanBriefMode): number {
  const normalized = text.toLowerCase();
  if (!normalized.trim()) return 0;

  const countWholeWord = (word: string) => {
    const pattern = new RegExp(`\\b${escapeRegex(word.toLowerCase())}\\b`, "g");
    return normalized.match(pattern)?.length ?? 0;
  };
  const countPhrase = (phrase: string) => normalized.split(phrase.toLowerCase()).length - 1;

  let removableWords = 0;
  for (const word of [...FILLER_WORDS, ...CONNECTIVE_WORDS, ...PLEASANTRIES]) {
    removableWords += countWholeWord(word);
  }

  let phraseHits = 0;
  const replacers =
    mode === "lite"
      ? LITE_PHRASE_REPLACERS
      : mode === "full"
        ? FULL_PHRASE_REPLACERS
        : ULTRA_PHRASE_REPLACERS;
  for (const [pattern] of replacers) {
    // Uses source text to avoid running heavy regex on huge input during preflight.
    const phrase = pattern.source.replace(/\\b|\(\?:|\)|\|/g, " ").trim();
    if (phrase.length < 4) continue;
    phraseHits += countPhrase(phrase.replace(/\s+/g, " "));
  }

  const roughCharsSaved = removableWords * 4 + phraseHits * 7;
  return Math.max(0, Math.floor(roughCharsSaved / 4));
}

export function estimateTokenMetrics(beforeText: string, afterText: string): LaymanTokenEstimateMetrics {
  const before = estimateTokensFromText(beforeText);
  const after = estimateTokensFromText(afterText);
  const savedTokens = Math.max(0, before.estimatedTokens - after.estimatedTokens);
  const savedRatio = before.estimatedTokens
    ? Number((savedTokens / before.estimatedTokens).toFixed(4))
    : 0;
  return { before, after, savedTokens, savedRatio };
}

export function summarizeTokenEstimates(params: {
  mode: LaymanBriefMode;
  originalText: string;
  compressedText: string;
}): LaymanTokenEstimateSummary {
  const originalTokens = estimateTokens(params.originalText);
  const compressedTokens = estimateTokens(params.compressedText);
  return {
    mode: params.mode,
    originalTokens,
    compressedTokens,
    savedTokens: Math.max(0, originalTokens - compressedTokens),
  };
}

export function buildLaymanCompressionPayload(params: {
  path: string;
  content: string;
  mode: LaymanCompressionMode;
  maxBytes?: number;
}): { payload: LaymanCompressionPayload | null; refusal: LaymanCompressionRefusal | null } {
  const eligibility = evaluateCompressionEligibility({
    path: params.path,
    content: params.content,
    maxBytes: params.maxBytes,
  });
  if (!eligibility.shouldCompress) {
    return { payload: null, refusal: eligibility.refusal };
  }
  return {
    payload: {
      path: params.path,
      mode: params.mode,
      sourceText: params.content,
      segments: segmentMarkdownForCompression(params.content),
      tokenEstimate: estimateTokensFromText(params.content),
    },
    refusal: null,
  };
}

export function compressMarkdownProseOnly(
  markdown: string,
  simplifyProse: (proseTemplate: string) => string,
  options: { maxSegmentChars?: number } = {},
): string {
  const maxSegmentChars = options.maxSegmentChars ?? DEFAULT_MAX_SEGMENT_CHARS;
  const segments = segmentMarkdownForCompression(markdown);
  const output: string[] = [];
  for (const segment of segments) {
    if (segment.kind === "code_fence") {
      output.push(segment.text);
      continue;
    }
    // Guardrail: skip very large prose segments to avoid expensive regex passes.
    if (segment.text.length > maxSegmentChars) {
      output.push(segment.text);
      continue;
    }
    const protectedSegment = protectProseForLaymanCompression(segment.text);
    const simplified = simplifyProse(protectedSegment.template);
    output.push(restoreProtectedLaymanTokens(simplified, protectedSegment.protectedTokens));
  }
  return output.join("\n");
}

export function validateCompressedMarkdown(
  original: string,
  compressed: string,
): LaymanValidationResult {
  const errors: LaymanValidationIssue<LaymanValidationErrorCode>[] = [];
  const warnings: LaymanValidationIssue<LaymanValidationWarningCode>[] = [];

  const originalHeadings = extractHeadings(original);
  const compressedHeadings = extractHeadings(compressed);
  if (originalHeadings.length !== compressedHeadings.length) {
    errors.push({
      code: "heading_count_mismatch",
      message: `Heading count mismatch: ${originalHeadings.length} vs ${compressedHeadings.length}`,
    });
  }
  if (JSON.stringify(originalHeadings) !== JSON.stringify(compressedHeadings)) {
    errors.push({
      code: "heading_text_or_order_changed",
      message: "Heading text/order changed",
    });
  }

  const originalCode = extractCodeBlocks(original);
  const compressedCode = extractCodeBlocks(compressed);
  if (JSON.stringify(originalCode) !== JSON.stringify(compressedCode)) {
    errors.push({
      code: "code_blocks_not_preserved",
      message: "Code blocks not preserved exactly",
    });
  }

  const originalUrls = asSet(URL_REGEX, original);
  const compressedUrls = asSet(URL_REGEX, compressed);
  if (JSON.stringify([...originalUrls].sort()) !== JSON.stringify([...compressedUrls].sort())) {
    errors.push({
      code: "url_mismatch",
      message: "URL mismatch between original and compressed content",
    });
  }

  const originalInlineCode = extractInlineCodeFromProse(original);
  const compressedInlineCode = extractInlineCodeFromProse(compressed);
  if (JSON.stringify(originalInlineCode) !== JSON.stringify(compressedInlineCode)) {
    errors.push({
      code: "inline_code_mismatch",
      message: "Inline code tokens not preserved exactly",
    });
  }

  const originalTableShapes = extractTableShapes(original);
  const compressedTableShapes = extractTableShapes(compressed);
  if (JSON.stringify(originalTableShapes) !== JSON.stringify(compressedTableShapes)) {
    errors.push({
      code: "table_shape_mismatch",
      message: "Markdown table shape changed",
    });
  }

  const originalPaths = asSet(PATH_REGEX, original);
  const compressedPaths = asSet(PATH_REGEX, compressed);
  if (JSON.stringify([...originalPaths].sort()) !== JSON.stringify([...compressedPaths].sort())) {
    warnings.push({
      code: "path_mismatch",
      message: "Path set changed between original and compressed content",
    });
  }

  const originalBulletCount = countMatches(BULLET_REGEX, original);
  if (originalBulletCount > 0) {
    const compressedBulletCount = countMatches(BULLET_REGEX, compressed);
    const diff = Math.abs(originalBulletCount - compressedBulletCount) / originalBulletCount;
    if (diff > 0.15) {
      warnings.push({
        code: "bullet_count_changed",
        message: `Bullet count changed too much: ${originalBulletCount} -> ${compressedBulletCount}`,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export function compressMarkdownProseOnlyWithValidation(
  markdown: string,
  simplifyProse: (proseTemplate: string) => string,
  options: { maxSegmentChars?: number } = {},
): LaymanValidatedCompressionResult {
  const compressed = compressMarkdownProseOnly(markdown, simplifyProse, options);
  const validation = validateCompressedMarkdown(markdown, compressed);
  if (!validation.isValid) {
    return {
      text: markdown,
      validation,
      revertedToOriginal: true,
    };
  }
  return {
    text: compressed,
    validation,
    revertedToOriginal: false,
  };
}

export function compressForPrompt(
  text: string,
  options: LaymanPromptCompressionOptions = {},
): LaymanPromptCompressionResult {
  const mode = options.mode ?? "lite";
  const path = options.path ?? "prompt.txt";
  const minSavedTokens = options.minSavedTokens ?? 1;
  const maxContextChars = options.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;
  const maxSegmentChars = options.maxSegmentChars ?? DEFAULT_MAX_SEGMENT_CHARS;
  const simplify =
    options.simplifyProse ??
    ((proseTemplate: string, activeMode: LaymanBriefMode) =>
      compressLaymanProseDeterministic(proseTemplate, activeMode).output);

  const eligibility = evaluateCompressionEligibility({
    path,
    content: text,
    maxBytes: options.maxBytes,
  });

  if (!eligibility.shouldCompress) {
    const fallbackReason: LaymanPromptCompressionFallbackReason =
      eligibility.reason === "sensitive_path" ? "unsafe" : "noncompressible";
    return {
      text,
      usedCompression: false,
      fallbackReason,
      mode,
      metrics: summarizeTokenEstimates({ mode, originalText: text, compressedText: text }),
      eligibility,
      validation: null,
    };
  }

  if (text.length > maxContextChars) {
    return {
      text,
      usedCompression: false,
      fallbackReason: "noncompressible",
      mode,
      metrics: summarizeTokenEstimates({ mode, originalText: text, compressedText: text }),
      eligibility: {
        shouldCompress: false,
        reason: "file_too_large",
        refusal: {
          code: "file_too_large",
          message: `Refusing compression: context exceeds max chars (${maxContextChars}).`,
        },
      },
      validation: null,
    };
  }

  if (!options.simplifyProse && estimatePotentialSavingsTokens(text, mode) === 0) {
    return {
      text,
      usedCompression: false,
      fallbackReason: "savings_too_small",
      mode,
      metrics: summarizeTokenEstimates({ mode, originalText: text, compressedText: text }),
      eligibility,
      validation: null,
    };
  }

  const validated = compressMarkdownProseOnlyWithValidation(
    text,
    (proseTemplate) => simplify(proseTemplate, mode),
    { maxSegmentChars },
  );
  const metrics = summarizeTokenEstimates({
    mode,
    originalText: text,
    compressedText: validated.text,
  });

  if (validated.revertedToOriginal) {
    return {
      text,
      usedCompression: false,
      fallbackReason: "validation_failed",
      mode,
      metrics,
      eligibility,
      validation: validated.validation,
    };
  }

  if (metrics.savedTokens < minSavedTokens) {
    return {
      text,
      usedCompression: false,
      fallbackReason: "savings_too_small",
      mode,
      metrics,
      eligibility,
      validation: validated.validation,
    };
  }

  return {
    text: validated.text,
    usedCompression: true,
    fallbackReason: null,
    mode,
    metrics,
    eligibility,
    validation: validated.validation,
  };
}
