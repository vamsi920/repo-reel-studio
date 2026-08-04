// Local storage implementation — no Firebase/Firestore.

import type { GitNexusGraphData, RepoKnowledgeGraph, VideoManifest } from "./types";
import { extractRepoNameFromSource } from "./projectSource";

export interface IngestionStats {
  includedFiles: number;
  skippedFiles: number;
  totalBytes: number;
  totalBytesFormatted: string;
  durationMs: number;
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
  phase1_completed_at?: string | null;
  phase2_completed_at?: string | null;
}

export interface ProjectUpdate {
  status?: "processing" | "ready" | "error";
  manifest?: VideoManifest | null;
  duration_seconds?: number | null;
  title?: string;
  repo_content?: string | null;
  ingestion_stats?: IngestionStats | null;
  graph_data?: GitNexusGraphData | null;
  repo_knowledge_graph?: RepoKnowledgeGraph | null;
  graph_storage_path?: string | null;
  graph_created_at?: string | null;
  graph_node_count?: number | null;
  phase1_completed_at?: string | null;
  phase2_completed_at?: string | null;
}

const LS_KEY = "reel_studio_projects";

function loadAll(): Project[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Project[]) : [];
  } catch (e) {
    console.warn("[db] failed to read/parse stored projects; returning empty list:", e);
    return [];
  }
}

function saveAll(projects: Project[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(projects));
  } catch (e) {
    console.warn("[db] localStorage write failed:", e);
  }
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export const projectsService = {
  async checkConnection(): Promise<{ connected: boolean; error?: string }> {
    return { connected: true };
  },

  async getAll(userId: string): Promise<Project[]> {
    return loadAll()
      .filter((p) => p.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async getDashboardProjects(userId: string): Promise<Project[]> {
    return loadAll()
      .filter((p) => p.user_id === userId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },

  async getById(projectId: string, userId: string): Promise<Project | null> {
    const p = loadAll().find((x) => x.id === projectId);
    if (!p || p.user_id !== userId) return null;
    return p;
  },

  async create(project: ProjectInsert): Promise<Project> {
    const now = new Date().toISOString();
    const newProject: Project = {
      id: uid(),
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
      phase1_completed_at: project.phase1_completed_at ?? null,
      phase2_completed_at: project.phase2_completed_at ?? null,
      created_at: now,
      updated_at: now,
    };
    const all = loadAll();
    all.push(newProject);
    saveAll(all);
    return newProject;
  },

  async update(projectId: string, userId: string, updates: ProjectUpdate): Promise<Project> {
    const all = loadAll();
    const idx = all.findIndex((p) => p.id === projectId);
    if (idx === -1) throw new Error("Project not found");
    if (all[idx].user_id !== userId) throw new Error("Forbidden");
    const updated: Project = {
      ...all[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    all[idx] = updated;
    saveAll(all);
    return updated;
  },

  async delete(projectId: string, userId: string): Promise<void> {
    const all = loadAll();
    const idx = all.findIndex((p) => p.id === projectId);
    if (idx === -1) return;
    if (all[idx].user_id !== userId) throw new Error("Forbidden");
    all.splice(idx, 1);
    saveAll(all);
  },

  async getByRepoUrl(repoUrl: string, userId: string): Promise<Project | null> {
    const matches = loadAll()
      .filter((p) => p.user_id === userId && p.repo_url === repoUrl)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return matches[0] ?? null;
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
