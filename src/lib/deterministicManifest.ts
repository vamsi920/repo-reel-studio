/**
 * src/lib/deterministicManifest.ts
 *
 * Deterministic, code-first video manifest generator.
 *
 * Philosophy (per product direction): the video must SHOW the real codebase and
 * point at it accurately. No AI is required to do that — we read the actual files,
 * extract their real structure (imports, exports, functions, classes) with real
 * line numbers, and narrate them like a tutor walking left-to-right through the code.
 *
 * Every sentence is backed by a real source_ref (file + line range), so the
 * renderer's subtitle/evidence sync always has something true to attach to, and
 * nothing fabricated ever reaches the screen.
 */

import type {
  GitNexusGraphData,
  SentenceEvidence,
  SourceRef,
  VideoManifest,
  VideoScene,
} from "@/lib/types";

const WORDS_PER_SECOND = 2.3;
const MIN_SCENE_SECONDS = 9;

// ---------------------------------------------------------------------------
// File selection & ranking (deterministic, works with or without graph data)
// ---------------------------------------------------------------------------

const IGNORE_PATH = /(^|\/)(node_modules|dist|build|\.git|coverage|vendor|__pycache__|\.next|\.turbo)(\/|$)/i;
const NOISE_FILE =
  /(\.min\.|\.lock$|\.map$|package-lock\.json$|yarn\.lock$|pnpm-lock\.yaml$|\.snap$|\.d\.ts$)/i;
const TEST_FILE = /(\.|\/)(test|spec)\.|(^|\/)(tests?|__tests__)(\/|$)/i;

const SOURCE_EXT = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "go", "rs", "java", "rb", "php", "cs", "kt", "swift", "scala", "c", "cc", "cpp", "h", "hpp",
  "vue", "svelte",
]);

const ENTRY_HINTS = [
  "src/main", "src/index", "src/app", "main.", "index.", "app.", "server.", "cli.",
  "__main__", "manage.py",
];

const extOf = (path: string): string => path.split(".").pop()?.toLowerCase() || "";

const baseName = (path: string): string => path.split("/").pop() || path;

const isSourceFile = (path: string): boolean =>
  SOURCE_EXT.has(extOf(path)) || /readme/i.test(baseName(path));

const normalize = (p: string): string => p.replace(/^\.\/+/, "").replace(/^\/+/, "");

