// SME knowledge base — per-project store of subject-matter-expert material.
//
// Users upload or paste domain documents (specs, glossaries, compliance
// notes, product truths). The SME agent (`smeAgent.ts`) reads this corpus to
// fact-check what every pipeline step produces. Storage is local-first
// (localStorage, synchronous) mirrored best-effort to Supabase's
// `sme_documents` table — see `projectMemory.ts` for the same pattern.

import { supabase } from "./supabaseClient";

export interface SmeDocument {
  id: string;
  project_id: string;
  title: string;
  content: string;
  created_at: string;
}

const LS_KEY = "reel_studio_sme_knowledge";
const MAX_DOCS_PER_PROJECT = 40;
const MAX_DOC_CHARS = 60_000;

type DocMap = Record<string, SmeDocument[]>;

function loadAll(): DocMap {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as DocMap) : {};
  } catch {
    return {};
  }
}

function saveAll(map: DocMap): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn("[smeKnowledge] localStorage write failed:", e);
  }
}

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Supabase mirror (best-effort, never blocks or throws for callers)
// ---------------------------------------------------------------------------

function syncAddToSupabase(doc: SmeDocument): void {
  if (!supabase) return;
  void supabase.from("sme_documents").insert({
    id: doc.id,
    project_id: doc.project_id,
    title: doc.title,
    content: doc.content,
    created_at: doc.created_at,
  });
}

function syncDeleteToSupabase(docId: string): void {
  if (!supabase) return;
  void supabase.from("sme_documents").delete().eq("id", docId);
}

const hydratedProjects = new Set<string>();

function hydrateFromSupabase(projectId: string): void {
  if (!supabase || !projectId || hydratedProjects.has(projectId)) return;
  hydratedProjects.add(projectId);
  void (async () => {
    try {
      const { data, error } = await supabase!
        .from("sme_documents")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (error || !data || data.length === 0) return;

      const map = loadAll();
      const existingIds = new Set((map[projectId] || []).map((d) => d.id));
      const remoteDocs: SmeDocument[] = data.filter((row) => !existingIds.has(row.id));
      if (remoteDocs.length === 0) return;

      map[projectId] = [...(map[projectId] || []), ...remoteDocs];
      saveAll(map);
      notify(projectId);
    } catch {
      // Best-effort hydration only.
    }
  })();
}

type Listener = (docs: SmeDocument[]) => void;
const listeners = new Map<string, Set<Listener>>();

function notify(projectId: string) {
  const subs = listeners.get(projectId);
  if (!subs) return;
  const docs = getSmeDocuments(projectId);
  subs.forEach((cb) => {
    try {
      cb(docs);
    } catch {
      // Listener errors must not break writers.
    }
  });
}

export function subscribeSmeDocuments(
  projectId: string,
  cb: Listener
): () => void {
  if (!listeners.has(projectId)) listeners.set(projectId, new Set());
  listeners.get(projectId)!.add(cb);
  hydrateFromSupabase(projectId);
  return () => {
    listeners.get(projectId)?.delete(cb);
  };
}

export function addSmeDocument(
  projectId: string,
  input: { title: string; content: string }
): SmeDocument | null {
  const title = input.title?.trim();
  const content = input.content?.trim();
  if (!projectId || !title || !content) return null;

  const doc: SmeDocument = {
    id: uid(),
    project_id: projectId,
    title: title.slice(0, 160),
    content: content.slice(0, MAX_DOC_CHARS),
    created_at: new Date().toISOString(),
  };

  const map = loadAll();
  const docs = map[projectId] || [];
  docs.push(doc);
  if (docs.length > MAX_DOCS_PER_PROJECT) {
    docs.splice(0, docs.length - MAX_DOCS_PER_PROJECT);
  }
  map[projectId] = docs;
  saveAll(map);
  syncAddToSupabase(doc);
  notify(projectId);
  return doc;
}

export function getSmeDocuments(projectId: string): SmeDocument[] {
  if (!projectId) return [];
  hydrateFromSupabase(projectId);
  const docs = loadAll()[projectId] || [];
  return [...docs].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function deleteSmeDocument(projectId: string, docId: string): void {
  const map = loadAll();
  const docs = map[projectId];
  if (!docs) return;
  map[projectId] = docs.filter((d) => d.id !== docId);
  saveAll(map);
  syncDeleteToSupabase(docId);
  notify(projectId);
}

export function hasSmeMaterial(projectId: string): boolean {
  return getSmeDocuments(projectId).length > 0;
}

/** Concatenate the SME corpus into a prompt-ready block, budget-capped. */
export function buildSmeCorpusBlock(
  projectId: string,
  opts: { maxChars?: number } = {}
): string {
  const maxChars = opts.maxChars ?? 24_000;
  const docs = getSmeDocuments(projectId);
  if (docs.length === 0) return "";

  const parts: string[] = [];
  let used = 0;
  for (const doc of docs) {
    const budget = maxChars - used;
    if (budget <= 200) break;
    const body =
      doc.content.length > budget - 100
        ? `${doc.content.slice(0, budget - 100)}\n[...truncated]`
        : doc.content;
    const part = `### SME DOCUMENT: ${doc.title}\n${body}`;
    parts.push(part);
    used += part.length + 2;
  }
  return parts.join("\n\n");
}
