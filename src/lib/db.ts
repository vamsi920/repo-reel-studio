import { supabase } from './supabase';
import type { VideoManifest } from './types';

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
  repo_content: string | null;
  ingestion_stats: IngestionStats | null;
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
  phase1_completed_at?: string | null;
  phase2_completed_at?: string | null;
}

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
      // Enhance error with context
      const enhancedError: any = new Error(`Failed to fetch projects: ${error.message}`);
      enhancedError.code = error.code;
      enhancedError.details = error.details;
      enhancedError.hint = error.hint;
      throw enhancedError;
    }

    return data || [];
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
    const { data, error } = await supabase
      .from('projects')
      .insert({
        ...project,
        manifest: project.manifest || null,
        duration_seconds: project.duration_seconds || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating project:', error);
      // Enhance error with more details
      const enhancedError: any = new Error(error.message || 'Failed to create project');
      enhancedError.code = error.code;
      enhancedError.details = error.details;
      enhancedError.hint = error.hint;
      throw enhancedError;
    }

    if (!data) {
      throw new Error('No data returned from insert operation');
    }

    return data;
  },

  // Update project
  async update(projectId: string, userId: string, updates: ProjectUpdate): Promise<Project> {
    const { data, error } = await supabase
      .from('projects')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating project:', error);
      throw error;
    }

    return data;
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
  try {
    const url = new URL(repoUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : repoUrl;
  } catch {
    return repoUrl;
  }
}
