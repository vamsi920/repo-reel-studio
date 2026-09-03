<a name="readme-top"></a>

<div align="center">
  <img src="/icon.png" alt="Neo logo" width="200">
  <h1 align="center" style="border-bottom: none">Neo</h1>
  <p align="center">
    <strong>The self-hosted developer control center for coding agents and automations.</strong>
  </p>
  <p align="center">
    Run Neo's built-in agent, Claude Code, Codex, Gemini, or any ACP-compatible agent across local, remote, and cloud backends.
  </p>
</div>
<div align="center">
  <a href="https://docs.openhands.dev/openhands/usage/agent-canvas/backends"><img src="https://img.shields.io/badge/Documentation-000?logo=googledocs&logoColor=FFE165&style=for-the-badge" alt="Documentation"></a>
  <a href="https://go.openhands.dev/slack"><img src="https://img.shields.io/badge/Slack-Join%20the%20community-611f69?logo=slack&logoColor=white&style=for-the-badge" alt="Join us on Slack"></a>
</div>
<div align="center">
  <a href="#quickstart">Quickstart</a> |
  <a href="./docs/README.md">Docs</a> |
  <a href="./docs/SELF_HOSTING.md">Self-Hosting</a> |
  <a href="https://docs.openhands.dev/openhands/usage/agent-canvas/acp-agents">ACP Agents</a> |
  <a href="https://docs.openhands.dev/openhands/usage/agent-canvas/prebuilt-automations">Automations</a> |
  <a href="https://go.openhands.dev/slack">Slack</a>
</div>
<hr>

Neo turns your coding agents into a self-hosted, always-on engineering team. It's a developer control center for starting conversations and automating everyday tasks — like generating reports that publish to Slack or automatically decomposing GitHub issues into tasks.

It runs locally on your machine by default, and can connect to multiple "agent backends" — e.g. running agents in Docker containers, on VMs, or within your company infrastructure.

Neo runs its own built-in agent out-of-the-box, powered by Gemini by default, but can use any third-party agent like Claude Code and Codex.

|                                                                                                                      |                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [**Self-host your way**](https://docs.openhands.dev/openhands/usage/agent-canvas/backend-setup/vm)                   | Run agents locally, in Docker, on VMs, or anywhere you can run an agent server backend                                                   |
| [**Switch between different backends**](https://docs.openhands.dev/openhands/usage/agent-canvas/backends)            | Switch between local, remote, and cloud agents without losing focus                                                                      |
| [**Create automations**](https://docs.openhands.dev/openhands/usage/agent-canvas/prebuilt-automations)               | Create automations and workflows that integrate with Slack, GitHub, Linear, and more. Run on a schedule or in response to webhook events |
| [**Integrate with the tools you use**](https://docs.openhands.dev/openhands/usage/agent-canvas/prebuilt-automations) | Connect your automations with third-party services like Slack, GitHub, Notion, and more to automate workflows                            |
| [**Bring your own model**](https://docs.openhands.dev/openhands/usage/settings/llm-settings#llm-profiles)            | Use with any LLM (Gemini by default)                                                                                                     |
| [**Use with any agent**](https://docs.openhands.dev/openhands/usage/agent-canvas/acp-agents)                         | Use Neo's built-in agent, Claude Code, Codex, Gemini, or any agent with Agent-Client Protocol (ACP).                                |

## Quickstart

You can run Neo on any machine: on your laptop, on a dedicated computer like a Mac Mini,
or on a server in the cloud.

Notably, you can run the backend in _multiple different environments_, and switch between
them from the same Neo frontend. E.g. you can share an Agent Server with your team for agents doing
code review and dependency updates, then have your personal agents running on your laptop.

### Option 1: Without a Sandbox

> [!WARNING]
> This runs the agent-server directly on the machine you're installing on — the agent will have full access to your filesystem!

**Prerequisites**: Node.js 22.12.x or later, `uv`

```sh
npm install
cp .env.sample .env   # then set VITE_GEMINI_API_KEY — see below
npm run dev:minimal
```

> [!IMPORTANT]
> Set `VITE_GEMINI_API_KEY` in `.env` before first run (free key: https://aistudio.google.com/apikey). Neo seeds a default Gemini LLM profile from it on first boot; without it, onboarding will prompt you to configure an LLM before you can start a conversation, instead of silently falling through to an unconfigured default.

The `npm run dev:minimal` command starts the local frontend + agent server. See `package.json` for other `dev:*` variants (`dev`, `dev:static`, `dev:extra-backend`) when you want to run pieces separately or add automation support.

### Option 2: With a Docker Sandbox

**Prerequisites**:

- Docker: Docker Desktop on macOS/Windows, or Docker Engine/Docker Desktop on Linux.
- A host directory for `PROJECTS_PATH` containing the project folders you want the agent to access. Create it before starting the container.

**macOS / Linux:**

```sh
export PROJECTS_PATH="$HOME/projects"  # directory containing your project folders
mkdir -p "$PROJECTS_PATH" "$HOME/.openhands"

docker run -it --rm \
  -p 8000:8000 \
  -v "$HOME/.openhands:/home/openhands/.openhands" \
  -v "${PROJECTS_PATH}:/projects" \
  ghcr.io/openhands/agent-canvas:1.13.0 # x-release-please-version
```

> [!IMPORTANT]
> The published image is prebuilt, so `VITE_GEMINI_API_KEY` can't be baked in at `docker run` time. On first launch, the app will prompt you to configure an LLM (a Gemini key, free at https://aistudio.google.com/apikey, or any other provider) via Settings → LLM before you can start a conversation.

**Windows (PowerShell / Windows Terminal):** See [README.windows.md](./README.windows.md) for the equivalent commands.

The agent will be able to access any project under `PROJECTS_PATH`.

### Option 3: From Source

> [!WARNING]
> This runs the agent-server directly on the machine you're installing on — the agent will have full access to your filesystem!

**Prerequisites**: Node.js 22.12.x or later, `npm`, `uv` (for running the agent server via `uvx`)

This repository *is* the source — from the repo root:

```sh
npm install
cp .env.sample .env   # then set VITE_GEMINI_API_KEY — see Option 1 above
npm run dev
```

---

Access the UI at [http://localhost:8000](http://localhost:8000) for the npm/source launchers, or [http://localhost:8000/canvas](http://localhost:8000/canvas) for the Docker image. You can add additional backends directly from the UI.

# Architecture

Neo is powered by the [OpenHands Agent Server](https://github.com/OpenHands/software-agent-sdk/tree/main/openhands-agent-server/openhands/agent_server) — a real, open-source REST API for running multiple agents on a single machine, vendored in as this fork's execution backend. Each Agent Server runs on a single host/port; the frontend can connect to multiple Agent Servers and easily flip between them.

You can run an Agent Server anywhere:

- Directly on your laptop (be careful!)
- On a dedicated machine like a Mac Mini
- On a virtual machine in the cloud

The Agent Server is often paired with an [Automation Server](https://github.com/OpenHands/automation), which lets you set up agents that run on a schedule or in response to events.

## More documentation

- [Documentation index](./docs/README.md)
- [Architecture overview](./docs/architecture.md)
- [Development guide](./docs/DEVELOPMENT.md)
- [Self-hosting guide](./docs/SELF_HOSTING.md)
- [Fork notes: what Neo changed from upstream OpenHands](../UPSTREAM.md)
