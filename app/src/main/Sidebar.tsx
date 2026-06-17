import { motion } from "framer-motion";

export type ScreenKey =
  | "tracker"
  | "calendar"
  | "analytics"
  | "cover"
  | "files"
  | "whiteboard"
  | "notes"
  | "ai";

const NAV: { key: ScreenKey; icon: string; label: string }[] = [
  { key: "tracker", icon: "📋", label: "Job Tracker" },
  { key: "calendar", icon: "📅", label: "Calendar" },
  { key: "analytics", icon: "📊", label: "Analytics" },
  { key: "cover", icon: "✉️", label: "Cover Letter" },
  { key: "files", icon: "📁", label: "File Vault" },
  { key: "whiteboard", icon: "🃏", label: "Strategy Table" },
  { key: "notes", icon: "📝", label: "Notepad" },
  { key: "ai", icon: "🤖", label: "AI Buddy" },
];

export function Sidebar({
  active,
  onSelect,
  onMinimize,
}: {
  active: ScreenKey;
  onSelect: (k: ScreenKey) => void;
  onMinimize: () => void;
}) {
  return (
    <aside className="flex w-56 flex-col gap-1 border-r border-accent/20 bg-felt-rail/80 p-3 backdrop-blur-sm">
      <div
        data-tauri-drag-region
        className="mb-2 flex items-center justify-between px-2 py-2"
      >
        <span className="text-lg font-black tracking-tight">
          CareerBuddy <span className="text-accent">🃏</span>
        </span>
      </div>

      <button
        onClick={onMinimize}
        className="mb-3 rounded-xl bg-white/5 px-3 py-2 text-left text-sm font-bold
                   text-white/80 transition hover:bg-white/10"
      >
        ⬇ Minimise to Card
      </button>

      {NAV.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            className="relative rounded-xl px-3 py-2.5 text-left text-sm font-bold
                       text-white/85 transition hover:translate-x-0.5 hover:bg-white/10
                       active:scale-[0.98]"
          >
            {isActive && (
              <motion.span
                layoutId="nav-active"
                className="absolute inset-0 rounded-xl bg-accent/20 ring-1 ring-accent/35"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10">
              {item.icon} &nbsp;{item.label}
            </span>
          </button>
        );
      })}

      <div className="mt-auto px-2 pt-3 text-[11px] font-bold text-white/30">
        v0.1 • Tauri edition ✨
      </div>
    </aside>
  );
}
