# Database Setup Guide

This guide will help you set up the Supabase database for GitFlick.

## Step 1: Access Supabase SQL Editor

1. Go to your Supabase project dashboard: https://supabase.com/dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**

## Step 2: Run the Schema

Copy and paste the contents of `supabase-schema.sql` into the SQL Editor and click **Run**.

This will create:
- `projects` table to store all video projects
- Indexes for faster queries
- Row Level Security (RLS) policies
- Automatic timestamp updates

## Step 3: Verify Setup

After running the schema, verify the table was created:

1. Go to **Table Editor** in Supabase dashboard
2. You should see a `projects` table
3. Check that RLS is enabled (should show a shield icon)

## Database Schema

### Projects Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (auto-generated) |
| `user_id` | UUID | Foreign key to auth.users |
| `repo_url` | TEXT | Full GitHub repository URL |
| `repo_name` | TEXT | Repository name (e.g., "facebook/react") |
| `title` | TEXT | Project title |
| `status` | TEXT | One of: 'processing', 'ready', 'error' |
| `manifest` | JSONB | Video manifest data (null until ready) |
| `duration_seconds` | INTEGER | Total video duration in seconds |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

## Security

Row Level Security (RLS) is enabled, which means:
- Users can only see their own projects
- Users can only create/update/delete their own projects
- All operations are automatically scoped to the authenticated user

## Testing

After setup, you can test by:
1. Creating a project through the app
2. Checking the `projects` table in Supabase dashboard
3. Verifying the project appears in your dashboard

## Troubleshooting

**Error: "relation projects does not exist"**
- Make sure you ran the SQL schema in Step 2

**Error: "permission denied"**
- Check that RLS policies are created correctly
- Verify you're authenticated when making requests

**Projects not showing up**
- Check browser console for errors
- Verify user_id matches your authenticated user
- Check Supabase logs for any errors
