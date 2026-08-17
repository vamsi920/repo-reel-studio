// SME agent — an always-on subject-matter-expert reviewer.
//
// At every pipeline step (requirements, manifest generation, Repo Q&A,
// agent runs) the app calls `runSmeReview` with the produced content. The
// agent checks it against the project's SME knowledge base
// (`smeKnowledge.ts`), returns a structured verdict, records the outcome in
// per-project memory, and broadcasts live activity so any surface can show
// an "SME in action" indicator.

import { GEMINI_API_BASE, GEMINI_API_KEY, GEMINI_MODEL } from "@/env";
import { buildSmeCorpusBlock, hasSmeMaterial } from "./smeKnowledge";
import { recordProjectMemory } from "./projectMemory";
import { getCachedResponse, setCachedResponse } from "./llmCache";
import { supabase } from "./supabaseClient";

export type SmeReviewStatus =
  | "verified" // checked against SME material, no issues
  | "flagged" // factual conflicts with SME material found
  | "attention" // minor gaps / could not fully verify
  | "no_material" // project has no SME docs yet — nothing to check against
  | "error"; // reviewer itself failed (API/key issues)

export interface SmeFinding {
  severity: "high" | "medium" | "low";
  claim: string;
  issue: string;
  correction?: string;
}

export interface SmeReview {
  id: string;
  project_id: string;
  /** Pipeline step that produced the content, e.g. "requirements", "manifest", "repo-qa". */
  step: string;
  /** Human label shown in the UI, e.g. "Video narration". */
  label: string;
  status: SmeReviewStatus;
  summary: string;
  findings: SmeFinding[];
  created_at: string;
}

export type SmeActivityState = "idle" | "checking";

export interface SmeActivity {
  state: SmeActivityState;
  /** Step currently being checked when state === "checking". */
  step?: string;
  label?: string;
  lastReview?: SmeReview | null;
}

const LS_KEY = "reel_studio_sme_reviews";
const MAX_REVIEWS_PER_PROJECT = 60;

type ReviewMap = Record<string, SmeReview[]>;

function loadAll(): ReviewMap {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as ReviewMap) : {};
  } catch {
    return {};
  }
}

function saveAll(map: ReviewMap): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn("[smeAgent] localStorage write failed:", e);
  }
}

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Supabase mirror (best-effort, never blocks or throws for callers)
// ---------------------------------------------------------------------------

function syncReviewToSupabase(review: SmeReview): void {
  if (!supabase) return;
  void supabase.from("sme_reviews").insert({
    id: review.id,
    project_id: review.project_id,
    step: review.step,
    label: review.label,
    status: review.status,
    summary: review.summary,
    findings: review.findings,
    created_at: review.created_at,
  });
}

const hydratedProjects = new Set<string>();

function hydrateReviewsFromSupabase(projectId: string): void {
  if (!supabase || !projectId || hydratedProjects.has(projectId)) return;
  hydratedProjects.add(projectId);
  void (async () => {
    try {
      const { data, error } = await supabase!
        .from("sme_reviews")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (error || !data || data.length === 0) return;

      const map = loadAll();
      const existingIds = new Set((map[projectId] || []).map((r) => r.id));
      const remoteReviews: SmeReview[] = data.filter((row) => !existingIds.has(row.id));
      if (remoteReviews.length === 0) return;

      map[projectId] = [...(map[projectId] || []), ...remoteReviews];
      saveAll(map);
    } catch {
      // Best-effort hydration only.
    }
  })();
}

// ---------------------------------------------------------------------------
// Live activity (the "SME is in action" signal)
// ---------------------------------------------------------------------------

type ActivityListener = (activity: SmeActivity) => void;
const activityListeners = new Map<string, Set<ActivityListener>>();
const currentActivity = new Map<string, SmeActivity>();

function setActivity(projectId: string, activity: SmeActivity) {
  currentActivity.set(projectId, activity);
  activityListeners.get(projectId)?.forEach((cb) => {
    try {
      cb(activity);
    } catch {
      // Listener errors must not break the reviewer.
    }
  });
}

