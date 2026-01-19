# Troubleshooting Guide

## Database Connection Issues

### Error: "relation projects does not exist"

**Solution:**
1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor**
4. Click **New Query**
5. Copy and paste the entire contents of `supabase-schema.sql`
6. Click **Run**

This will create the `projects` table and set up Row Level Security policies.

### Error: "permission denied" or "RLS policy" error

**Solution:**
1. Make sure you've run the SQL schema (see above)
2. Check that RLS is enabled:
   - Go to **Table Editor** → `projects` table
   - Click on the table settings
   - Verify **RLS Enabled** is checked
3. Verify policies exist:
   - Go to **Authentication** → **Policies**
   - You should see 4 policies for the `projects` table

### Error: "JWT" or "token" error

**Solution:**
1. Sign out and sign back in
2. Clear browser cache and localStorage
3. Check that your Supabase URL and key are correct in `.env`

### Error: "null value violates not-null constraint"

**Solution:**
This means a required field is missing. Check that:
- `user_id` is set (you're authenticated)
- `repo_url` is provided
- `repo_name` is provided
- `title` is provided
- `status` is one of: 'processing', 'ready', 'error'

## Common Issues

### Projects not showing in Dashboard

1. **Check authentication**: Make sure you're signed in
2. **Check database**: Verify projects exist in Supabase Table Editor
3. **Check RLS**: Make sure Row Level Security policies allow you to see your projects
4. **Check console**: Look for errors in browser console (F12)

### Processing works but project not saved

1. **Check logs**: Look at the processing logs for database errors
2. **Check authentication**: Make sure you're signed in before processing
3. **Check database setup**: Verify the `projects` table exists
4. **Check RLS policies**: Make sure INSERT policy is set up correctly

### "Could not save to database" warning

This warning appears when:
- Database table doesn't exist (run SQL schema)
- RLS policies not set up (run SQL schema)
- User not authenticated (sign in)
- Network/connection issue (check internet)

The app will continue working, but projects won't be saved to your account.

## Verification Steps

1. **Check table exists:**
   ```sql
   SELECT * FROM projects LIMIT 1;
   ```

2. **Check RLS enabled:**
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE tablename = 'projects';
   ```

3. **Check policies:**
   ```sql
   SELECT * FROM pg_policies 
   WHERE tablename = 'projects';
   ```

## Getting Help

If issues persist:
1. Check browser console (F12) for detailed errors
2. Check Supabase logs in Dashboard → Logs
3. Verify `.env` file has correct Supabase credentials
4. Make sure you've run the SQL schema from `supabase-schema.sql`
