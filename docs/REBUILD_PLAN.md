# CareerBuddy — Rebuild Plan (Tauri)

This document is the source of truth for the rebuild. The old Python app lives in
`desktop_app/` and is kept only as **reference** (data model, AI prompt logic, product design).
The real product is being built in `app/` on **Tauri v2**.

---

## 1. Why Tauri

The defining UX is a small, always-on-top "card" that floats in the corner while you browse
job boards, and expands into a full window when you click it. It has to feel premium — smooth
drag, satisfying open/close animation, light footprint.

- **Frameless / transparent / always-on-top** windows are first-class in Tauri.
- **OS-level window dragging** (`data-tauri-drag-region`) — no per-frame geometry math, no disk
  writes mid-drag (the two things that made the Python/Tkinter version choppy).
- **Animations** are just CSS / Framer Motion.
- **Tiny bundles** (~5–10 MB) using the OS webview, with a built-in **auto-updater** and
  code-signing pipeline for shipping to a userbase.

## 2. Stack

| Layer        | Choice                                  | Notes |
|--------------|-----------------------------------------|-------|
| Shell        | Tauri v2 (Rust)                         | Window mgmt, packaging, updater |
| Frontend     | React + TypeScript + Vite               | Two entry points: card + main |
| Styling      | Tailwind CSS                            | Design tokens in `tailwind.config.js` |
| Animation    | Framer Motion                           | Card morph, list transitions |
| Local DB     | `tauri-plugin-sql` (SQLite)             | Migrations in Rust, queries from TS |
| State        | Zustand (lightweight)                   | Add when screens grow |
| AI           | HTTP to a provider (later)              | See §6 |

## 3. Folder structure

```
CareerBuddyApp/
├─ desktop_app/            # OLD python app (reference only)
├─ docs/
│  └─ REBUILD_PLAN.md      # this file
└─ app/                    # NEW tauri app
   ├─ index.html           # main window entry
   ├─ card.html            # card window entry
   ├─ package.json
   ├─ vite.config.ts
   ├─ tailwind.config.js
   ├─ src/
   │  ├─ card/             # the floating card window
   │  ├─ main/             # the full app window (sidebar + screens)
   │  ├─ lib/              # db client, types, ipc helpers
   │  └─ styles.css
   └─ src-tauri/
      ├─ Cargo.toml
      ├─ tauri.conf.json   # window defs, bundle, plugins
      ├─ capabilities/     # v2 permission model
      └─ src/lib.rs        # app setup, migrations, commands
```

## 4. Window model

Two windows defined in `tauri.conf.json`:

- **`card`** — 200×280, frameless, transparent, always-on-top, `skipTaskbar`, no shadow.
  Starts visible in the corner. Dragging it moves it (OS-level). Clicking the body opens `main`.
- **`main`** — 1200×800, normal decorations, hidden on startup. Shown (with a scale/opacity
  animation on the web side) when the card is clicked. Closing it hides rather than quits, so the
  card stays as a launcher. A tray icon provides Open / Quit.

This is cleaner than the old "one window toggling `overrideredirect`" approach and lets each
window have its own bundle/animation lifecycle.

## 5. Data model (carried over from the Python SQLite schema)

Tables stay conceptually the same but are created via versioned migrations:

- `jobs` (company, role, status, link, notes, date_added)
- `reminders` (title, description, date, time, category, notified)
- `files` (filename, original_name, category, date_added)
- `notes` (singleton content)
- `settings` (key/value) — **API keys move to the OS keychain, not here**
- `ai_conversations`, `ai_messages`, `ai_memories`, `ai_summaries`

Improvements over the old layer:
- Rows are mapped to **typed objects** in TS, never positional tuples.
- File storage uses the **per-OS app-data dir**, not `os.getcwd()`.
- Schema changes go through **migrations** so existing users' data survives updates.

## 6. AI ("mini ChatGPT") — built last

Reality check for a userbase: you can't ship Ollama (multi-GB models) to everyone. Two options:

1. **BYO API key** — user pastes their own OpenAI/Anthropic/Gemini key (stored in keychain).
   Zero cost to you, simplest to ship. Good for v1.
2. **Hosted backend** — your own server holds the provider key, does rate-limiting + accounts +
   cross-device sync. Required if you want it "just works" for non-technical users. Bigger build.

The valuable logic from the Python app — memory (`/remember`, `/pin`), app-context injection
(jobs/reminders/files), cover-letter mode — is provider-agnostic and ports directly.

## 7. Roadmap

1. **Foundation** (this pass): scaffold, card+window UX, SQLite wired, Job Tracker proving the data path.
2. Calendar & reminders, File Vault (app-data dir + keychain), Analytics (web charts).
3. Notepad, Whiteboard.
4. AI Buddy (BYO key first), then cover-letter mode.
5. Polish pass: animations, empty states, keyboard shortcuts, tray.
6. Deploy: icons, signing, auto-updater, CI build for Windows/macOS.

## 8. Deployment / userbase readiness

- Tauri updater + GitHub Releases (or your own update server).
- Code signing: Windows (cert) + macOS (Apple Developer ID + notarization).
- Crash/usage telemetry (opt-in).
- Per-OS installers produced by `tauri build`.