/** Approximate import in-degree across the provided file set (no graph needed). */
function computeInDegree(fileContents: Record<string, string>): Map<string, number> {
  const paths = Object.keys(fileContents).map(normalize);
  const byNormalized = new Set(paths);
  const inDegree = new Map<string, number>();

  const resolveRelative = (fromPath: string, spec: string): string | null => {
    const fromDir = fromPath.split("/").slice(0, -1).join("/");
    const parts = (fromDir ? `${fromDir}/${spec}` : spec).split("/");
    const stack: string[] = [];
    for (const part of parts) {
      if (part === "." || part === "") continue;
      if (part === "..") stack.pop();
      else stack.push(part);
    }
    const guess = stack.join("/");
    const candidates = [
      guess,
      `${guess}.ts`, `${guess}.tsx`, `${guess}.js`, `${guess}.jsx`,
      `${guess}/index.ts`, `${guess}/index.tsx`, `${guess}/index.js`,
      `${guess}.py`, `${guess}.go`,
    ];
    return candidates.find((c) => byNormalized.has(c)) || null;
  };

  for (const [rawPath, content] of Object.entries(fileContents)) {
    const fromPath = normalize(rawPath);
    const importRe = /(?:import\s.+?from\s+|require\(|from\s+)['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(content)) !== null) {
      const spec = m[1];
      if (!spec.startsWith(".")) continue; // only resolve local imports
      const target = resolveRelative(fromPath, spec);
      if (target) inDegree.set(target, (inDegree.get(target) || 0) + 1);
    }
  }
  return inDegree;
}

function rankFiles(
  fileContents: Record<string, string>,
  graphData: GitNexusGraphData | null | undefined,
  limit: number
): string[] {
  const inDegree = computeInDegree(fileContents);
  const hubFiles = new Set(
    (graphData?.summary?.hubFiles || []).map(normalize)
  );

  const candidates = Object.keys(fileContents).filter((p) => {
    const n = normalize(p);
    if (IGNORE_PATH.test(n) || NOISE_FILE.test(n)) return false;
    if (!isSourceFile(n)) return false;
    const content = fileContents[p] || "";
    if (content.trim().length < 40) return false; // skip near-empty files
    return true;
  });

  const score = (path: string): number => {
    const n = normalize(path);
    const lower = n.toLowerCase();
    let s = 0;
    s += (inDegree.get(n) || 0) * 2; // depended-upon files matter
    if (hubFiles.has(n)) s += 6;
    if (ENTRY_HINTS.some((h) => lower.includes(h))) s += 5;
    if (lower.startsWith("src/")) s += 2;
    const lines = (fileContents[path].match(/\n/g)?.length || 0) + 1;
    s += Math.min(lines / 40, 4); // bigger files tend to carry more logic (capped)
    if (TEST_FILE.test(n)) s -= 6;
    if (/readme/i.test(baseName(n))) s += 3; // good opener
    if (/\.(json|ya?ml|css|scss|md)$/i.test(n) && !/readme/i.test(baseName(n))) s -= 3;
    if (/(config|setup|constants?)\b/i.test(lower)) s -= 1;
    return s;
  };

  return candidates
    .map((p) => ({ p, s: score(p) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.p);
}

// ---------------------------------------------------------------------------
// Lightweight structural extraction (real symbols + real line numbers)
// ---------------------------------------------------------------------------

interface Symbol {
  name: string;
  line: number; // 1-based
  kind: "function" | "class" | "component" | "interface" | "type" | "const" | "default";
  exported: boolean;
}

const COMPONENT_NAME = /^[A-Z]/;

function extractSymbols(path: string, content: string): Symbol[] {
  const lines = content.split("\n");
  const ext = extOf(path);
  const symbols: Symbol[] = [];

  const push = (s: Symbol) => {
    if (!s.name || s.name.length < 2) return;
    symbols.push(s);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ln = i + 1;
    const trimmed = line.trim();

    if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "vue", "svelte"].includes(ext)) {
      let m: RegExpMatchArray | null;
      if ((m = trimmed.match(/^export\s+default\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/))) {
        push({ name: m[1], line: ln, kind: "default", exported: true });
      } else if ((m = trimmed.match(/^export\s+default\s+class\s+([A-Za-z0-9_]+)/))) {
        push({ name: m[1], line: ln, kind: "default", exported: true });
      } else if ((m = trimmed.match(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/))) {
        push({ name: m[1], line: ln, kind: "function", exported: true });
      } else if ((m = trimmed.match(/^export\s+class\s+([A-Za-z0-9_]+)/))) {
        push({ name: m[1], line: ln, kind: "class", exported: true });
      } else if ((m = trimmed.match(/^export\s+interface\s+([A-Za-z0-9_]+)/))) {
        push({ name: m[1], line: ln, kind: "interface", exported: true });
      } else if ((m = trimmed.match(/^export\s+type\s+([A-Za-z0-9_]+)/))) {
        push({ name: m[1], line: ln, kind: "type", exported: true });
      } else if ((m = trimmed.match(/^export\s+const\s+([A-Za-z0-9_]+)\s*[=:]/))) {
        const kind = COMPONENT_NAME.test(m[1]) ? "component" : "const";
        push({ name: m[1], line: ln, kind, exported: true });
      } else if ((m = trimmed.match(/^(?:async\s+)?function\s+([A-Za-z0-9_]+)/))) {
        push({ name: m[1], line: ln, kind: "function", exported: false });
      } else if ((m = trimmed.match(/^class\s+([A-Za-z0-9_]+)/))) {
        push({ name: m[1], line: ln, kind: "class", exported: false });
      } else if ((m = trimmed.match(/^const\s+([A-Z][A-Za-z0-9_]+)\s*=\s*(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>/))) {
        push({ name: m[1], line: ln, kind: "component", exported: false });
      }
    } else if (ext === "py") {
      let m: RegExpMatchArray | null;
      if ((m = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z0-9_]+)/))) {
        push({ name: m[1], line: ln, kind: "function", exported: !trimmed.startsWith("_") });
      } else if ((m = trimmed.match(/^class\s+([A-Za-z0-9_]+)/))) {
        push({ name: m[1], line: ln, kind: "class", exported: true });
      }
    } else if (ext === "go") {
      let m: RegExpMatchArray | null;
      if ((m = trimmed.match(/^func\s+(?:\([^)]*\)\s*)?([A-Za-z0-9_]+)/))) {
        push({ name: m[1], line: ln, kind: "function", exported: COMPONENT_NAME.test(m[1]) });
      } else if ((m = trimmed.match(/^type\s+([A-Za-z0-9_]+)/))) {
        push({ name: m[1], line: ln, kind: "type", exported: COMPONENT_NAME.test(m[1]) });
      }
    } else if (["rs", "java", "cs", "kt", "swift", "scala", "rb", "php", "c", "cc", "cpp"].includes(ext)) {
      let m: RegExpMatchArray | null;
      if ((m = trimmed.match(/(?:pub\s+|public\s+|private\s+)?(?:async\s+)?(?:fn|func|def|function)\s+([A-Za-z0-9_]+)/))) {
        push({ name: m[1], line: ln, kind: "function", exported: true });
      } else if ((m = trimmed.match(/(?:pub\s+|public\s+)?(?:class|struct|interface|trait|enum)\s+([A-Za-z0-9_]+)/))) {
        push({ name: m[1], line: ln, kind: "class", exported: true });
      }
    }
  }

  return symbols;
}

