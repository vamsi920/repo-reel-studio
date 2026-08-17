// Supabase-backed project store. Every project belongs to the single global
// user (GLOBAL_USER_ID) — there is no login in this app.

import { supabase, isSupabaseConfigured, GLOBAL_USER_ID } from "./supabaseClient";
import type { GitNexusGraphData, RepoKnowledgeGraph, VideoManifest } from "./types";
import { extractRepoNameFromSource } from "./projectSource";

export interface IngestionStats {
  includedFiles: number;
  skippedFiles: number;
  totalBytes: number;
  totalBytesFormatted: string;
  durationMs: number;
}

/** BRD/FRD/Application Summary produced by the Requirements Engine for a from-scratch project. */
export interface RequirementsDocs {
  brd: string;
  frd: string;
  summary: string;
  projectType: "regulatory" | "non-regulatory" | "unknown";
  generated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  repo_url: string;
  repo_name: string;
  title: string;
  status: "processing" | "ready" | "error";
  manifest: VideoManifest | null;
  duration_seconds: number | null;
  repo_content?: string | null;
  ingestion_stats: IngestionStats | null;
  graph_data?: GitNexusGraphData | null;
  repo_knowledge_graph?: RepoKnowledgeGraph | null;
  graph_storage_path?: string | null;
  graph_created_at?: string | null;
  graph_node_count?: number | null;
  requirements_docs?: RequirementsDocs | null;
  phase1_completed_at: string | null;
  phase2_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectInsert {
  user_id: string;
  repo_url: string;
  repo_name: string;
  title: string;
  status: "processing" | "ready" | "error";
  manifest?: VideoManifest | null;
  duration_seconds?: number | null;
  repo_content?: string | null;
  ingestion_stats?: IngestionStats | null;
  graph_data?: GitNexusGraphData | null;
  repo_knowledge_graph?: RepoKnowledgeGraph | null;
  graph_storage_path?: string | null;
  graph_created_at?: string | null;
  graph_node_count?: number | null;
  requirements_docs?: RequirementsDocs | null;
  phase1_completed_at?: string | null;
  phase2_completed_at?: string | null;
}

export interface ProjectUpdate {
  status?: "processing" | "ready" | "error";
  manifest?: VideoManifest | null;
  duration_seconds?: number | null;
  title?: string;
  /** Set when attaching a real repository to a from-scratch (blueprint) project. */
  repo_url?: string;
  repo_name?: string;
  repo_content?: string | null;
  ingestion_stats?: IngestionStats | null;
  graph_data?: GitNexusGraphData | null;
  repo_knowledge_graph?: RepoKnowledgeGraph | null;
  graph_storage_path?: string | null;
  graph_created_at?: string | null;
  graph_node_count?: number | null;
  requirements_docs?: RequirementsDocs | null;
  phase1_completed_at?: string | null;
  phase2_completed_at?: string | null;
}

const TABLE = "projects";

/** Dashboard list columns — excludes repo_content/manifest/graph blobs (multi‑MB per project). */
const DASHBOARD_PROJECT_COLUMNS = [
  "id",
  "user_id",
  "repo_url",
  "repo_name",
  "title",
  "status",
  "duration_seconds",
  "ingestion_stats",
  "graph_node_count",
  "graph_created_at",
  "phase1_completed_at",
  "phase2_completed_at",
  "requirements_docs",
  "created_at",
  "updated_at",
].join(",");

/** Row shape in Postgres (snake_case, graph_node_count instead of the TS alias). */
type Row = Omit<Project, "graph_node_count"> & { graph_node_count: number | null };

function rowToProject(row: Row): Project {
  return { ...row };
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: string }).name) : "";
  const message = "message" in error ? String((error as { message?: string }).message) : "";
  return name === "AbortError" || /aborted|timeout/i.test(message);
}

