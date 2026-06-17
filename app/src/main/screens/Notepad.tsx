import { useEffect, useRef, useState } from "react";
import { loadNotes, saveNotes } from "../../lib/db";

export function Notepad() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const loaded = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    void loadNotes().then((c) => {
      setText(c);
      loaded.current = true;
    });
  }, []);

  function onChange(value: string) {
    setText(value);
    if (!loaded.current) return;
    setStatus("saving");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      await saveNotes(value);
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 1200);
    }, 500);
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Notepad</h1>
          <p className="text-sm text-white/50">A scratchpad that saves itself</p>
        </div>
        <span className="text-xs font-bold text-white/40">
          {status === "saving" ? "Saving…" : status === "saved" ? "✓ Saved" : ""}
        </span>
      </header>

      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Jot down anything — interview notes, questions to ask, a brag list…"
        className="flex-1 resize-none rounded-2xl bg-black/25 p-5 font-mono text-sm leading-relaxed
                   text-white/90 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-accent/40
                   placeholder-white/25"
        spellCheck
      />
    </div>
  );
}
