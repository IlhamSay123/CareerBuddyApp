import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Quietly check on launch; ignore failures (offline, no release yet, dev).
    check()
      .then((u) => {
        if (u) setUpdate(u);
      })
      .catch(() => {});
  }, []);

  if (!update || dismissed) return null;

  async function install() {
    if (!update) return;
    setBusy(true);
    let total = 0;
    let got = 0;
    try {
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        else if (e.event === "Progress") {
          got += e.data.chunkLength;
          setPct(total ? Math.round((got * 100) / total) : 0);
        }
      });
      await relaunch();
    } catch {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        className="fixed left-1/2 top-3 z-[70] flex -translate-x-1/2 items-center gap-3
                   rounded-xl border border-accent/40 bg-felt-dark/95 px-4 py-2.5 shadow-2xl backdrop-blur"
      >
        <span className="text-sm font-bold text-white/90">
          {busy ? `Updating… ${pct}%` : `Update available — v${update.version}`}
        </span>
        {!busy && (
          <>
            <button
              onClick={install}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-black text-felt-dark hover:bg-accent-hover active:scale-95"
            >
              Install &amp; restart
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="text-xs font-bold text-white/40 hover:text-white"
            >
              Later
            </button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
