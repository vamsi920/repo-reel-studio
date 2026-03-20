import { GEMINI_API_BASE, GEMINI_API_KEY, GEMINI_MODEL } from "@/env";
import { parseRepoContent } from "@/lib/parseRepoContent";
import {
  buildRepoEvidenceBundle,
  buildSceneSourceRefs,
  getCodeExcerptForRef,
  getRelatedFilesForFile,
  humanizeFileLabel,
  isConfigFile,
  isDocFile,
  isSourceCodeFile,
  isTestFile,
} from "@/lib/repoEvidence";
import {
  buildRepoKnowledgeGraph,
  getContextFilesForCapsule,
  getTutorialCapsules,
} from "@/lib/repoKnowledgeGraph";
import {
  buildCodegraphQuestionContext,
  getCodegraphRelatedFiles,
} from "@/lib/upstreamCodegraph";
import type {
  GitNexusGraphData,
  RepoContextCapsule,
  RepoKnowledgeGraph,
  SourceRef,
  VideoManifest,
} from "@/lib/types";

type RepoQuestionMode =
  | "security"
  | "architecture"
  | "runtime"
  | "data"
  | "onboarding"
  | "dependencies"
  | "general";

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

interface RawAnswerPayload {
  verdict?: string;
  answer?: string;
  confidence?: "high" | "medium" | "low";
  trace_steps?: Array<{
    label?: string;
    summary?: string;
    evidence_indexes?: number[];
  }>;
  findings?: Array<{
    title?: string;
    detail?: string;
    severity?: "high" | "medium" | "low";
    evidence_indexes?: number[];
  }>;
  follow_ups?: string[];
}

export interface RepoAnswerEvidence {
  index: number;
  source_ref: SourceRef;
  excerpt: string;
  summary: string;
}

export interface RepoAnswerTraceStep {
  label: string;
  summary: string;
  source_refs: SourceRef[];
}

export interface RepoAnswerFinding {
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
  source_refs: SourceRef[];
}

export interface RepoInvestigationAnswer {
  question: string;
  mode: RepoQuestionMode;
  verdict: string;
  answer: string;
  confidence: "high" | "medium" | "low";
  findings: RepoAnswerFinding[];
  trace_steps: RepoAnswerTraceStep[];
  follow_ups: string[];
  evidence: RepoAnswerEvidence[];
  capsules: Array<{
    id: string;
    title: string;
    purpose: RepoContextCapsule["purpose"];
  }>;
  reading_paths: Array<{
    id: string;
    title: string;
    file_paths: string[];
  }>;
  focused_files: string[];
}

interface RepoInvestigatorArgs {
  question: string;
  repoName: string;
  repoContent?: string;
  graphData?: GitNexusGraphData | null;
  manifest?: VideoManifest | null;
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "that",
  "this",
  "what",
  "where",
  "when",
  "which",
  "about",
  "does",
  "have",
  "there",
  "their",
  "would",
  "could",
  "should",
  "repo",
  "repository",
  "project",
  "codebase",
  "code",
  "explain",
  "show",
  "tell",
  "trace",
]);

const SECURITY_TERMS = [
  "auth",
  "token",
  "session",
  "secret",
  "security",
  "breach",
  "attack",
  "exploit",
  "permission",
  "access",
  "credential",
  "csrf",
  "xss",
  "sql",
  "input",
  "sanitize",
  "validate",
  "header",
  "cookie",
];

const DATA_TERMS = ["db", "database", "query", "storage", "persist", "schema", "migration", "record"];
const RUNTIME_TERMS = ["flow", "request", "runtime", "path", "execute", "calls", "chain", "start"];
const DEPENDENCY_TERMS = ["depend", "import", "relationship", "module", "hub", "uses", "call"];
const ONBOARDING_TERMS = ["start", "begin", "learn", "onboard", "first", "overview"];
const GENERIC_ANSWER_PATTERNS = [
  /strongest (?:conclusion|answer) i can support/i,
  /graph-backed evidence/i,
  /falls back to/i,
  /use the trace steps/i,
  /could not turn the evidence pack/i,
  /answer confidently/i,
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const stripMarkdownFence = (value: string) => {
  if (!value.startsWith("```")) return value;
  return value.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
};

const parseGeminiJson = <T,>(raw: string): T => {
  const text = stripMarkdownFence(raw.trim());

  try {
    return JSON.parse(text) as T;
  } catch {
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]) as T;
    }
    throw new Error("Could not parse JSON from Gemini response");
  }
};

