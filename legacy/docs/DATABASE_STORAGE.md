# Database Storage Implementation

## Overview

All user activity is now stored in the Supabase database, including:
- **TTS audio** in Supabase Storage (`project-audio` bucket) for reuse in Studio and `/v/:videoId`
- **Unique video URLs**: each project has a watch link `/v/{project_id}` (auth required, owner-only)
- Repository URLs and ingestion results
- Generated manifests
- Processing timestamps and statistics
- Everything appears as "Recent Projects" in the Dashboard

## What Gets Stored

### 1. Project Creation (When user enters URL)
- `repo_url` - Full GitHub repository URL
- `repo_name` - Repository name (e.g., "facebook/react")
- `title` - Project title
- `status` - Initial status: 'processing'
- `user_id` - User who created the project
- `created_at` - Timestamp

### 2. Phase 1 Completion (After Ingestion)
- `repo_content` - Full repository code content (TEXT)
- `ingestion_stats` - JSON object containing:
  - `includedFiles` - Number of files processed
  - `skippedFiles` - Number of files skipped
  - `totalBytes` - Total bytes processed
  - `totalBytesFormatted` - Human-readable size (e.g., "250 KB")
  - `durationMs` - Ingestion duration in milliseconds
- `phase1_completed_at` - Timestamp when Phase 1 completed

### 3. Phase 2 Completion (After Manifest Generation)
- `manifest` - Complete video manifest (JSONB)
- `duration_seconds` - Total video duration
- `phase2_completed_at` - Timestamp when Phase 2 completed
- `status` - Updated to 'ready'

## Database Schema

The `projects` table now includes:

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  repo_url TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  manifest JSONB,
  duration_seconds INTEGER,
  repo_content TEXT,              -- NEW
  ingestion_stats JSONB,          -- NEW
  phase1_completed_at TIMESTAMPTZ, -- NEW
  phase2_completed_at TIMESTAMPTZ, -- NEW
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```

## Migration

If you already have the `projects` table, run `supabase-migration.sql` to add the new columns:

```sql
ALTER TABLE projects 
  ADD COLUMN IF NOT EXISTS repo_content TEXT,
  ADD COLUMN IF NOT EXISTS ingestion_stats JSONB,
  ADD COLUMN IF NOT EXISTS phase1_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phase2_completed_at TIMESTAMPTZ;
```

## Recent Projects Display

Projects are automatically shown in the Dashboard:
- Sorted by `created_at` DESC (newest first)
- Shows all projects for the authenticated user
- Displays status, duration, and repo name
- Click to continue editing in Studio

## Data Flow

1. **User enters URL** → Project created in DB with status 'processing'
2. **Phase 1 runs** → Ingestion data saved (content + stats)
3. **Phase 2 runs** → Manifest saved, status updated to 'ready'
4. **Dashboard loads** → Shows all projects sorted by date

## Benefits

✅ **Persistent Storage**: All projects saved to database
✅ **No Data Loss**: Even if browser closes, projects are saved
✅ **Cross-Device**: Access projects from any device
✅ **History**: Complete history of all processed repositories
✅ **Statistics**: Track ingestion stats and processing times
✅ **Recent Projects**: Automatically shows newest projects first

## Storage Considerations

- **Repository Content**: Can be large (50 KB - 2 MB per repo)
- **Manifest**: Typically 10-50 KB per project
- **Supabase Free Tier**: 500 MB database (enough for ~250-500 projects)
- **Supabase Pro**: $25/month for 8 GB (enough for ~4,000-8,000 projects)

## Error Handling

- If database save fails, processing continues
- Data saved to sessionStorage as fallback
- User sees clear error messages in logs
- Projects still work even if DB save fails

## Supabase Storage (TTS audio)

Run `supabase-storage-migration.sql` in the Supabase SQL Editor to create the `project-audio` bucket and policies. When TTS is enabled, Processing uploads scene audio to `project-audio/{project_id}/{scene_id}.mp3` and saves `scene.audioUrl` in the manifest. Studio and `/v/:videoId` use these URLs so audio is not re-generated.

## Caching: same repo

For the same user and repo URL, a **ready** project is reused: Dashboard and Processing redirect to Studio instead of re-running ingestion. Use `?force=1` on the Processing URL to bypass and create a new project.
