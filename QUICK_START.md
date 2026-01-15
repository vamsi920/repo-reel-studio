# 🚀 Quick Start Guide - Repo-to-Reel Studio

## ✅ Prerequisites Check

Before starting, make sure you have:

- ✅ **Node.js 18+** and npm installed
- ✅ **Python 3.8+** installed (you have Python 3.14.0 ✓)
- ✅ Internet connection

---

## 🎯 Installation (One-Time Setup)

### Step 1: Install Node.js Dependencies
```bash
npm install
```

### Step 2: Install Python Dependencies
```bash
# The virtual environment and dependencies are already set up! ✓
# But if you need to reinstall:
npm run ingest:install
```

**Done!** You're ready to run the app.

---

## 🏃 Running the Application

You need **TWO terminals** running simultaneously:

### Terminal 1: Start the Ingestion Server (Python/FastAPI)

```bash
npm run ingest:server
```

**Expected Output:**
```
╔══════════════════════════════════════════════════════════════╗
║  🚀 Repo-to-Reel Ingestion Server v2.0                      ║
║  Powered by gitingest library                                ║
║  Running on http://localhost:8787                          ║
╚══════════════════════════════════════════════════════════════╝

INFO:     Started server process [12345]
INFO:     Uvicorn running on http://0.0.0.0:8787 (Press CTRL+C to quit)
```

✅ **Server is ready when you see this!**

### Terminal 2: Start the Frontend (React/Vite)

```bash
npm run dev
```

**Expected Output:**
```
VITE v5.4.19  ready in 562 ms

➜  Local:   http://localhost:8080/
➜  Network: http://10.0.0.241:8080/
```

✅ **Frontend is ready!**

---

## 🎨 Using the Application

1. **Open your browser** → `http://localhost:8080`

2. **Click "Get Started"** → Go to Dashboard

3. **Paste a GitHub repository URL:**
   - Full URL: `https://github.com/facebook/react`
   - Or short format: `facebook/react`

4. **Click "Generate Video"**

5. **Watch Phase 1 complete!** 🎉
   - Repository gets cloned
   - Files are processed
   - Content is bundled
   - Statistics are displayed

---

## 🧪 Quick Test

### Test 1: Health Check
```bash
curl http://localhost:8787/api/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "repo-ingestion-server-v2",
  "timestamp": "2026-01-15T...",
  "gitingest_available": true
}
```

### Test 2: Ingest a Repository
```bash
curl -X POST http://localhost:8787/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"repoUrl":"https://github.com/facebook/react"}'
```

---

## 📋 Sample Repositories to Try

### Small & Fast (Perfect for Testing)
- `facebook/create-react-app`
- `airbnb/javascript` 
- `github/gitignore`

### Medium Size
- `facebook/react`
- `vercel/next.js`
- `microsoft/vscode`

### What Works
- ✅ Public repositories
- ✅ Any GitHub URL format
- ✅ Short format (`user/repo`)
- ✅ Repositories of any size (with automatic size limiting)

### Not Yet Supported
- ❌ Private repositories (coming soon!)
- ❌ Non-GitHub repositories

---

## 🛠️ Troubleshooting

### ❌ "Command not found: npm run ingest:server"
**Fix:** Make sure you're in the project directory
```bash
cd /Users/vamsi/Desktop/repo-reel-studio
npm run ingest:server
```

### ❌ "Port 8787 already in use"
**Fix:** Kill any existing process on that port
```bash
lsof -ti:8787 | xargs kill -9
npm run ingest:server
```

### ❌ "Cannot connect to ingestion server"
**Checklist:**
1. Is Terminal 1 running? (`npm run ingest:server`)
2. Do you see the server startup message?
3. Test health endpoint: `curl http://localhost:8787/api/health`

### ❌ "Repository not found"
**Possible causes:**
- Typo in the repository name
- Repository is private (not yet supported)
- Repository doesn't exist

**Try:** Use the short format like `facebook/react`

### ❌ "Missing repository URL"
**This is now fixed!** But if you see it:
1. Make sure you're entering a URL in the Dashboard
2. Try reloading the page
3. Check browser console for errors

---

## 📊 What Gets Processed?

### File Types Included
- **Code:** .js, .ts, .jsx, .tsx, .py, .java, .cpp, .c, .go, .rs, .rb, .php
- **Styles:** .css, .scss, .sass, .less
- **Configs:** .json, .yaml, .yml, .toml
- **Docs:** .md, .mdx, .txt
- **Scripts:** .sh, .bash
- **Database:** .sql
- **GraphQL:** .graphql, .gql
- **Frameworks:** .vue, .svelte

### Folders Skipped
- `.git`, `node_modules`, `.next`, `dist`, `build`
- `coverage`, `.cache`, `.turbo`, `.vercel`
- `out`, `venv`, `.venv`

---

## ⚡ Performance

**Typical Processing Times:**
- Small repo (< 100 files): 2-5 seconds
- Medium repo (100-500 files): 5-15 seconds
- Large repo (500+ files): 15-30 seconds

**With gitingest library: ~2-3x faster than before!** 🚀

---

## 🎉 Success Criteria

You'll know it's working when:

1. ✅ Both servers start without errors
2. ✅ Health check returns `"status": "ok"`
3. ✅ You can access the Dashboard at `http://localhost:8080`
4. ✅ Pasting a GitHub URL and clicking "Generate Video" works
5. ✅ You see the processing animation
6. ✅ Statistics are displayed (files, size, duration)
7. ✅ You're redirected to the Studio page

---

## 💡 Pro Tips

1. **Keep both terminals visible** so you can see logs
2. **Test with small repos first** (like `facebook/create-react-app`)
3. **Check server logs** if something goes wrong
4. **Use the short format** (`user/repo`) for convenience
5. **Watch the ingestion stats** to see what's being processed

---

## 🆘 Still Having Issues?

1. **Check both terminal outputs** for error messages
2. **Verify Python version:** `python3 --version` (need 3.8+)
3. **Verify Node version:** `node --version` (need 18+)
4. **Try restarting both servers**
5. **Check the browser console** for frontend errors

---

## 📚 Additional Resources

- **Setup Guide:** `SETUP_GUIDE.md` - Detailed troubleshooting
- **Migration Guide:** `GITINGEST_MIGRATION.md` - What changed
- **Phase 1 Complete:** `PHASE1_COMPLETE.md` - Feature overview

---

## 🎯 What's Next?

After successful ingestion:
- **Phase 2:** Structure Mapping (coming soon)
- **Phase 3:** Storyboard Drafting (coming soon)
- **Phase 4:** Video Generation (coming soon)

---

**Ready to go?** Start both servers and paste a GitHub URL! 🚀
