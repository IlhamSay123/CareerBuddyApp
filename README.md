# CareerBuddy 🃏

A private, local-first desktop app for running a job search. Track applications as
cards dealt onto a felt "dealer's table", draft tailored cover letters, store your CVs,
and chat with an AI assistant that runs **entirely on your own machine** — no accounts,
no backend, nothing leaves your device.

Built with **Tauri 2 (Rust) · React · TypeScript**.

> The app lives in [`app/`](app/). Architecture and design decisions are in
> [`docs/REBUILD_PLAN.md`](docs/REBUILD_PLAN.md).

## Features

- **Floating card widget** — an always-on-top playing card sits in the corner while you
  browse job boards; click it and it expands into the full app, drag it anywhere.
- **Dealer's Table tracker** — drag job cards between status zones (To Apply → Applied →
  Interviewing → Offer → Rejected), with a status-change timeline, search, tags, and
  per-job details (salary, location, deadline, recruiter, priority).
- **Reminders** — native desktop notifications and automatic job-deadline alerts.
- **Analytics** — applications-over-time chart and response-rate stats.
- **File Vault** — store CVs and cover letters (copied in or linked), open or export them,
  and tag CV versions to the jobs you sent them to.
- **Strategy Table** — a felt pinboard of draggable sticky-note cards for planning.
- **AI Buddy** — streaming chat that knows your tracker, with long-term memory commands.
  Runs locally via an app-managed Ollama, or on your own Google Gemini key.
- **Cover Letter generator** — pick a job + CV, generate a tailored draft, edit, export,
  and hand off to the chat to refine.

## Tech stack

| Layer     | Tools                                                           |
|-----------|-----------------------------------------------------------------|
| Shell     | Tauri 2 (Rust) — windowing, packaging, native commands          |
| Frontend  | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, Zustand|
| Data      | SQLite via `tauri-plugin-sql` with versioned migrations         |
| AI        | Ollama (local) or Google Gemini (BYO key), streamed via Tauri HTTP |

## Run locally

Prerequisites: Node 18+, Rust, and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
cd app
npm install
npm run tauri dev
```

## Build an installer

```bash
cd app
npm run tauri build
# -> app/src-tauri/target/release/bundle/nsis/CareerBuddy_x.y.z_x64-setup.exe
```

## Project structure

```
app/
├─ src/
│  ├─ card/        # the floating card window
│  ├─ main/        # main window: Sidebar + screens/ + a small Zustand store
│  ├─ lib/         # SQLite client + shared types
│  └─ services/    # LLM client + reminder scheduler
└─ src-tauri/
   ├─ src/lib.rs   # Rust commands, SQLite migrations, local-AI manager
   └─ capabilities/# Tauri v2 permission model
docs/REBUILD_PLAN.md
```

## Privacy

CareerBuddy is local-first. All data lives in your OS app-data directory. The AI runs
locally by default; if you opt into a cloud key, only your prompts (never your stored
data) are sent to that provider. There is no CareerBuddy server and no account system.
