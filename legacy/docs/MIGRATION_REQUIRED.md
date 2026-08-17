# Database Migration Required

## Issue
The application is trying to use database columns that don't exist yet. You need to run the migration SQL to add the new columns.

## Error You're Seeing
```
Could not find the 'phase2_completed_at' column of 'projects' in the schema cache
Code: PGRST204
```

## Solution

### Option 1: Run Full Migration (Recommended)
If you haven't created the `projects` table yet, run the full schema:

1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste the entire contents of `supabase-schema.sql`
3. Click **Run**

### Option 2: Run Migration Only (If table exists)
If you already have the `projects` table, run just the migration:

1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `supabase-migration.sql`
3. Click **Run**

## What Gets Added

The migration adds these columns to the `projects` table:
- `repo_content` - Full repository content from ingestion
- `ingestion_stats` - JSON object with ingestion statistics
- `phase1_completed_at` - Timestamp when Phase 1 (ingestion) completed
- `phase2_completed_at` - Timestamp when Phase 2 (manifest generation) completed

## After Migration

Once you run the migration:
1. Refresh your application
2. Try creating a new video project
3. The database errors should be gone
4. Projects will be properly saved and appear in your Dashboard

## Temporary Workaround

The application will continue to work without the migration:
- Projects will be saved to session storage
- Videos will still generate and work
- You just won't see projects in the Dashboard until migration is run

## Verify Migration

After running the migration, verify it worked:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'projects' 
AND column_name IN ('repo_content', 'ingestion_stats', 'phase1_completed_at', 'phase2_completed_at');
```

You should see all 4 columns listed.
