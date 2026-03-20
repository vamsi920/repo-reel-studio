import { supabase } from './supabase';
import type { GitNexusGraphData, RepoKnowledgeGraph, VideoManifest } from './types';
import { extractRepoNameFromSource } from './projectSource';

// Ingestion stats type
export interface IngestionStats {
  includedFiles: number;
  skippedFiles: number;
  totalBytes: number;
  totalBytesFormatted: string;
  durationMs: number;
}

// Database Types
export interface Project {
  id: string;
  user_id: string;
  repo_url: string;
  repo_name: string;
  title: string;
  status: 'processing' | 'ready' | 'error';
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
  status: 'processing' | 'ready' | 'error';
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
  status?: 'processing' | 'ready' | 'error';
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

const OPTIONAL_PROJECT_COLUMNS = new Set([
  'repo_content',
  'ingestion_stats',
  'graph_data',
  'repo_knowledge_graph',
  'phase1_completed_at',
  'phase2_completed_at',
  'graph_storage_path',
  'graph_created_at',
  'graph_node_count',
]);

const stripUndefined = <T extends Record<string, unknown>>(payload: T) =>
  Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as T;

const extractMissingProjectColumn = (error: any): string | null => {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;

  const directMatch = message.match(/Could not find the '([^']+)' column of 'projects'/i);
  if (directMatch?.[1]) return directMatch[1];

  const schemaMatch = message.match(/column ['"]?([a-z0-9_]+)['"]?/i);
  if (schemaMatch?.[1]) return schemaMatch[1];

  return null;
};

const withProjectSchemaFallback = async <T>(
  payload: Record<string, unknown>,
  run: (safePayload: Record<string, unknown>) => Promise<{ data: T | null; error: any }>
): Promise<T> => {
  const unsupportedColumns = new Set<string>();
  let lastError: any = null;

  for (let attempt = 0; attempt < OPTIONAL_PROJECT_COLUMNS.size + 1; attempt += 1) {
    const safePayload = stripUndefined(
      Object.fromEntries(
        Object.entries(payload).filter(([key]) => !unsupportedColumns.has(key))
      )
    );

    const { data, error } = await run(safePayload);
    if (!error && data) {
      return data;
    }
    if (!error && !data) {
      throw new Error('No data returned from database operation');
    }

    const missingColumn = extractMissingProjectColumn(error);
    if (missingColumn && OPTIONAL_PROJECT_COLUMNS.has(missingColumn)) {
      unsupportedColumns.add(missingColumn);
      console.warn(`[projectsService] Retrying without unsupported column "${missingColumn}"`);
      lastError = error;
      continue;
    }

    throw error;
  }

  throw lastError || new Error('Failed to persist project after schema fallback retries');
};

// Projects CRUD Operations
export const projectsService = {
  // Check if projects table exists and is accessible
  async checkConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('projects')
        .select('id')
        .limit(1);

      if (error) {
        return { connected: false, error: error.message };
      }
      return { connected: true };
    } catch (error: any) {
      return { connected: false, error: error.message };
    }
  },

  // Get all projects for current user
  async getAll(userId: string): Promise<Project[]> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error);
      const enhancedError: any = new Error(`Failed to fetch projects: ${error.message}`);
      enhancedError.code = error.code;
      enhancedError.details = error.details;
      enhancedError.hint = error.hint;
      throw enhancedError;
    }

    return data || [];
  },

  async getDashboardProjects(userId: string): Promise<Project[]> {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        id,
        user_id,
        repo_url,
        repo_name,
        title,
        status,
        manifest,
        duration_seconds,
        ingestion_stats,
        graph_data,
        repo_knowledge_graph,
        graph_storage_path,
        graph_created_at,
        graph_node_count,
        phase1_completed_at,
        phase2_completed_at,
        created_at,
        updated_at
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching dashboard projects:', error);
      const enhancedError: any = new Error(`Failed to fetch dashboard projects: ${error.message}`);
      enhancedError.code = error.code;
      enhancedError.details = error.details;
      enhancedError.hint = error.hint;
      throw enhancedError;
    }

    return (data || []) as Project[];
  },

  // Get single project by ID
  async getById(projectId: string, userId: string): Promise<Project | null> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      console.error('Error fetching project:', error);
      throw error;
    }

    return data;
  },

  // Create new project
  async create(project: ProjectInsert): Promise<Project> {
    try {
      return await withProjectSchemaFallback<Project>(
        {
          ...project,
          manifest: project.manifest || null,
          duration_seconds: project.duration_seconds || null,
        },
        async (safePayload) =>
          await supabase
            .from('projects')
            .insert(safePayload)
            .select()
            .single()
      );
    } catch (error: any) {
      console.error('Error creating project:', error);
      const enhancedError: any = new Error(error.message || 'Failed to create project');
      enhancedError.code = error.code;
      enhancedError.details = error.details;
      enhancedError.hint = error.hint;
      throw enhancedError;
    }
  },

  // Update project
  async update(projectId: string, userId: string, updates: ProjectUpdate): Promise<Project> {
    try {
      return await withProjectSchemaFallback<Project>(
        {
          ...updates,
          updated_at: new Date().toISOString(),
        },
        async (safePayload) =>
          await supabase
            .from('projects')
            .update(safePayload)
            .eq('id', projectId)
            .eq('user_id', userId)
            .select()
            .single()
      );
    } catch (error) {
      console.error('Error updating project:', error);
      throw error;
    }
  },

  // Delete project
  async delete(projectId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting project:', error);
      throw error;
    }
  },

  // Get project by repo URL (to check if already exists)
  async getByRepoUrl(repoUrl: string, userId: string): Promise<Project | null> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('repo_url', repoUrl)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching project by repo URL:', error);
      throw error;
    }

    return data;
  },
};

// Helper function to format duration
export function formatDuration(seconds: number | null): string {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Helper function to extract repo name from URL
export function extractRepoName(repoUrl: string): string {
  return extractRepoNameFromSource(repoUrl);
}
