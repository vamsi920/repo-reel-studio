# Repo-to-Reel Studio - Setup Guide

## Quick Start

### Prerequisites
- Node.js 18+ and npm installed
- Internet connection (for cloning repositories)

### Installation

1. **Install dependencies:**
```bash
npm install
```

### Running the Application

You need to run TWO servers simultaneously:

#### Terminal 1: Ingestion Server (Backend)
```bash
npm run ingest:server
```
This starts the backend server on `http://localhost:8787` that handles repository cloning and processing.

Expected output:
```
Ingestion server running on http://localhost:8787
```

#### Terminal 2: Vite Dev Server (Frontend)
```bash
npm run dev
```
This starts the React frontend on `http://localhost:8080`.

Expected output:
```
VITE v5.4.19  ready in 562 ms
➜  Local:   http://localhost:8080/
```

### Using the Application

1. **Open your browser** to `http://localhost:8080`
2. **Navigate to Dashboard** (click "Get Started")
3. **Enter a GitHub repository URL** in one of these formats:
   - Full URL: `https://github.com/facebook/react`
   - Short format: `facebook/react`
4. **Click "Generate Video"** and watch Phase 1 (Ingestion) complete!

### Testing with Sample Repositories

Try these public repositories to test the ingestion:

#### Small repos (fast testing):
- `shadowfacts/shadowfacts.github.io` - Simple blog (~20 files)
- `vercel/next.js` - Popular framework (may be large)
- `facebook/react` - React library

#### Format examples:
```
https://github.com/facebook/react
facebook/react
github.com/facebook/react
```

### Troubleshooting

#### "Missing repository URL" error
- **Cause:** URL not properly passed to processing page
- **Fix:** Now fixed with proper URL encoding/decoding

#### "Cannot connect to ingestion server" error
- **Cause:** Backend server not running
- **Fix:** Make sure Terminal 1 is running `npm run ingest:server`
- **Verify:** Visit `http://localhost:8787/api/health` - should return `{"status":"ok"}`

#### "Repository not found" error
- **Cause:** Repository doesn't exist or is private
- **Fix:** 
  - Check the URL is correct
  - Use a public repository (private repos not yet supported)
  - Try the short format: `username/repo`

#### Proxy errors in console
- **Cause:** Frontend can't reach backend
- **Fix:** 
  1. Stop both servers (Ctrl+C)
  2. Start ingestion server first
  3. Then start dev server
  4. Check both terminals for errors

#### "Ingestion failed" generic error
- **Check backend terminal** for detailed error messages
- **Common issues:**
  - Network connectivity problems
  - GitHub rate limiting (wait a few minutes)
  - Repository is too large (current limit: 12 MB)

### Configuration

#### Environment Variables (Optional)

Create a `.env` file in the project root:

```env
# Maximum total size of ingested files (default: 12 MB)
INGEST_MAX_TOTAL_BYTES=12582912

# Maximum individual file size (default: 2 MB)
INGEST_MAX_FILE_BYTES=2097152

# Ingestion server port (default: 8787)
PORT=8787
```

#### Supported File Types

The ingestion server processes these file types:
- **JavaScript/TypeScript:** .js, .ts, .jsx, .tsx
- **Other Languages:** .py, .java, .cpp, .c, .go, .rs, .rb, .php
- **Frameworks:** .vue, .svelte
- **Styles:** .css, .scss, .sass, .less
- **Config:** .json, .yaml, .yml, .toml
- **Documentation:** .md, .mdx, .txt
- **Scripts:** .sh, .bash
- **Database:** .sql
- **GraphQL:** .graphql, .gql

#### Ignored Directories

These folders are automatically skipped:
- `.git`, `node_modules`, `.next`, `dist`, `build`
- `coverage`, `.cache`, `.turbo`, `.vercel`
- `.output`, `out`, `venv`, `.venv`

### What Phase 1 Does

**Phase 1: Ingestion** performs the following steps:

1. **Validates the repository URL**
   - Ensures proper format
   - Checks protocol (http/https)
   - Converts short format to full URLs

2. **Clones the repository**
   - Uses shallow clone (depth=1) for speed
   - Downloads only the specified branch (or default)
   - Stores in temporary directory

3. **Walks the file tree**
   - Recursively scans all directories
   - Skips ignored folders
   - Filters by allowed file extensions

4. **Processes files**
   - Reads text content
   - Skips binary files
   - Enforces size limits per file and total

5. **Bundles for Gemini**
   - Concatenates all files with headers
   - Formats as: `----- FILE: path/to/file.js -----`
   - Stores in sessionStorage for Phase 2

6. **Returns statistics**
   - Files included/skipped
   - Total size
   - Processing duration

### Next Steps

After successful Phase 1 ingestion:
- Phase 2 (Structure Mapping) - Coming soon
- Phase 3 (Storyboard Drafting) - Coming soon
- Phase 4 (Video Generation) - Coming soon

### Architecture

```
┌─────────────────┐         ┌──────────────────┐
│   React App     │         │  Ingestion Server│
│  (Port 8080)    │────────▶│   (Port 8787)    │
│                 │  /api/* │                  │
│  - Dashboard    │  Proxy  │  - Clone repo    │
│  - Processing   │         │  - Process files │
│  - Studio       │         │  - Return bundle │
└─────────────────┘         └──────────────────┘
```

### Development

#### File Structure
```
repo-reel-studio/
├── src/
│   ├── pages/
│   │   ├── Dashboard.tsx    # URL input & validation
│   │   ├── Processing.tsx   # Phase 1 UI & API calls
│   │   └── Studio.tsx       # Post-ingestion editing
│   └── components/
├── server/
│   └── ingestion-server.mjs # Backend API
└── vite.config.ts           # Proxy configuration
```

#### Making Changes

1. **Frontend changes:** Edit files in `src/`, Vite will hot-reload
2. **Backend changes:** Edit `server/ingestion-server.mjs`, restart the server
3. **Both servers must be running** for full functionality

### Known Limitations

- **Private repositories:** Not yet supported (requires GitHub authentication)
- **Large repositories:** Limited to 12 MB total content
- **Binary files:** Skipped (only text files processed)
- **Rate limiting:** GitHub may throttle requests

### Getting Help

If you encounter issues:
1. Check both terminal outputs for error messages
2. Verify health endpoint: `http://localhost:8787/api/health`
3. Try a small public repository first
4. Check the browser console for client-side errors

---

**Phase 1 is now production-ready!** 🎉

Try it with your favorite GitHub repository and watch it get ingested in seconds.
