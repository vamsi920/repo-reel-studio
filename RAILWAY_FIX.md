# Railway Backend CORS Fix

## Issues Fixed

1. **CORS Configuration** - Enhanced CORS middleware to properly handle all origins and preflight requests
2. **CORS Headers in Responses** - Added explicit CORS headers to all responses (success and error)
3. **Better Error Logging** - Added detailed logging for debugging
4. **Git Clone Timeout** - Added 60-second timeout for git clone operations
5. **Port Configuration** - Updated to use Railway's PORT environment variable (defaults to 8080)

## Changes Made

### `server/ingestion-server.mjs`

1. **Enhanced CORS middleware:**
   ```javascript
   app.use(cors({
     origin: true, // Allow all origins
     credentials: true,
     methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
     allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
     exposedHeaders: ['Content-Length', 'Content-Type'],
   }));
   app.options('*', cors()); // Handle preflight requests
   ```

2. **Explicit CORS headers in responses:**
   - Added to success responses
   - Added to error responses
   - Added to unexpected error responses

3. **Better logging:**
   - Request origin logging
   - Git clone progress logging
   - Detailed error stack traces

4. **Git clone timeout:**
   - 60-second timeout to prevent hanging requests

## Next Steps

### 1. Commit and Push Changes
```bash
git add server/ingestion-server.mjs
git commit -m "Fix CORS configuration for Railway deployment"
git push
```

### 2. Redeploy on Railway
- Railway should auto-deploy when you push
- Or manually trigger a redeploy from Railway dashboard

### 3. Verify Environment Variables in Railway
Make sure these are set in Railway:
- `PORT` - Railway will auto-set this, but verify it's being used
- Any other env vars your backend needs

### 4. Update Frontend Environment Variables
If deploying frontend to Netlify, make sure `VITE_API_URL` is set:
```
VITE_API_URL=https://repo-reel-backend-production.up.railway.app
```

### 5. Test the Backend
```bash
# Health check
curl https://repo-reel-backend-production.up.railway.app/api/health

# Test ingestion (replace with your repo)
curl -X POST https://repo-reel-backend-production.up.railway.app/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/vamsi920/sous-chef"}'
```

## Troubleshooting

### If CORS errors persist:
1. Check Railway logs for the request origin
2. Verify the frontend URL matches what's in the logs
3. Check if Railway is adding any proxy headers

### If git clone fails:
1. Check Railway logs for timeout errors
2. Verify the repository is public or token is provided
3. Check Railway's network connectivity to GitHub

### If requests timeout:
1. Check Railway resource limits (RAM/CPU)
2. Consider upgrading Railway plan for larger repos
3. Check git clone timeout (currently 60 seconds)

## Expected Behavior

After these fixes:
- ✅ Frontend can make requests to backend without CORS errors
- ✅ Backend properly handles preflight OPTIONS requests
- ✅ All responses include proper CORS headers
- ✅ Better error messages in logs for debugging
- ✅ Git clone operations timeout gracefully if they take too long
