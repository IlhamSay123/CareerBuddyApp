import { useRef } from "react";
import { motion } from "framer-motion";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";

const DRAG_THRESHOLD = 4; // px of movement before we treat it as a drag

/**
 * The floating, always-on-top card.
 *
 * Same surface handles BOTH drag and click:
 *  - pointerdown records the start position
 *  - if the pointer moves past a small threshold, we hand off to the OS-level
 *    window drag (smooth, no per-frame JS) and the gesture becomes a drag
 *  - if it never moves, pointerup is treated as a click -> open the main window
 */
export function Card() {
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);

  async function openMain() {
    const main = await WebviewWindow.getByLabel("main");
    if (main) {
      await main.show();
      await main.unminimize();
      await main.setFocus();
      await emit("open-main"); // lets the main window play its entrance animation
    }
    // The card steps aside while the full window is open; it comes back on minimise.
    await getCurrentWindow().hide();
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    start.current = { x: e.screenX, y: e.screenY };
    dragging.current = false;
  }

  async function onPointerMove(e: React.PointerEvent) {
    if (!start.current || dragging.current) return;
    const dx = Math.abs(e.screenX - start.current.x);
    const dy = Math.abs(e.screenY - start.current.y);
    if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
      dragging.current = true;
      await getCurrentWindow().startDragging(); // OS takes over from here
    }
  }

  function onPointerUp() {
    if (!dragging.current && start.current) {
      void openMain();
    }
    start.current = null;
    dragging.current = false;
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center p-2">
      <motion.div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        initial={{ scale: 0.9, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 24 }}
        whileHover={{ scale: 1.04, rotate: -1 }}
        whileTap={{ scale: 0.97 }}
        className="relative h-full w-full cursor-pointer select-none rounded-xl
                   bg-card-face text-card-ink shadow-card
                   ring-1 ring-accent/60
                   flex flex-col items-center justify-between p-2.5
                   overflow-hidden"
        style={{ boxShadow: "0 14px 36px -10px rgba(0,0,0,0.7)" }}
      >
        {/* inner gold hairline border, like a real card */}
        <div className="pointer-events-none absolute inset-1.5 rounded-lg border border-accent/40" />

        {/* top-left pip */}
        <div className="flex flex-col items-center self-start leading-none">
          <span className="text-[11px] font-black text-felt">J</span>
          <span className="text-[11px] text-felt">♣</span>
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <div className="text-3xl text-felt">♣</div>
          <div className="text-xs font-black tracking-tight">Job Deck</div>
          <div className="text-[9px] text-card-ink/40">click to deal</div>
        </div>

        {/* bottom-right pip */}
        <div className="flex flex-col items-center self-end leading-none rotate-180">
          <span className="text-[11px] font-black text-felt">J</span>
          <span className="text-[11px] text-felt">♣</span>
        </div>
      </motion.div>
    </div>
  );
}
