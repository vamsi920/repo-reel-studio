# Railway Git Clone Optimization

## Issues Fixed

1. **Increased Timeout** - From 60s to 120s (Railway's network can be slower than local)
2. **Progress Logging** - Added progress updates every 10 seconds during git clone
3. **File Processing Optimization** - Added progress logging for file processing
4. **Better Error Messages** - More helpful timeout error messages

## Changes Made

### Timeout Increase
- **Before:** 60 seconds
- **After:** 120 seconds (2 minutes)
- **Reason:** Railway's free tier network can be slower than local development

### Progress Tracking
- Git clone progress logged every 10 seconds
- File processing progress logged every 20 files
- Better visibility into what's happening during long operations

### Optimizations
- Shallow clone (depth=1) - already optimized
- Single branch clone - already optimized
- Progress logging for large repositories

## Railway Free Tier Limitations

Railway's free tier has some limitations that can affect performance:

1. **Network Speed** - Free tier may have slower network speeds
2. **CPU Throttling** - Shared CPU resources
3. **Memory Limits** - 512MB default (can be upgraded)

## If Timeouts Persist

### Option 1: Upgrade Railway Resources (Recommended)
- Upgrade to 1GB RAM (~$5-10/month)
- Better network performance
- More reliable for larger repos

### Option 2: Use Python Backend (gitingest)
The Python version (`ingestion-server.py`) uses the `gitingest` library which might be faster:
- More optimized git operations
- Better error handling
- Used by many production systems

To switch:
1. Update Dockerfile to use Python
2. Install Python dependencies
3. Use `python3 server/ingestion-server.py` as start command

### Option 3: Optimize Repository Size
- Ensure repository is not too large
- Current limit: 12MB total processed files
- Large repos may need more time

## Testing

After deploying, test with:
```bash
curl -X POST https://repo-reel-backend-production.up.railway.app/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/vamsi920/sous-chef"}'
```

Check Railway logs to see:
- Progress updates every 10 seconds
- File processing progress
- Total duration

## Expected Behavior

- ✅ Git clone should complete within 120 seconds for most repos
- ✅ Progress updates every 10 seconds during clone
- ✅ File processing progress for large repos
- ✅ Better error messages if timeout occurs

## Monitoring

Watch Railway logs for:
- `⏳ Git clone in progress...` - Clone is working
- `✓ Git clone completed successfully` - Clone finished
- `📄 Found X files so far...` - File scanning progress
- `⚡ Processed X/Y files...` - File processing progress

If you see timeout errors, consider:
1. Repository might be too large
2. Railway network might be slow (try again)
3. Upgrade Railway resources for better performance