const requestGemini = async (prompt: string) => {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key not configured");
  }

  const response = await fetch(
    `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          topK: 24,
          topP: 0.85,
          maxOutputTokens: 2048,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data: GeminiResponse = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("No response from Gemini API");
  }
  return text;
};

const tokenize = (value: string) =>
  Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9_./-]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    )
  );

const includesAny = (value: string, terms: string[]) =>
  terms.some((term) => value.includes(term));

const detectMode = (question: string): RepoQuestionMode => {
  const lower = question.toLowerCase();
  if (includesAny(lower, SECURITY_TERMS)) return "security";
  if (includesAny(lower, DATA_TERMS)) return "data";
  if (includesAny(lower, RUNTIME_TERMS)) return "runtime";
  if (includesAny(lower, DEPENDENCY_TERMS)) return "dependencies";
  if (includesAny(lower, ONBOARDING_TERMS)) return "onboarding";
  if (lower.includes("architecture") || lower.includes("design")) return "architecture";
  return "general";
};

const buildFileContents = (
  repoContent: string | undefined,
  manifest?: VideoManifest | null
) => {
  const parsed = repoContent ? parseRepoContent(repoContent) : {};

  if (Object.keys(parsed).length > 0) {
    return parsed;
  }

  const fileContents: Record<string, string> = {};
  (manifest?.evidence_bundle?.snippet_catalog || []).forEach((snippet) => {
    const existing = fileContents[snippet.file_path];
    if (!existing || existing.length < snippet.code.length) {
      fileContents[snippet.file_path] = snippet.code;
    }
  });
  return fileContents;
};

const summarizeRef = (ref: SourceRef, fileContents: Record<string, string>) => {
  const excerpt = getCodeExcerptForRef(fileContents, ref)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return excerpt
    ? `${ref.file_path}:${ref.start_line}-${ref.end_line} — ${excerpt.slice(0, 140)}`
    : `${ref.file_path}:${ref.start_line}-${ref.end_line}`;
};

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

const formatHumanList = (values: string[], limit = values.length) => {
  const items = Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  ).slice(0, limit);

  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
};

const formatFileLabels = (filePaths: string[], limit = 3) =>
  formatHumanList(filePaths.map((filePath) => humanizeFileLabel(filePath)), limit);

const uniqueFilePaths = (filePaths: string[]) =>
  Array.from(new Set(filePaths.filter(Boolean)));

const describeCodegraphContext = (
  codegraphContext: ReturnType<typeof buildCodegraphQuestionContext>
) => {
  if (!codegraphContext) return "";

  const topModule = codegraphContext.modules[0];
  const topEntity = codegraphContext.entities[0];
  const topExternal = codegraphContext.externalDependencies[0];
  const parts: string[] = [];

  if (topModule) {
    parts.push(
      `${humanizeFileLabel(topModule.fullPath)} is one of the strongest dependency anchors (${topModule.incomingLinks} inbound, ${topModule.outgoingLinks} outbound).`
    );
  }

  if (topEntity) {
    parts.push(
      `${topEntity.name} in ${humanizeFileLabel(topEntity.modulePath)} is one of the busiest ${topEntity.entityType.toLowerCase()} nodes in the Python graph.`
    );
  }

  if (topExternal) {
    parts.push(
      `${topExternal.name} is one of the most-referenced external dependencies in the current Python graph.`
    );
  }

  return normalizeText(parts.join(" "));
};

const buildTraceSummary = (
  evidence: RepoAnswerEvidence,
  mode: RepoQuestionMode,
  index: number
) => {
  const fileLabel = humanizeFileLabel(evidence.source_ref.file_path);

  if (mode === "onboarding") {
    return index === 0
      ? `${fileLabel} is the cleanest place to start because it anchors the strongest entry-point evidence.`
      : `${fileLabel} is a useful next stop once the first file makes sense.`;
  }

  if (mode === "runtime") {
    return index === 0
      ? `${fileLabel} looks like the best starting point for the runtime path in the current evidence.`
      : `${fileLabel} extends that path into the next layer of the system.`;
  }

  if (mode === "security") {
    return index === 0
      ? `${fileLabel} is a priority inspection point for auth, inputs, or trust boundaries.`
      : `${fileLabel} is a secondary checkpoint that could widen the blast radius.`;
  }

  if (mode === "data") {
    return `${fileLabel} contains one of the clearer storage or schema anchors in the current evidence pack.`;
  }

  if (mode === "dependencies") {
    return `${fileLabel} appears frequently enough to matter as a shared module or dependency hub.`;
  }

  return `${fileLabel} is one of the stronger files backing the current answer.`;
};

const buildFindingTitle = (mode: RepoQuestionMode, index: number) => {
  if (mode === "onboarding") return index === 0 ? "Start here" : "Read next";
  if (mode === "runtime") return index === 0 ? "Probable entry path" : "Next hop";
  if (mode === "security") return index === 0 ? "Primary checkpoint" : "Additional checkpoint";
  if (mode === "data") return index === 0 ? "Data boundary" : "Supporting data file";
  if (mode === "dependencies") return index === 0 ? "Hub module" : "Supporting dependency";
  return index === 0 ? "Best anchor" : "Supporting anchor";
};

const buildFindingDetail = (
  evidence: RepoAnswerEvidence,
  mode: RepoQuestionMode,
  index: number
) => {
  const fileLabel = humanizeFileLabel(evidence.source_ref.file_path);

  if (mode === "security") {
    return `${fileLabel} is worth checking early because it is one of the strongest places to verify auth, input, storage, or external-call handling.`;
  }

  if (mode === "onboarding") {
    return index === 0
      ? `${fileLabel} is the most practical entry file to read first from the current evidence.`
      : `${fileLabel} should come soon after the first file to round out the mental model.`;
  }

  if (mode === "runtime") {
    return `${fileLabel} helps prove how work moves through the system rather than just how it is organized.`;
  }

  if (mode === "data") {
    return `${fileLabel} gives one of the better anchors for understanding how data is shaped or stored.`;
  }

  if (mode === "dependencies") {
    return `${fileLabel} appears to be reused broadly enough to matter as shared infrastructure.`;
  }

  return `${fileLabel} is one of the clearest supporting files for this question.`;
};

const buildDeterministicVerdict = ({
  mode,
  primaryFile,
  supportingFiles,
  topCapsule,
}: {
  mode: RepoQuestionMode;
  primaryFile?: string;
  supportingFiles: string[];
  topCapsule?: RepoContextCapsule;
}) => {
  const primaryLabel = primaryFile ? humanizeFileLabel(primaryFile) : "";
  const supportingLabel = formatFileLabels(supportingFiles, 2);

  if (mode === "onboarding") {
    if (primaryLabel && supportingLabel) {
      return `Start with ${primaryLabel}, then continue into ${supportingLabel}.`;
    }
    return "Start with the strongest entry file, then follow the connected hub files.";
  }

  if (mode === "runtime") {
    if (primaryLabel && supportingLabel) {
      return `The most provable runtime path starts near ${primaryLabel} and then moves through ${supportingLabel}.`;
    }
    return "The current evidence points to a narrow runtime path rather than a broad architecture summary.";
  }

  if (mode === "security") {
    if (primaryLabel && supportingLabel) {
      return `Inspect ${primaryLabel} first, then verify ${supportingLabel} for auth, input, or storage boundaries.`;
    }
    return "The current evidence is strongest as an inspection path for boundary-sensitive files.";
  }

  if (mode === "data") {
    if (primaryLabel && supportingLabel) {
      return `Data handling appears concentrated in ${primaryLabel} with supporting behavior in ${supportingLabel}.`;
    }
    return "The clearest data boundary is visible in a small set of files from the current evidence.";
  }

  if (mode === "dependencies") {
    if (primaryLabel && supportingLabel) {
      return `${primaryLabel} behaves like a hub module, with dependencies fanning into ${supportingLabel}.`;
    }
    return "The current evidence highlights a few hub modules that carry more weight than the rest.";
  }

  if (mode === "architecture" && topCapsule?.title) {
    return `${topCapsule.title} is the strongest architectural frame supported by the current evidence.`;
  }

  if (primaryLabel) {
    return `${primaryLabel} is the strongest starting point I can prove from the current evidence.`;
  }

  return "This is the best answer supported by the current file evidence.";
};

const buildDeterministicNarrative = ({
  mode,
  topCapsule,
  topReadingPath,
  primaryFile,
  supportingFiles,
  codegraphSummary,
}: {
  mode: RepoQuestionMode;
  topCapsule?: RepoContextCapsule;
  topReadingPath?: RepoKnowledgeGraph["reading_paths"][number];
  primaryFile?: string;
  supportingFiles: string[];
  codegraphSummary?: string;
}) => {
  const parts: string[] = [];
  const primaryLabel = primaryFile ? humanizeFileLabel(primaryFile) : "";
  const supportingLabel = formatFileLabels(supportingFiles, 3);

  if (mode === "onboarding") {
    if (topReadingPath) {
      parts.push(`${topReadingPath.title} is the cleanest reading path in the current evidence.`);
    }
    if (primaryLabel) {
      parts.push(
        `${primaryLabel} is the first file to read${supportingLabel ? `, and ${supportingLabel} should come next once the entry point makes sense` : ""}.`
      );
    }
  } else if (mode === "runtime") {
    if (primaryLabel) {
      parts.push(
        `${primaryLabel} is the strongest runtime anchor I can see${supportingLabel ? `, with the next steps touching ${supportingLabel}` : ""}.`
      );
    }
  } else if (mode === "security") {
    if (primaryLabel) {
      parts.push(
        `${primaryLabel} is the first file I would inspect for auth, inputs, secrets, or trust boundaries${supportingLabel ? `, followed by ${supportingLabel}` : ""}.`
      );
    }
    parts.push("Treat this as a proven inspection path, not a full security audit.");
  } else if (mode === "data") {
    if (primaryLabel) {
      parts.push(
        `${primaryLabel} contains one of the clearer data-handling anchors${supportingLabel ? `, with adjacent behavior in ${supportingLabel}` : ""}.`
      );
    }
  } else if (mode === "dependencies") {
    if (primaryLabel) {
      parts.push(
        `${primaryLabel} looks like a hub file${supportingLabel ? `, and the surrounding dependency surface includes ${supportingLabel}` : ""}.`
      );
    }
  } else if (primaryLabel) {
    parts.push(
      `${primaryLabel} is the strongest file anchor in the current evidence${supportingLabel ? `, with supporting context in ${supportingLabel}` : ""}.`
    );
  }

  if (topCapsule?.summary) {
    parts.push(topCapsule.summary);
  }

  if (codegraphSummary) {
    parts.push(codegraphSummary);
  }

  return normalizeText(parts.filter(Boolean).join(" "));
};

const buildDeterministicFollowUps = ({
  mode,
  primaryFile,
  supportingFiles,
  topReadingPath,
}: {
  mode: RepoQuestionMode;
  primaryFile?: string;
  supportingFiles: string[];
  topReadingPath?: RepoKnowledgeGraph["reading_paths"][number];
}) => {
  const primaryLabel = primaryFile ? humanizeFileLabel(primaryFile) : "";
  const secondaryLabel = supportingFiles[0] ? humanizeFileLabel(supportingFiles[0]) : "";

  return Array.from(
    new Set(
      [
        topReadingPath ? `Walk me through ${topReadingPath.title} step by step.` : "",
        primaryLabel ? `Explain ${primaryLabel} in plain English.` : "",
        primaryLabel && secondaryLabel
          ? `How does ${primaryLabel} connect to ${secondaryLabel}?`
          : "",
        mode === "security"
          ? "Which external inputs or secrets eventually reach storage?"
          : "Which file should I read after that?",
      ].filter(Boolean)
    )
  ).slice(0, 4);
};

const scoreCapsule = (
  capsule: RepoContextCapsule,
  tokens: string[],
  mode: RepoQuestionMode
) => {
  const haystack = [
    capsule.title,
    capsule.summary,
    capsule.teaching_goal,
    capsule.tags.join(" "),
    capsule.file_paths.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  let score = capsule.importance;
  tokens.forEach((token) => {
    if (haystack.includes(token)) score += 18;
  });

  if (mode === "security") {
    if (/(auth|token|session|secret|cookie|header|permission|security)/i.test(haystack)) score += 34;
    if (capsule.purpose === "flow" || capsule.purpose === "operations") score += 16;
  }
  if (mode === "runtime" && capsule.purpose === "flow") score += 22;
  if (mode === "architecture" && (capsule.purpose === "repo_map" || capsule.purpose === "architecture")) score += 22;
  if (mode === "onboarding" && (capsule.purpose === "hook" || capsule.purpose === "repo_map")) score += 20;
  if (mode === "dependencies" && capsule.purpose === "module") score += 16;
  if (mode === "data" && /(db|query|schema|storage|protocol|model)/i.test(haystack)) score += 20;

  return score;
};

const scoreFile = (
  filePath: string,
  tokens: string[],
  mode: RepoQuestionMode
) => {
  const lower = filePath.toLowerCase();
  let score = 0;

  tokens.forEach((token) => {
    if (lower.includes(token)) score += 16;
  });

  if (isSourceCodeFile(filePath)) score += 22;
  if (isTestFile(filePath)) score -= 20;
  if (isDocFile(filePath)) score -= 12;
  if (isConfigFile(filePath)) score -= 8;

  if (mode === "security" && /(auth|token|session|security|secret|middleware|api|header|cookie)/i.test(lower)) score += 26;
  if (mode === "runtime" && /(main|app|server|route|page|handler|controller|flow)/i.test(lower)) score += 18;
  if (mode === "architecture" && /(src|app|server|components|pages|services|lib|core)/i.test(lower)) score += 14;
  if (mode === "data" && /(db|database|schema|query|model|protocol|store)/i.test(lower)) score += 22;
  if (mode === "dependencies" && /(types|interfaces|provider|service|util|lib)/i.test(lower)) score += 14;

  return score;
};

const buildPrompt = ({
  repoName,
  question,
  mode,
  evidence,
  capsules,
  readingPaths,
  codegraphContext,
}: {
  repoName: string;
  question: string;
  mode: RepoQuestionMode;
  evidence: RepoAnswerEvidence[];
  capsules: RepoContextCapsule[];
  readingPaths: RepoKnowledgeGraph["reading_paths"];
  codegraphContext?: ReturnType<typeof buildCodegraphQuestionContext>;
}) => {
  const capsuleContext = capsules
    .map(
      (capsule, index) =>
        `${index + 1}. ${capsule.title} [${capsule.purpose}] — ${capsule.summary}`
    )
    .join("\n");

  const pathContext = readingPaths
    .slice(0, 3)
    .map(
      (path, index) =>
        `${index + 1}. ${path.title}: ${path.description} Files: ${path.file_paths.join(", ")}`
    )
    .join("\n");

  const evidenceContext = evidence
    .map(
      (item) =>
        `[${item.index}] ${item.summary}\n${item.excerpt || "(excerpt unavailable)"}`
    )
    .join("\n\n");

  const codegraphModuleContext = codegraphContext?.modules
    .map(
      (module, index) =>
        `${index + 1}. ${module.fullPath} (${module.incomingLinks} inbound, ${module.outgoingLinks} outbound, ${module.entityCount} entities)`
    )
    .join("\n");

  const codegraphEntityContext = codegraphContext?.entities
    .map(
      (entity, index) =>
        `${index + 1}. ${entity.name} in ${entity.modulePath} [${entity.entityType}] (${entity.linksIn} inbound, ${entity.linksOut} outbound)`
    )
    .join("\n");

  return `You are GitFlick Repo Q&A, a principal engineer assistant answering questions about one repository only.

Repository: ${repoName}
Question: ${question}
Mode: ${mode}

Rules:
- Answer ONLY from the supplied evidence pack.
- If the evidence does not prove something, say that clearly.
- Sound like a repo-dedicated engineering assistant, not a generic report writer.
- Answer the exact question in the first sentence.
- Keep the response concise, specific, and clean enough to fit naturally in a chat UI.
- Use plain English and mention exact file names when they matter.
- For security or breach-style questions, trace trust boundaries, inputs, auth, storage, and external calls if present.
- Keep the answer concrete and readable.
- Every trace step and finding must cite evidence indexes.
- Prefer exact conclusions over generic advice.
- Do not mention files that are not in the evidence pack.
- Keep trace_steps to at most 3.
- Keep findings to at most 3.
- Keep follow_ups narrow and repo-specific.

Return ONLY valid JSON:
{
  "verdict": "one sentence",
  "answer": "2 to 4 crisp sentences",
  "confidence": "high|medium|low",
  "trace_steps": [
    {
      "label": "short step title",
      "summary": "one short sentence about what this step proves",
      "evidence_indexes": [1, 2]
    }
  ],
  "findings": [
    {
      "title": "finding title",
      "detail": "one short sentence with a specific observation or risk",
      "severity": "high|medium|low",
      "evidence_indexes": [1]
    }
  ],
  "follow_ups": ["next narrow repo question", "next narrow repo question"]
}

Knowledge graph context:
${capsuleContext || "No capsule context."}

Reading paths:
${pathContext || "No reading paths."}

Python dependency graph context:
Modules:
${codegraphModuleContext || "No Python dependency graph context."}

Entities:
${codegraphEntityContext || "No Python entity context."}

Evidence pack:
${evidenceContext}`;
};

const buildFallbackAnswer = ({
  question,
  mode,
  evidence,
  capsules,
  readingPaths,
  codegraphContext,
}: {
  question: string;
  mode: RepoQuestionMode;
  evidence: RepoAnswerEvidence[];
  capsules: RepoContextCapsule[];
  readingPaths: RepoKnowledgeGraph["reading_paths"];
  codegraphContext?: ReturnType<typeof buildCodegraphQuestionContext>;
}): RepoInvestigationAnswer => {
  const topEvidence = evidence.slice(0, 4);
  const topCapsule = capsules[0];
  const topReadingPath = readingPaths[0];
  const codegraphSummary = describeCodegraphContext(codegraphContext);
  const focusedFiles = uniqueFilePaths(
    [
      ...topEvidence.map((item) => item.source_ref.file_path),
      ...(topReadingPath?.file_paths || []),
      ...(codegraphContext?.modules.map((module) => module.fullPath) || []),
      ...(codegraphContext?.entities.map((entity) => entity.modulePath) || []),
    ].filter(Boolean)
  ).slice(0, 6);
  const primaryFile = focusedFiles[0];
  const supportingFiles = focusedFiles.filter((filePath) => filePath !== primaryFile);

  return {
    question,
    mode,
    verdict: buildDeterministicVerdict({
      mode,
      primaryFile,
      supportingFiles,
      topCapsule,
    }),
    answer: buildDeterministicNarrative({
      mode,
      topCapsule,
      topReadingPath,
      primaryFile,
      supportingFiles,
      codegraphSummary,
    }),
    confidence: evidence.length >= 8 ? "high" : evidence.length >= 4 ? "medium" : "low",
    trace_steps: topEvidence.slice(0, 3).map((item, index) => ({
      label: `Step ${index + 1}`,
      summary: buildTraceSummary(item, mode, index),
      source_refs: [item.source_ref],
    })),
    findings: topEvidence.slice(0, 2).map((item, index) => ({
      title: buildFindingTitle(mode, index),
      detail: buildFindingDetail(item, mode, index),
      severity:
        mode === "security" ? "high" : topEvidence.length >= 4 ? "medium" : "low",
      source_refs: [item.source_ref],
    })),
    follow_ups: buildDeterministicFollowUps({
      mode,
      primaryFile,
      supportingFiles,
      topReadingPath,
    }),
    evidence: topEvidence,
    capsules: capsules.slice(0, 3).map((capsule) => ({
      id: capsule.id,
      title: capsule.title,
      purpose: capsule.purpose,
    })),
    reading_paths: readingPaths.slice(0, 2).map((path) => ({
      id: path.id,
      title: path.title,
      file_paths: path.file_paths,
    })),
    focused_files: focusedFiles,
  };
};

const isWeakAnswerText = (value: string | undefined) =>
  !value ||
  value.trim().length < 32 ||
  GENERIC_ANSWER_PATTERNS.some((pattern) => pattern.test(value));

const mapIndexesToRefs = (
  indexes: number[] | undefined,
  evidence: RepoAnswerEvidence[]
) =>
  Array.from(
    new Map(
      (indexes || [])
        .map((index) => evidence.find((item) => item.index === index))
        .filter((item): item is RepoAnswerEvidence => Boolean(item))
        .map((item) => [item.source_ref.file_path, item.source_ref] as const)
    ).values()
  );

export const investigateRepoQuestion = async ({
  question,
  repoName,
  repoContent,
  graphData,
  manifest,
}: RepoInvestigatorArgs): Promise<RepoInvestigationAnswer> => {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) {
    throw new Error("Question is required");
  }

  const fileContents = buildFileContents(repoContent, manifest);
  const evidenceBundle =
    manifest?.evidence_bundle ||
    buildRepoEvidenceBundle(repoName, fileContents, graphData);
  const knowledgeGraph =
    manifest?.knowledge_graph ||
    buildRepoKnowledgeGraph(repoName, evidenceBundle, fileContents, graphData);

  const tokens = tokenize(trimmedQuestion);
  const mode = detectMode(trimmedQuestion);
  const codegraphContext = buildCodegraphQuestionContext(graphData, tokens, mode);

  const scoredCapsules = getTutorialCapsules(knowledgeGraph)
    .map((capsule) => ({
      capsule,
      score: scoreCapsule(capsule, tokens, mode),
    }))
    .sort((a, b) => b.score - a.score);

  const selectedCapsules = scoredCapsules
    .slice(0, clamp(4 + (mode === "security" || mode === "runtime" ? 1 : 0), 4, 6))
    .map((item) => item.capsule);

  const readingPaths = knowledgeGraph.reading_paths.filter((path) => {
    const haystack = `${path.title} ${path.description} ${path.file_paths.join(" ")}`.toLowerCase();
    return tokens.some((token) => haystack.includes(token));
  });

  const fallbackReadingPaths =
    readingPaths.length > 0 ? readingPaths : knowledgeGraph.reading_paths.slice(0, 3);
  const directlyMentionedFiles = Object.keys(fileContents)
    .filter((filePath) => tokens.some((token) => filePath.toLowerCase().includes(token)))
    .sort((a, b) => scoreFile(b, tokens, mode) - scoreFile(a, tokens, mode))
    .slice(0, 6);

  const candidateFiles = Array.from(
    new Set([
      ...(codegraphContext?.modules.map((module) => module.fullPath) || []),
      ...(codegraphContext?.entities.map((entity) => entity.modulePath) || []),
      ...selectedCapsules.flatMap((capsule) => getContextFilesForCapsule(knowledgeGraph, capsule, 6)),
      ...fallbackReadingPaths.flatMap((path) => path.file_paths),
      ...directlyMentionedFiles,
      ...evidenceBundle.entry_candidates,
      ...evidenceBundle.hub_files,
      ...evidenceBundle.opener_candidates.map((candidate) => candidate.file_path),
      ...evidenceBundle.process_flows.flatMap((process) => process.steps.map((step) => step.file_path)),
    ])
  )
    .filter((filePath) => filePath && (fileContents[filePath] || evidenceBundle.source_files.includes(filePath)))
    .sort((a, b) => scoreFile(b, tokens, mode) - scoreFile(a, tokens, mode))
    .slice(0, 12);

  const expandedFiles = Array.from(
    new Set(
      candidateFiles.flatMap((filePath) => [
        filePath,
        ...getRelatedFilesForFile(graphData, filePath, evidenceBundle.repo_tree, mode === "security" ? 5 : 3),
        ...getCodegraphRelatedFiles(graphData, [filePath], mode === "security" ? 6 : 4),
      ])
    )
  )
    .filter((filePath) => filePath && (fileContents[filePath] || evidenceBundle.source_files.includes(filePath)))
    .sort((a, b) => scoreFile(b, tokens, mode) - scoreFile(a, tokens, mode))
    .slice(0, 14);

  const refs = buildSceneSourceRefs(
    expandedFiles,
    evidenceBundle,
    fileContents,
    graphData,
    `${mode} investigation`
  ).slice(0, 10);

  const extraSnippetRefs = evidenceBundle.snippet_catalog
    .map((snippet) => ({
      file_path: snippet.file_path,
      start_line: snippet.start_line,
      end_line: snippet.end_line,
      symbol_name: snippet.symbol_name,
      reason: "snippet match",
    }))
    .filter((ref) => {
      const lower = `${ref.file_path} ${getCodeExcerptForRef(fileContents, ref).toLowerCase()}`;
      return tokens.some((token) => lower.includes(token));
    })
    .slice(0, 4);

  const codegraphEntityRefs =
    codegraphContext?.entities
      .filter((entity) => fileContents[entity.modulePath])
      .map((entity) => ({
        file_path: entity.modulePath,
        start_line: entity.startLine || 1,
        end_line: entity.endLine || Math.max((entity.startLine || 1) + 10, 1),
        symbol_name: entity.name,
        reason: `${entity.entityType} dependency anchor`,
      }))
      .slice(0, 4) || [];

  const evidenceRefs = Array.from(
    new Map(
      [...refs, ...extraSnippetRefs, ...codegraphEntityRefs].map((ref) => [
        `${ref.file_path}:${ref.start_line}:${ref.end_line}`,
        ref,
      ])
    ).values()
  ).slice(0, 12);

  const evidenceItems: RepoAnswerEvidence[] = evidenceRefs.map((ref, index) => ({
    index: index + 1,
    source_ref: ref,
    excerpt: getCodeExcerptForRef(fileContents, ref).slice(0, 1600),
    summary: summarizeRef(ref, fileContents),
  }));

  if (evidenceItems.length === 0) {
    throw new Error("No code evidence was available for this question");
  }

  const baselineAnswer = buildFallbackAnswer({
    question: trimmedQuestion,
    mode,
    evidence: evidenceItems,
    capsules: selectedCapsules,
    readingPaths: fallbackReadingPaths,
    codegraphContext,
  });

  if (!GEMINI_API_KEY) {
    return baselineAnswer;
  }

  const prompt = buildPrompt({
    repoName,
    question: trimmedQuestion,
    mode,
    evidence: evidenceItems,
    capsules: selectedCapsules,
    readingPaths: fallbackReadingPaths,
    codegraphContext,
  });

  try {
    const raw = await requestGemini(prompt);
    const parsed = parseGeminiJson<RawAnswerPayload>(raw);

    const traceSteps = (parsed.trace_steps || [])
      .map((step) => {
        const sourceRefs = mapIndexesToRefs(step.evidence_indexes, evidenceItems);
        if (!step.summary || sourceRefs.length === 0) return null;
        return {
          label: step.label?.trim() || "Trace step",
          summary: step.summary.trim(),
          source_refs: sourceRefs,
        } as RepoAnswerTraceStep;
      })
      .filter((value): value is RepoAnswerTraceStep => Boolean(value))
      .slice(0, 5);

    const findings = (parsed.findings || [])
      .map((finding) => {
        const sourceRefs = mapIndexesToRefs(finding.evidence_indexes, evidenceItems);
        if (!finding.detail || sourceRefs.length === 0) return null;
        return {
          title: finding.title?.trim() || "Finding",
          detail: finding.detail.trim(),
          severity: finding.severity || "medium",
          source_refs: sourceRefs,
        } as RepoAnswerFinding;
      })
      .filter((value): value is RepoAnswerFinding => Boolean(value))
      .slice(0, 5);

    const nextFollowUps = (parsed.follow_ups || []).filter(Boolean).slice(0, 4);
    const mergedFocusedFiles = uniqueFilePaths([
      ...traceSteps.flatMap((step) => step.source_refs.map((ref) => ref.file_path)),
      ...findings.flatMap((finding) => finding.source_refs.map((ref) => ref.file_path)),
      ...baselineAnswer.focused_files,
    ]).slice(0, 6);

    const weakPayload =
      isWeakAnswerText(parsed.verdict) ||
      isWeakAnswerText(parsed.answer) ||
      (traceSteps.length === 0 && findings.length === 0);

    if (weakPayload) {
      return baselineAnswer;
    }

    return {
      question: trimmedQuestion,
      mode,
      verdict: parsed.verdict?.trim() || baselineAnswer.verdict,
      answer: parsed.answer?.trim() || baselineAnswer.answer,
      confidence: parsed.confidence || baselineAnswer.confidence,
      findings: findings.length > 0 ? findings : baselineAnswer.findings,
      trace_steps: traceSteps.length > 0 ? traceSteps : baselineAnswer.trace_steps,
      follow_ups: nextFollowUps.length > 0 ? nextFollowUps : baselineAnswer.follow_ups,
      evidence: evidenceItems,
      capsules: selectedCapsules.slice(0, 4).map((capsule) => ({
        id: capsule.id,
        title: capsule.title,
        purpose: capsule.purpose,
      })),
      reading_paths: fallbackReadingPaths.slice(0, 3).map((path) => ({
        id: path.id,
        title: path.title,
        file_paths: path.file_paths,
      })),
      focused_files: mergedFocusedFiles,
    };
  } catch (error) {
    console.warn("Repo investigation fell back to deterministic answer", error);
    return baselineAnswer;
  }
};

export const buildRepoQuestionSuggestions = (
  repoName: string,
  manifest?: VideoManifest | null,
  graphData?: GitNexusGraphData | null
) => {
  const normalizedRepoName =
    repoName
      .trim()
      .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
      .replace(/\/+$/g, "") || repoName;
  const codegraphContext = buildCodegraphQuestionContext(graphData, [], "architecture");
  const entry = manifest?.evidence_bundle?.entry_candidates?.[0] || graphData?.summary?.entryPoints?.[0];
  const hub = manifest?.evidence_bundle?.hub_files?.[0] || graphData?.summary?.hubFiles?.[0];
  const flow = manifest?.knowledge_graph?.summary.top_processes?.[0] || graphData?.processes?.[0]?.name;
  const dependencyAnchor = codegraphContext?.modules[0]?.fullPath;
  const busyEntity = codegraphContext?.entities[0];

  return [
    `Where should I start reading ${normalizedRepoName}?`,
    entry
      ? `Trace what starts in ${humanizeFileLabel(entry)}.`
      : "Trace the main runtime path through this repo.",
    "Which files handle auth, sessions, or secrets?",
    dependencyAnchor
      ? `Why is ${humanizeFileLabel(dependencyAnchor)} such a central dependency hub?`
      : "",
    hub
      ? `What makes ${humanizeFileLabel(hub)} important to the rest of the code?`
      : "Which files does the rest of the code depend on most?",
    busyEntity
      ? `What does ${busyEntity.name} in ${humanizeFileLabel(busyEntity.modulePath)} actually control?`
      : "",
    flow
      ? `Explain ${flow} in plain English and show the proving files.`
      : "Which files matter most if I want the architecture quickly?",
  ]
    .filter(Boolean)
    .slice(0, 6);
};
