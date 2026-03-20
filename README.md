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

### Ingestion limits (large repos)

Ingestion **caps how much of the repo** is read so the pipeline stays fast and within memory. That’s why you see many “Skipped Files” on big repos (e.g. ever-co/ever-gauzy).

| Variable                  | Default | Description                          |
| ------------------------- | ------- | ------------------------------------ |
| `INGEST_MAX_FILES`        | `120`   | Max number of source files included  |
| `INGEST_MAX_TOTAL_BYTES`  | `6291456` (6 MB) | Max total bytes of file content |
| `INGEST_MAX_FILE_BYTES`   | `524288` (512 KB) | Max size per file (larger files skipped) |

To include more of a large repo, set these in `.env` (or server env) and restart the ingestion server, e.g.:

```bash
INGEST_MAX_FILES=400
INGEST_MAX_TOTAL_BYTES=25165824
INGEST_MAX_FILE_BYTES=524288
```

(25 MB total example; increase further if the server has enough memory.)

## API surface (ingestion)

- `POST /api/ingest` with JSON body: `{ "repoUrl": "https://github.com/user/repo" }`
- Response: `{ summary, tree, content, repoUrl }`

## Troubleshooting

- Missing repository URL: ensure the URL is public and formatted as `github.com/user/repo`.
- Private repos: not yet supported without tokens.
- Timeouts on large repos: try smaller repos first, then scale up.
- Code-Graph-RAG failing: Ensure Memgraph is running, and that you followed the **[Operators & Debugging Runbook](docs/CODE_GRAPH_RAG_SETUP.md#10-operators--debugging-runbook)**!

## Notes

- Phase 1 uses [gitingest](https://github.com/coderamp-labs/gitingest) for ingestion.
- Phase 2 uses Gemini 3.0 to synthesize the video manifest.

---

GitFlick: Repo to Reel.