export function getSmeActivity(projectId: string): SmeActivity {
  return (
    currentActivity.get(projectId) || {
      state: "idle",
      lastReview: getSmeReviews(projectId)[0] || null,
    }
  );
}

export function subscribeSmeActivity(
  projectId: string,
  cb: ActivityListener
): () => void {
  if (!activityListeners.has(projectId)) {
    activityListeners.set(projectId, new Set());
  }
  activityListeners.get(projectId)!.add(cb);
  cb(getSmeActivity(projectId));
  return () => {
    activityListeners.get(projectId)?.delete(cb);
  };
}

// ---------------------------------------------------------------------------
// Review history
// ---------------------------------------------------------------------------

export function getSmeReviews(projectId: string): SmeReview[] {
  if (!projectId) return [];
  hydrateReviewsFromSupabase(projectId);
  const reviews = loadAll()[projectId] || [];
  return [...reviews].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function persistReview(review: SmeReview) {
  const map = loadAll();
  const reviews = map[review.project_id] || [];
  reviews.push(review);
  if (reviews.length > MAX_REVIEWS_PER_PROJECT) {
    reviews.splice(0, reviews.length - MAX_REVIEWS_PER_PROJECT);
  }
  map[review.project_id] = reviews;
  saveAll(map);
  syncReviewToSupabase(review);
}

// ---------------------------------------------------------------------------
// The reviewer
// ---------------------------------------------------------------------------

const MAX_CONTENT_CHARS = 24_000;

function buildReviewPrompt(corpus: string, label: string, content: string) {
  return `You are a rigorous Subject Matter Expert (SME) reviewer embedded in a software delivery pipeline.

Your ONLY source of truth is the SME knowledge base below. Check the produced content against it.

RULES:
- Flag statements that CONTRADICT the SME knowledge base (severity "high").
- Flag statements about the domain that the knowledge base cannot support and that look risky (severity "medium").
- Note terminology drift or minor gaps as severity "low".
- Do NOT flag generic technical statements unrelated to the SME domain.
- If everything checks out, return an empty findings array.
- Return at most 6 findings; keep every string under 200 characters.

SME KNOWLEDGE BASE:
${corpus}

CONTENT TO REVIEW (${label}):
${content.slice(0, MAX_CONTENT_CHARS)}

Respond with ONLY valid JSON (no markdown fences):
{
  "verdict": "verified" | "flagged" | "attention",
  "summary": "<one or two sentences for a project dashboard>",
  "findings": [
    { "severity": "high" | "medium" | "low", "claim": "<quoted or paraphrased claim>", "issue": "<what conflicts or is unsupported>", "correction": "<correct statement per the knowledge base, if known>" }
  ]
}`;
}

function stripFence(raw: string): string {
  return raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

async function requestGemini(prompt: string): Promise<string> {
  const response = await fetch(
    `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          topK: 40,
          topP: 0.9,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      }),
    }
  );
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty SME reviewer response");
  return text as string;
}

interface ParsedVerdict {
  verdict?: string;
  summary?: string;
  findings?: Array<Partial<SmeFinding>>;
}

/**
 * Parse the reviewer's JSON, salvaging truncated responses: try the raw
 * text, then the outermost {...} slice, then progressively repair by
 * closing dangling strings/brackets.
 */
function parseVerdict(raw: string): ParsedVerdict {
  const text = stripFence(raw);
  try {
    return JSON.parse(text) as ParsedVerdict;
  } catch {
    // Fall through to salvage attempts.
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1)) as ParsedVerdict;
    } catch {
      // Fall through.
    }
  }

  if (start !== -1) {
    // Truncated output: cut at the last complete value and close open scopes.
    let candidate = text.slice(start);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const lastComma = candidate.lastIndexOf(",");
      if (lastComma === -1) break;
      candidate = candidate.slice(0, lastComma);
      const opensCurly = (candidate.match(/{/g) || []).length;
      const closesCurly = (candidate.match(/}/g) || []).length;
      const opensSquare = (candidate.match(/\[/g) || []).length;
      const closesSquare = (candidate.match(/]/g) || []).length;
      const repaired =
        candidate +
        "]".repeat(Math.max(0, opensSquare - closesSquare)) +
        "}".repeat(Math.max(0, opensCurly - closesCurly));
      try {
        return JSON.parse(repaired) as ParsedVerdict;
      } catch {
        // Keep trimming.
      }
    }
  }

  throw new Error("Reviewer returned unparseable JSON");
}

function normalizeFindings(raw: ParsedVerdict["findings"]): SmeFinding[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f) => f && (f.claim || f.issue))
    .slice(0, 12)
    .map((f) => ({
      severity:
        f.severity === "high" || f.severity === "medium" ? f.severity : "low",
      claim: String(f.claim || "").slice(0, 400),
      issue: String(f.issue || "").slice(0, 400),
      correction: f.correction
        ? String(f.correction).slice(0, 400)
        : undefined,
    }));
}

export interface RunSmeReviewInput {
  projectId: string;
  /** Pipeline step id, e.g. "requirements" | "manifest" | "repo-qa" | "agent-run". */
  step: string;
  /** Human label for the UI. */
  label: string;
  /** The content the pipeline just produced. */
  content: string;
}

/**
 * Fact-check pipeline output against the project's SME knowledge base.
 * Never throws — an unavailable reviewer resolves to an "error" or
 * "no_material" review so pipelines are never blocked by the SME layer.
 */
export async function runSmeReview(
  input: RunSmeReviewInput
): Promise<SmeReview> {
  const { projectId, step, label, content } = input;
  const base = {
    id: uid(),
    project_id: projectId,
    step,
    label,
    created_at: new Date().toISOString(),
  };

  if (!projectId || !content?.trim() || !hasSmeMaterial(projectId)) {
    const review: SmeReview = {
      ...base,
      status: "no_material",
      summary:
        "No SME material uploaded for this project yet — add domain documents in the SME Desk to enable fact-checking.",
      findings: [],
    };
    if (projectId) {
      persistReview(review);
      setActivity(projectId, { state: "idle", lastReview: review });
    }
    return review;
  }

  setActivity(projectId, { state: "checking", step, label });

  let review: SmeReview;
  try {
    if (!GEMINI_API_KEY) {
      throw new Error("Gemini API key not configured");
    }
    const corpus = buildSmeCorpusBlock(projectId);
    const prompt = buildReviewPrompt(corpus, label, content);
    const cacheContext = `sme:${projectId}:${step}`;
    const cached = await getCachedResponse(GEMINI_MODEL, prompt, cacheContext);
    const raw = cached ?? (await requestGemini(prompt));
    if (!cached) void setCachedResponse(GEMINI_MODEL, prompt, cacheContext, raw);
    const parsed = parseVerdict(raw);
    const findings = normalizeFindings(parsed.findings);
    const verdict =
      parsed.verdict === "flagged" || parsed.verdict === "attention"
        ? parsed.verdict
        : findings.some((f) => f.severity === "high")
          ? "flagged"
          : "verified";
    review = {
      ...base,
      status: verdict,
      summary:
        parsed.summary?.slice(0, 500) ||
        (verdict === "verified"
          ? "Content is consistent with the SME knowledge base."
          : "SME review found items that need attention."),
      findings,
    };
  } catch (error) {
    review = {
      ...base,
      status: "error",
      summary: `SME reviewer unavailable: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      findings: [],
    };
  }

  persistReview(review);

  // Feed verdicts back into project memory so later steps inherit them.
  if (review.status === "flagged" || review.status === "attention") {
    const top = review.findings[0];
    recordProjectMemory(projectId, {
      kind: "sme",
      source: "sme",
      content: `SME ${review.status} on ${label}: ${review.summary}${
        top?.correction ? ` Correction: ${top.correction}` : ""
      }`,
      dedupeKey: `sme:${step}`,
    });
  } else if (review.status === "verified") {
    recordProjectMemory(projectId, {
      kind: "sme",
      source: "sme",
      content: `SME verified ${label}.`,
      dedupeKey: `sme:${step}`,
    });
  }

  setActivity(projectId, { state: "idle", lastReview: review });
  return review;
}
