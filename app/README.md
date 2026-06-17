# CareerBuddy (Tauri edition)

The floating job-hunt deck. A small always-on-top card sits in the corner while you browse
job boards; click it to open the full tracker.

> Architecture and roadmap: see [`../docs/REBUILD_PLAN.md`](../docs/REBUILD_PLAN.md).

## Prerequisites (one-time)

1. **Node.js 18+** — https://nodejs.org
2. **Rust** — https://rustup.rs
3. **Tauri OS dependencies** — follow the prerequisites for your OS:
   https://v2.tauri.app/start/prerequisites/
   (On Windows: "Microsoft C++ Build Tools" + WebView2, which ships with Windows 11.)

## First run

```bash
cd app
npm install

# Generate app/window icons (required before the first build).
# Reuses the old card art; swap in any square PNG you like later.
npm run tauri icon ../desktop_app/assets/icons/card.png

# Launch in dev (hot-reload frontend + Rust)
npm run tauri dev
```

The **card** window appears first (top-left). Drag it anywhere; click it to open the
**main** window. Closing the main window hides it back to the card.

## Build installers

```bash
npm run tauri build
```

Produces native installers in `src-tauri/target/release/bundle/` (`.msi`/`.exe` on Windows,
`.dmg` on macOS, `.AppImage`/`.deb` on Linux).

## Project layout

```
app/
├─ index.html / card.html     # two window entry points
├─ src/
│  ├─ card/                    # floating card (drag + click-to-open)
│  ├─ main/                    # full app: Sidebar + screens
│  │  └─ screens/              # Tracker (live), others are placeholders
│  └─ lib/                     # db client (tauri-plugin-sql) + types
└─ src-tauri/
   ├─ tauri.conf.json          # window definitions, bundle, plugins
   ├─ capabilities/            # v2 permission model
   └─ src/lib.rs               # app setup + SQLite migrations
```

## Notes

- The SQLite DB (`careerbuddy.db`) is created in the OS app-data dir on first launch;
  the schema comes from the migrations in `src-tauri/src/lib.rs`.
- This scaffold was written without a local build to test against — if `npm run tauri dev`
  surfaces a version or permission error, it's almost certainly in `tauri.conf.json` or
  `capabilities/default.json`; those are the first places to look.
