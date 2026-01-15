# 🎬 Repo-to-Reel Studio

> Transform GitHub repositories into engaging video content using AI

[![gitingest](https://img.shields.io/badge/powered_by-gitingest-blue)](https://github.com/coderamp-labs/gitingest)
[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![Node 18+](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)](https://fastapi.tiangolo.com/)

---

## 🚀 Quick Start

### Installation

```bash
# 1. Install Node.js dependencies
npm install

# 2. Install Python dependencies (creates virtual environment)
npm run ingest:install
```

### Running

**Terminal 1 - Backend Server:**
```bash
npm run ingest:server
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

**Open:** `http://localhost:8080` 🎉

---

## ✨ Features

### Phase 1: Repository Ingestion ✅ COMPLETE

- ✅ **Smart URL Handling** - Paste full URLs or just `user/repo`
- ✅ **Fast Processing** - Powered by [gitingest library](https://github.com/coderamp-labs/gitingest) (13.6k ⭐)
- ✅ **30+ File Types** - Automatic detection and processing
- ✅ **Real-time Progress** - Beautiful terminal-style UI
- ✅ **Error Handling** - Helpful error messages and recovery
- ✅ **Statistics** - File counts, sizes, and processing times

### Coming Soon

- 🔄 **Phase 2:** Structure Mapping
- 🔄 **Phase 3:** Storyboard Drafting  
- 🔄 **Phase 4:** Video Generation

---

## 🛠️ Technology Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool & dev server
- **Tailwind CSS** - Styling
- **shadcn/ui** - Component library

### Backend
- **Python 3.8+** - Runtime
- **FastAPI** - Web framework
- **gitingest** - Repository processing
- **Uvicorn** - ASGI server

### Key Libraries
- [gitingest](https://github.com/coderamp-labs/gitingest) - Professional repository ingestion
- [tiktoken](https://github.com/openai/tiktoken) - Token counting
- React Router - Navigation
- Lucide Icons - Beautiful icons

---

## 📖 Documentation

- **[QUICK_START.md](QUICK_START.md)** - Get started in 5 minutes
- **[SETUP_GUIDE.md](SETUP_GUIDE.md)** - Detailed setup & troubleshooting
- **[GITINGEST_MIGRATION.md](GITINGEST_MIGRATION.md)** - Why we use gitingest
- **[PHASE1_COMPLETE.md](PHASE1_COMPLETE.md)** - Phase 1 features & testing

---

## 🎯 How It Works

### 1. **Paste GitHub URL**
```
Dashboard → Paste: facebook/react → Generate Video
```

### 2. **Repository Processing**
- Clone repository (shallow)
- Walk file tree
- Filter by file types
- Bundle content
- Calculate statistics

### 3. **Ready for AI**
- Content stored in sessionStorage
- Formatted for LLM consumption
- Ready for Phase 2 (Structure Mapping)

---

## 📊 Supported File Types

**Languages:** JavaScript, TypeScript, Python, Java, C/C++, Go, Rust, Ruby, PHP

**Frameworks:** React (.jsx/.tsx), Vue, Svelte

**Styles:** CSS, SCSS, SASS, Less

**Config:** JSON, YAML, TOML

**Docs:** Markdown, MDX, Text

**Other:** Shell scripts, SQL, GraphQL

---

## 🧪 Testing

### Test with Sample Repos

**Small (recommended for first test):**
- `facebook/create-react-app`
- `airbnb/javascript`
- `github/gitignore`

**Medium:**
- `facebook/react`
- `vercel/next.js`

### Health Check
```bash
curl http://localhost:8787/api/health
```

### Test Ingestion
```bash
curl -X POST http://localhost:8787/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"repoUrl":"https://github.com/facebook/react"}'
```

---

## 🚦 Project Status

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1** | ✅ Complete | Repository Ingestion |
| **Phase 2** | 🔄 Planned | Structure Mapping |
| **Phase 3** | 🔄 Planned | Storyboard Drafting |
| **Phase 4** | 🔄 Planned | Video Generation |

---

## 🤝 Contributing

Contributions are welcome! This project uses:

- **Frontend:** React + TypeScript
- **Backend:** Python + FastAPI
- **Libraries:** gitingest for processing

See the codebase for architecture details.

---

## 📝 License

MIT License - See LICENSE file for details

---

## 🙏 Acknowledgments

- [gitingest](https://github.com/coderamp-labs/gitingest) - Powering our repository ingestion
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful components
- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- [Vite](https://vitejs.dev/) - Lightning-fast build tool

---

## 📬 Contact & Support

- **Issues:** GitHub Issues
- **Discussions:** GitHub Discussions

---

**Made with ❤️ for developers**

Transform your code into engaging visual content! 🎬
