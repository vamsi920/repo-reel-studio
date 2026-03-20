"""
server/storage.py
=================
Server-side Supabase Storage helpers for the ingestion server.

Security model
--------------
All uploads use the **service role key** (`SUPABASE_SERVICE_ROLE_KEY`), never
the anon key.  The service role bypasses RLS so it can write to the private
buckets regardless of the project's auth state.

Object key format (canonical — mirrors src/lib/storage.ts)
-----------------------------------------------------------
  Bucket:  project-audio
  Key:     <project_id>/<scene_id>.mp3

Never hard-code paths.
"""

from __future__ import annotations

import os

# ---------------------------------------------------------------------------
# Constants — mirror src/lib/storage.ts
# ---------------------------------------------------------------------------

AUDIO_BUCKET = "project-audio"
