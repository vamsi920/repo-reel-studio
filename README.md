# Repo-to-Reel Studio

Transform GitHub repositories into video content using Gemini 2.0.

## Quick Start

```bash
# 1. Install dependencies (one time)
npm install
npm run ingest:install

# 2. Add your Gemini API key
cp .env.example .env
# Edit .env and add your API key from https://makersuite.google.com/app/apikey

# 3. Start everything with ONE command
npm start
```

Open http://localhost:8080 and paste a GitHub URL!

## What it does

- **Phase 1:** Ingests repository using [gitingest](https://github.com/coderamp-labs/gitingest)
- **Phase 2:** Gemini 2.0 generates video manifest with auth flow & database schema
- Downloads manifest as `.txt` file automatically
- Runs both servers (backend + frontend) in one terminal

## Test it

1. Go to Dashboard
2. Paste a GitHub URL (e.g., `facebook/react`)
3. Click "Generate Video"
4. Watch Phase 1 & 2 complete
5. Manifest downloads automatically

## Requirements

- **Gemini API Key** - Get free key at https://makersuite.google.com/app/apikey
- Node.js 18+
- Python 3.8+

---

Powered by [gitingest](https://github.com/coderamp-labs/gitingest) & Gemini 2.0
