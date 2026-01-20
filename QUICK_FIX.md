# 🚨 QUICK FIX - Netlify 404 Error

## The Problem
Frontend is getting 404 errors because it's trying to use `/api/ingest` (proxy) instead of the Fly.io backend URL.

## The Solution (2 minutes)

### Step 1: Set Environment Variable in Netlify

1. Go to: https://app.netlify.com
2. Select your site
3. Go to: **Site settings** → **Environment variables** → **Add a variable**
4. Add:
   - **Key**: `VITE_API_URL`
   - **Value**: `https://repo-reel-backend.fly.dev`
5. Click **Save**

### Step 2: Redeploy

1. Go to **Deploys** tab
2. Click **Trigger deploy** → **Deploy site**
3. Wait for deployment to complete

### Step 3: Test

Try processing a repository again. The logs should now show:
```
Sending POST request to https://repo-reel-backend.fly.dev/api/ingest...
```

Instead of:
```
Sending POST request to /api/ingest...
```

## Why This Happens

- In **development**: Frontend uses `/api` which proxies to `localhost:8787` ✅
- In **production**: There's no proxy server, so `/api` returns 404 ❌
- **Solution**: Set `VITE_API_URL` to point directly to Fly.io backend ✅

## Backend Status

✅ Backend is running: `https://repo-reel-backend.fly.dev`
✅ Health check: `https://repo-reel-backend.fly.dev/api/health`
✅ Ingest endpoint: `https://repo-reel-backend.fly.dev/api/ingest`

The backend is working perfectly - you just need to tell the frontend where to find it!
