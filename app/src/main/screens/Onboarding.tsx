import { useState } from "react";
import { motion } from "framer-motion";
import { setSetting } from "../../lib/db";

type Choice = "local" | "key" | "skip";

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [choice, setChoice] = useState<Choice>("local");
  const [busy, setBusy] = useState(false);

  async function finish() {
    setBusy(true);
    if (name.trim()) await setSetting("user_name", name.trim());
    if (choice === "local") await setSetting("ai_provider", "ollama");
    else if (choice === "key") await setSetting("ai_provider", "gemini");
    await setSetting("onboarded", "1");
    onDone();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{
        background:
          "radial-gradient(ellipse at 50% 30%, #176245 0%, #0d4730 45%, #082a1c 100%)",
      }}
    >
      <motion.div
        initial={{ scale: 0.92, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="w-full max-w-lg rounded-2xl border border-accent/30 bg-felt-dark/90 p-7 shadow-2xl backdrop-blur"
      >
        <div className="mb-1 text-3xl">🃏</div>
        <h1 className="text-2xl font-black">Welcome to CareerBuddy</h1>
        <p className="mb-5 text-sm text-white/55">
          Your job hunt, dealt out on the table. Let's set you up in a few seconds.
        </p>

        <label className="mb-5 block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40">
            What should we call you? (optional)
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg bg-black/30 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-accent/60 placeholder-white/30"
          />
        </label>

        <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-white/40">
          AI assistant
        </span>
        <div className="mb-6 flex flex-col gap-2">
          <OptionCard
            active={choice === "local"}
            onClick={() => setChoice("local")}
            title="Private local AI"
            badge="Free · recommended"
            desc="Runs entirely on your machine, offline and private. One-time model download, finished in AI Buddy."
          />
          <OptionCard
            active={choice === "key"}
            onClick={() => setChoice("key")}
            title="Use my own API key"
            desc="Bring a free Google Gemini key for fast cloud AI. You'll paste it in AI Buddy → Settings."
          />
          <OptionCard
            active={choice === "skip"}
            onClick={() => setChoice("skip")}
            title="Skip for now"
            desc="Set up AI later. Everything else works without it."
          />
        </div>

        <button
          onClick={finish}
          disabled={busy}
          className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-black text-felt-dark hover:bg-accent-hover active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? "Setting up…" : "Deal me in →"}
        </button>
      </motion.div>
    </motion.div>
  );
}

function OptionCard({
  active,
  onClick,
  title,
  desc,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl p-3 text-left transition"
      style={{
        background: active ? "rgba(231,195,91,0.15)" : "rgba(0,0,0,0.25)",
        boxShadow: active
          ? "inset 0 0 0 1.5px rgba(231,195,91,0.55)"
          : "inset 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-center gap-2">
        <span className="font-black">{title}</span>
        {badge && (
          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent">
            {badge}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[12px] leading-snug text-white/50">{desc}</div>
    </button>
  );
}
