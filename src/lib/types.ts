// Video Manifest Types
export interface VideoScene {
  id: number;
  type: 'intro' | 'overview' | 'entry' | 'feature' | 'code' | 'summary' | 'outro' | 'core' | 'support' | 'wrap_up';
  file_path: string;
  highlight_lines?: [number, number];
  narration_text: string;
  duration_seconds: number;
  title: string;
  code?: string;
  /** Persisted URL for TTS audio (Supabase Storage). Set when audio is uploaded. */
  audioUrl?: string;
  // Hydrated properties (added by useHydrateManifest)
  startFrame?: number;
  endFrame?: number;
}

export interface VideoManifest {
  title: string;
  scenes: VideoScene[];
  repo_files?: string[];
  // Hydrated properties
  totalFrames?: number;
  fps?: number;
}

// User Profile Types
export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

// Auth Types
export interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}
