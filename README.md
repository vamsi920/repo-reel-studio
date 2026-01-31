# GitFlick

Repo to Reel

Turn GitHub repositories into cinematic onboarding videos with Gemini 2.0.

---

## At a glance

| Input                     | Output                          | Stack                             | Runs with              |
| ------------------------- | ------------------------------- | --------------------------------- | ---------------------- |
| GitHub URL or `user/repo` | Video manifest + studio preview | Vite + React + Remotion + FastAPI | Node 18+ + Python 3.8+ |

### Demo video

**[▶ Live demo](https://gitflick.netlify.app/studio?project=4600de3d-947b-4df6-b5fa-1bcf81ac058a)** — See GitFlick Studio in action.

## What GitFlick does

- Ingests a public GitHub repository and builds a structured content map.
- Generates a scene-by-scene video manifest with Gemini 3.0.
- Launches a visual Studio to preview, tweak, and export your video assets.

## How it works

```
Paste GitHub URL
      |
      v
Ingestion Server (gitingest)
      |
      v
Gemini 3.0 Manifest Builder
      |
      v
Studio Preview + Export
```

## Quick start

```bash
# 1. Install dependencies
npm install
npm run ingest:install

# 2. Configure Gemini
cp .env.example .env
# Add GEMINI_API_KEY in .env

# 3. Run everything
npm start
```

Open http://localhost:8080 and paste a GitHub URL.

## Project structure

```
repo-reel-studio/
  server/               # Ingestion API + gitingest
  src/                  # React UI + Studio
  public/               # Static assets
  README.md             # You are here
```

## Configuration

| Variable         | Description                                 |
| ---------------- | ------------------------------------------- |
| `GEMINI_API_KEY` | Gemini API key used for manifest generation |

## API surface (ingestion)

- `POST /api/ingest` with JSON body: `{ "repoUrl": "https://github.com/user/repo" }`
- Response: `{ summary, tree, content, repoUrl }`

## Troubleshooting

- Missing repository URL: ensure the URL is public and formatted as `github.com/user/repo`.
- Private repos: not yet supported without tokens.
- Timeouts on large repos: try smaller repos first, then scale up.

## Notes

- Phase 1 uses [gitingest](https://github.com/coderamp-labs/gitingest) for ingestion.
- Phase 2 uses Gemini 3.0 to synthesize the video manifest.

---

GitFlick: Repo to Reel.