function extractImports(content: string, max = 5): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /(?:import\s.+?from\s+|require\(\s*|from\s+|use\s+)['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null && out.length < max) {
    const spec = m[1];
    // present a readable name: last path segment or package name
    const label = spec.startsWith(".")
      ? baseName(spec).replace(/\.[a-z]+$/i, "")
      : spec.replace(/^@[^/]+\//, "").split("/")[0];
    if (label && !seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tutor narration (grounded in the real extracted facts)
// ---------------------------------------------------------------------------

function roleForPath(path: string): string {
  const l = normalize(path).toLowerCase();
  if (/readme/i.test(baseName(l))) return "the project's front door — its README";
  if (/(^|\/)(pages|views|screens)(\/|$)|page\.|route\./.test(l)) return "a page that users actually land on";
  if (/context/.test(l)) return "a React context that shares state across the app";
  if (/(^|\/)hooks?(\/|$)|\/use[A-Z]/.test(l) || /\buse[A-Z]/.test(baseName(path))) return "a reusable React hook";
  if (/component/.test(l) || extOf(l) === "tsx" || extOf(l) === "jsx") return "a UI component";
  if (/(store|reducer|slice|redux|zustand)/.test(l)) return "the state-management layer";
  if (/(route|controller|endpoint|api|handler|server)/.test(l)) return "a backend entry point that handles requests";
  if (/(service|client|provider)/.test(l)) return "a service module that talks to the outside world";
  if (/(model|schema|entity|types?)/.test(l)) return "where the core data shapes are defined";
  if (/(util|helper|lib|common)/.test(l)) return "a shared utility module the rest of the code leans on";
  if (/(config|setup|env)/.test(l)) return "configuration that wires the project together";
  if (/(middleware|guard|interceptor)/.test(l)) return "middleware that sits in the request path";
  if (/main\.|index\.|app\.|__main__|cli\./.test(l)) return "an entry point where execution begins";
  return "a core module in this codebase";
}

const kindWord = (k: Symbol["kind"]): string => {
  switch (k) {
    case "component": return "component";
    case "class": return "class";
    case "interface": return "interface";
    case "type": return "type";
    case "default": return "main export";
    case "const": return "value";
    default: return "function";
  }
};

const joinHuman = (items: string[]): string => {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
};

function pickPrimary(symbols: Symbol[]): Symbol | null {
  if (symbols.length === 0) return null;
  const def = symbols.find((s) => s.kind === "default");
  if (def) return def;
  const exported = symbols.filter((s) => s.exported);
  const pool = exported.length ? exported : symbols;
  // prefer functions/components/classes over types/consts
  const meaty = pool.find((s) => ["function", "component", "class", "default"].includes(s.kind));
  return meaty || pool[0];
}

interface SceneDraft {
  scene: VideoScene;
}

function buildCodeScene(
  id: number,
  path: string,
  content: string,
  graphData: GitNexusGraphData | null | undefined
): VideoScene {
  const lines = content.split("\n");
  const lineCount = lines.length;
  const file = baseName(path);
  const nameNoExt = file.replace(/\.[a-z]+$/i, "");
  const role = roleForPath(path);
  const symbols = extractSymbols(path, content);
  const imports = extractImports(content);
  const primary = pickPrimary(symbols);

  const refTo = (start: number, end: number, symbol?: string): SourceRef => ({
    file_path: path,
    start_line: Math.max(1, start),
    end_line: Math.min(lineCount, Math.max(start, end)),
    symbol_name: symbol,
  });

  const sentences: SentenceEvidence[] = [];
  const focus: string[] = [];

  // Sentence 1 — what this file is.
  sentences.push({
    sentence: `Let's open ${nameNoExt}. This is ${role}.`,
    source_refs: [refTo(1, Math.min(lineCount, 12))],
    on_screen_focus: [file],
  });

  // Sentence 2 — what it depends on (only if there are real imports).
  if (imports.length) {
    sentences.push({
      sentence: `Right at the top it pulls in ${joinHuman(imports)}, so it builds directly on ${imports.length > 1 ? "those pieces" : "that piece"} rather than reinventing them.`,
      source_refs: [refTo(1, Math.min(lineCount, 15))],
      on_screen_focus: imports.slice(0, 3),
    });
  }

  // Highlight range: frame the primary symbol.
  let highlight: [number, number] = [1, Math.min(lineCount, 16)];

  if (primary) {
    focus.push(primary.name);
    const next = symbols
      .filter((s) => s.line > primary.line)
      .sort((a, b) => a.line - b.line)[0];
    const blockEnd = next ? Math.min(next.line - 1, primary.line + 30) : Math.min(lineCount, primary.line + 24);
    highlight = [primary.line, Math.max(primary.line + 1, blockEnd)];

    sentences.push({
      sentence: `The heart of this file is ${primary.name}, the ${kindWord(primary.kind)} starting on line ${primary.line}. That's the part doing the real work here.`,
      source_refs: [refTo(primary.line, blockEnd, primary.name)],
      on_screen_focus: [primary.name],
    });

    // Sentence 4 — a second notable symbol, if present.
    const others = symbols.filter((s) => s.name !== primary.name && s.exported);
    if (others.length) {
      const secondary = others.slice(0, 3).map((s) => s.name);
      secondary.forEach((n) => focus.push(n));
      const second = others[0];
      sentences.push({
        sentence: `It also exposes ${joinHuman(secondary)}, which is how the rest of the codebase reaches into this module.`,
        source_refs: [refTo(second.line, Math.min(lineCount, second.line + 8), second.name)],
        on_screen_focus: secondary,
      });
    } else {
      sentences.push({
        sentence: `Everything else in the file exists to support ${primary.name}, so once you understand it, you understand this file.`,
        source_refs: [refTo(highlight[0], highlight[1], primary.name)],
        on_screen_focus: [primary.name],
      });
    }
  } else {
    // No symbols detected (config, data, markdown) — describe the content honestly.
    sentences.push({
      sentence: `This file is mostly ${/\.(json|ya?ml)$/i.test(path) ? "configuration data" : "declarative content"}, and these top lines are the part worth knowing.`,
      source_refs: [refTo(1, Math.min(lineCount, 20))],
      on_screen_focus: [file],
    });
  }

  const narration_text = sentences.map((s) => s.sentence).join(" ");
  const words = narration_text.trim().split(/\s+/).filter(Boolean).length;
  const duration_seconds = Math.max(MIN_SCENE_SECONDS, Math.ceil(words / WORDS_PER_SECOND) + 3);

  const allRefs = sentences.flatMap((s) => s.source_refs);

  return {
    id,
    type: "code",
    visual_type: "code",
    visual_kind: "code",
    file_path: path,
    title: nameNoExt,
    highlight_lines: highlight,
    narration_text,
    duration_seconds,
    code: content,
    sentence_evidence: sentences,
    source_refs: allRefs,
    on_screen_focus: Array.from(new Set(focus)).slice(0, 6),
    focus_symbols: Array.from(new Set(focus)).slice(0, 6),
    quality_flags: {
      has_real_code: true,
      has_source_refs: true,
      has_sentence_evidence: true,
      visual_sync_ready: true,
    },
  };
}

function detectTech(fileContents: Record<string, string>): string[] {
  const exts = new Set(Object.keys(fileContents).map(extOf));
  const tech: string[] = [];
  if (exts.has("tsx") || exts.has("jsx")) tech.push("React");
  if (exts.has("ts") || exts.has("tsx")) tech.push("TypeScript");
  else if (exts.has("js") || exts.has("jsx") || exts.has("mjs")) tech.push("JavaScript");
  if (exts.has("py")) tech.push("Python");
  if (exts.has("go")) tech.push("Go");
  if (exts.has("rs")) tech.push("Rust");
  if (exts.has("java")) tech.push("Java");
  const pkg = Object.entries(fileContents).find(([p]) => /package\.json$/.test(p));
  if (pkg) {
    const c = pkg[1];
    if (/"next"/.test(c)) tech.push("Next.js");
    if (/"express"/.test(c)) tech.push("Express");
    if (/"vite"/.test(c)) tech.push("Vite");
    if (/"tailwindcss"/.test(c)) tech.push("Tailwind");
  }
  return Array.from(new Set(tech));
}

function buildIntroScene(
  id: number,
  repoName: string,
  fileContents: Record<string, string>,
  rankedFiles: string[],
  graphData: GitNexusGraphData | null | undefined
): VideoScene {
  const openerPath =
    rankedFiles.find((p) => /readme/i.test(baseName(p))) ||
    rankedFiles.find((p) => ENTRY_HINTS.some((h) => normalize(p).toLowerCase().includes(h))) ||
    rankedFiles[0];
  const content = fileContents[openerPath] || "";
  const lineCount = content.split("\n").length || 1;
  const tech = detectTech(fileContents);
  const totalFiles = Object.keys(fileContents).length;
  const tour = rankedFiles.slice(0, 4).map((p) => baseName(p).replace(/\.[a-z]+$/i, ""));

  const ref: SourceRef = {
    file_path: openerPath,
    start_line: 1,
    end_line: Math.min(lineCount, 20),
  };

  const sentences: SentenceEvidence[] = [
    {
      sentence: `Welcome — let's walk through the ${repoName} codebase together.`,
      source_refs: [ref],
      on_screen_focus: [baseName(openerPath)],
    },
    {
      sentence: tech.length
        ? `It's built with ${joinHuman(tech)}, and it spans ${totalFiles} source files.`
        : `It spans ${totalFiles} source files, and we'll focus on the ones that matter most.`,
      source_refs: [ref],
      on_screen_focus: tech.slice(0, 3),
    },
    {
      sentence: tour.length
        ? `We'll start here, then move through ${joinHuman(tour)}, following the code itself the whole way.`
        : `We'll follow the real code the whole way, file by file.`,
      source_refs: [ref],
      on_screen_focus: tour.slice(0, 3),
    },
  ];

  const narration_text = sentences.map((s) => s.sentence).join(" ");
  const words = narration_text.trim().split(/\s+/).filter(Boolean).length;

  return {
    id,
    type: "intro",
    visual_type: "code",
    visual_kind: "code",
    file_path: openerPath,
    title: `Welcome to ${repoName}`,
    highlight_lines: [1, Math.min(lineCount, 16)],
    narration_text,
    duration_seconds: Math.max(MIN_SCENE_SECONDS, Math.ceil(words / WORDS_PER_SECOND) + 3),
    code: content,
    sentence_evidence: sentences,
    source_refs: sentences.flatMap((s) => s.source_refs),
    on_screen_focus: tour.slice(0, 4),
    quality_flags: {
      has_real_code: true,
      has_source_refs: true,
      has_sentence_evidence: true,
      visual_sync_ready: true,
    },
  };
}

function buildSummaryScene(
  id: number,
  repoName: string,
  fileContents: Record<string, string>,
  rankedFiles: string[]
): VideoScene {
  const openerPath = rankedFiles[0];
  const content = fileContents[openerPath] || "";
  const lineCount = content.split("\n").length || 1;
  const tour = rankedFiles.slice(0, 4).map((p) => baseName(p).replace(/\.[a-z]+$/i, ""));
  const ref: SourceRef = { file_path: openerPath, start_line: 1, end_line: Math.min(lineCount, 12) };

  const sentences: SentenceEvidence[] = [
    {
      sentence: `That's the core of ${repoName}.`,
      source_refs: [ref],
      on_screen_focus: [baseName(openerPath)],
    },
    {
      sentence: tour.length
        ? `We saw how ${joinHuman(tour)} fit together, each backed by the actual source you just watched.`
        : `Every claim was tied straight back to the actual source.`,
      source_refs: [ref],
      on_screen_focus: tour.slice(0, 3),
    },
    {
      sentence: `From here, you can dive into any of these files yourself and already know your way around.`,
      source_refs: [ref],
      on_screen_focus: tour.slice(0, 3),
    },
  ];

  const narration_text = sentences.map((s) => s.sentence).join(" ");
  const words = narration_text.trim().split(/\s+/).filter(Boolean).length;

  return {
    id,
    type: "summary",
    visual_type: "code",
    visual_kind: "code",
    file_path: openerPath,
    title: "Recap",
    highlight_lines: [1, Math.min(lineCount, 12)],
    narration_text,
    duration_seconds: Math.max(MIN_SCENE_SECONDS, Math.ceil(words / WORDS_PER_SECOND) + 3),
    code: content,
    sentence_evidence: sentences,
    source_refs: sentences.flatMap((s) => s.source_refs),
    on_screen_focus: tour.slice(0, 4),
    quality_flags: {
      has_real_code: true,
      has_source_refs: true,
      has_sentence_evidence: true,
      visual_sync_ready: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DeterministicManifestOptions {
  /** Override the manifest title. */
  title?: string;
  /** Max number of file deep-dive scenes (excludes intro + summary). */
  maxFileScenes?: number;
  /** Add an intro scene (default true). */
  includeIntro?: boolean;
  /** Add a recap scene (default true). */
  includeSummary?: boolean;
}

/**
 * Build a complete, evidence-backed manifest purely from the real repository
 * files. No AI, no network, no fabricated code — everything points at real lines.
 */
export function buildDeterministicManifest(
  repoName: string,
  fileContents: Record<string, string>,
  graphData?: GitNexusGraphData | null,
  options: DeterministicManifestOptions = {}
): VideoManifest {
  const {
    title,
    maxFileScenes = 8,
    includeIntro = true,
    includeSummary = true,
  } = options;

  const ranked = rankFiles(fileContents, graphData, Math.max(maxFileScenes + 2, 6));

  const scenes: VideoScene[] = [];
  let id = 1;

  if (ranked.length === 0) {
    // Nothing usable — produce a single honest scene rather than fake content.
    const anyPath = Object.keys(fileContents)[0];
    const content = anyPath ? fileContents[anyPath] : "";
    scenes.push({
      id: id++,
      type: "intro",
      visual_type: "code",
      visual_kind: "code",
      file_path: anyPath || "repository",
      title: `Overview: ${repoName}`,
      highlight_lines: [1, 10],
      narration_text: `This is a quick look at ${repoName}.`,
      duration_seconds: MIN_SCENE_SECONDS,
      code: content,
      sentence_evidence: anyPath
        ? [
            {
              sentence: `This is a quick look at ${repoName}.`,
              source_refs: [{ file_path: anyPath, start_line: 1, end_line: Math.min(10, (content.split("\n").length || 1)) }],
            },
          ]
        : [],
    });
    return {
      title: title || `${repoName} — Code Walkthrough`,
      scenes,
      repo_files: Object.keys(fileContents),
      pipeline_version: "deterministic",
    };
  }

  if (includeIntro) {
    scenes.push(buildIntroScene(id++, repoName, fileContents, ranked, graphData));
  }

  const fileScenePaths = ranked.slice(0, maxFileScenes);
  for (const path of fileScenePaths) {
    scenes.push(buildCodeScene(id++, path, fileContents[path], graphData));
  }

  if (includeSummary && fileScenePaths.length > 1) {
    scenes.push(buildSummaryScene(id++, repoName, fileContents, ranked));
  }

  return {
    title: title || `${repoName} — Code Walkthrough`,
    scenes,
    repo_files: Object.keys(fileContents),
    pipeline_version: "deterministic",
  };
}