function formatProjectsQueryError(error: unknown): string {
  if (isAbortError(error)) {
    return "Request timed out while loading projects. Try again — the list query was optimized to avoid huge payloads.";
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Could not fetch projects from Supabase.";
}

// Fallback in-memory store used only when Supabase isn't configured (e.g. a
// fresh checkout before .env is filled in) so the app doesn't hard-crash.
const memoryStore: Project[] = [];
function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export const projectsService = {
  async checkConnection(): Promise<{ connected: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { connected: false, error: "Supabase is not configured (VITE_SUPABASE_URL/VITE_SUPABASE_KEY missing)" };
    }
    const { error } = await supabase.from(TABLE).select("id").limit(1);
    return error ? { connected: false, error: error.message } : { connected: true };
  },

  async getAll(userId: string): Promise<Project[]> {
    if (!supabase) return memoryStore.filter((p) => p.user_id === userId);
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Row[]).map(rowToProject);
  },

  async getDashboardProjects(userId: string): Promise<Project[]> {
    if (!supabase) return memoryStore.filter((p) => p.user_id === userId);
    const { data, error } = await supabase
      .from(TABLE)
      .select(DASHBOARD_PROJECT_COLUMNS)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(formatProjectsQueryError(error));
    return (data as Row[]).map(rowToProject);
  },

  async getById(projectId: string, userId: string): Promise<Project | null> {
    if (!supabase) {
      const p = memoryStore.find((x) => x.id === projectId);
      return p && p.user_id === userId ? p : null;
    }
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? rowToProject(data as Row) : null;
  },

  async create(project: ProjectInsert): Promise<Project> {
    const now = new Date().toISOString();
    const insertRow = {
      user_id: project.user_id,
      repo_url: project.repo_url,
      repo_name: project.repo_name,
      title: project.title,
      status: project.status,
      manifest: project.manifest ?? null,
      duration_seconds: project.duration_seconds ?? null,
      repo_content: project.repo_content ?? null,
      ingestion_stats: project.ingestion_stats ?? null,
      graph_data: project.graph_data ?? null,
      repo_knowledge_graph: project.repo_knowledge_graph ?? null,
      graph_storage_path: project.graph_storage_path ?? null,
      graph_created_at: project.graph_created_at ?? null,
      graph_node_count: project.graph_node_count ?? null,
      requirements_docs: project.requirements_docs ?? null,
      phase1_completed_at: project.phase1_completed_at ?? null,
      phase2_completed_at: project.phase2_completed_at ?? null,
    };

    if (!supabase) {
      const newProject: Project = { id: uid(), created_at: now, updated_at: now, ...insertRow };
      memoryStore.push(newProject);
      return newProject;
    }

    const { data, error } = await supabase.from(TABLE).insert(insertRow).select("*").single();
    if (error) throw new Error(error.message);
    return rowToProject(data as Row);
  },

  async update(projectId: string, userId: string, updates: ProjectUpdate): Promise<Project> {
    if (!supabase) {
      const idx = memoryStore.findIndex((p) => p.id === projectId);
      if (idx === -1) throw new Error("Project not found");
      if (memoryStore[idx].user_id !== userId) throw new Error("Forbidden");
      memoryStore[idx] = { ...memoryStore[idx], ...updates, updated_at: new Date().toISOString() };
      return memoryStore[idx];
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", projectId)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Project not found");
    return rowToProject(data as Row);
  },

  async delete(projectId: string, userId: string): Promise<void> {
    if (!supabase) {
      const idx = memoryStore.findIndex((p) => p.id === projectId);
      if (idx === -1) return;
      if (memoryStore[idx].user_id !== userId) throw new Error("Forbidden");
      memoryStore.splice(idx, 1);
      return;
    }
    const { error } = await supabase.from(TABLE).delete().eq("id", projectId).eq("user_id", userId);
    if (error) throw new Error(error.message);
  },

  async getByRepoUrl(repoUrl: string, userId: string): Promise<Project | null> {
    if (!supabase) {
      const matches = memoryStore
        .filter((p) => p.user_id === userId && p.repo_url === repoUrl)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return matches[0] ?? null;
    }
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .eq("repo_url", repoUrl)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? rowToProject(data as Row) : null;
  },
};

export function formatDuration(seconds: number | null): string {
  if (!seconds) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function extractRepoName(repoUrl: string): string {
  return extractRepoNameFromSource(repoUrl);
}

export { GLOBAL_USER_ID };
