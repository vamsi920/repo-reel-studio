# Deployment Fix Guide

## Issues Fixed

### 1. Backend Health Check ✅
- **Problem**: Server was binding to `localhost` instead of `0.0.0.0`
- **Fix**: Updated server to bind to `0.0.0.0` for Fly.io
- **Status**: ✅ Fixed and deployed

### 2. Frontend 404 Error ⚠️
- **Problem**: Frontend getting 404 when calling `/api/ingest`
- **Cause**: `VITE_API_URL` environment variable not set in Netlify
- **Solution**: Set environment variable (see below)

## Required Action: Set Netlify Environment Variable

**CRITICAL**: You must set this in Netlify for the frontend to work:

1. Go to **Netlify Dashboard** → Your Site → **Site settings** → **Environment variables**
2. Click **Add a variable**
3. Add:
   ```
   Key: VITE_API_URL
   Value: https://repo-reel-backend.fly.dev
   ```
4. Click **Save**
5. **Redeploy** your site (go to Deploys → Trigger deploy → Deploy site)

## Verification

After setting the environment variable and redeploying:

1. **Backend Health Check**: 
   ```bash
   curl https://repo-reel-backend.fly.dev/api/health
   ```
   Should return: `{"status":"ok",...}`

2. **Frontend**: 
   - Try processing a repository
   - Check the logs - it should show: `Sending POST request to https://repo-reel-backend.fly.dev/api/ingest...`
   - Should NOT show: `Sending POST request to /api/ingest...`

## Current Status

- ✅ Backend deployed and working: `https://repo-reel-backend.fly.dev`
- ✅ Health check endpoint working: `/api/health`
- ✅ Ingest endpoint working: `/api/ingest`
- ⚠️ Frontend needs `VITE_API_URL` environment variable set in Netlify

## Troubleshooting

If you still get 404 errors after setting the variable:

1. **Check the logs** - The frontend will now show the actual URL it's trying to use
2. **Verify the variable** - Make sure it's spelled exactly: `VITE_API_URL` (not `VITE_API_BASE_URL` or similar)
3. **Redeploy** - Environment variables only take effect after redeployment
4. **Check browser console** - Look for CORS errors or network errors

## Backend URLs

- Health: `https://repo-reel-backend.fly.dev/api/health`
- Ingest: `https://repo-reel-backend.fly.dev/api/ingest`
- Root: `https://repo-reel-backend.fly.dev/`
