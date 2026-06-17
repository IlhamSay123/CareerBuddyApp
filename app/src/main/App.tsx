import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import { Sidebar } from "./Sidebar";
import { Tracker } from "./screens/Tracker";
import { Calendar } from "./screens/Calendar";
import { Analytics } from "./screens/Analytics";
import { FileVault } from "./screens/FileVault";
import { Whiteboard } from "./screens/Whiteboard";
import { Notepad } from "./screens/Notepad";
import { AIBuddy } from "./screens/AIBuddy";
import { CoverLetter } from "./screens/CoverLetter";
import { Onboarding } from "./screens/Onboarding";
import { UpdateBanner } from "./UpdateBanner";
import { useApp } from "./store";
import { getSetting } from "../lib/db";
import { ensureNotificationPermission, runReminderCheck } from "../services/reminders";

// Bring the floating card back, then hide this window.
async function hideToCard() {
  const card = await WebviewWindow.getByLabel("card");
  if (card) {
    await card.show();
    await card.setFocus();
  }
  await getCurrentWindow().hide();
}

export function App() {
  const screen = useApp((s) => s.screen);
  const setScreen = useApp((s) => s.setScreen);
  // bumped each time the card opens us, so the entrance animation replays
  const [entrance, setEntrance] = useState(0);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    void getSetting("onboarded").then((v) => setOnboarded(v === "1"));
  }, []);

  useEffect(() => {
    const unlisten = listen("open-main", () => setEntrance((n) => n + 1));
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  // Intercept the titlebar close button: hide to the card instead of quitting.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested(async (e) => {
        e.preventDefault();
        await hideToCard();
      })
      .then((f) => {
        unlisten = f;
      });
    return () => unlisten?.();
  }, []);

  // Global reminder/deadline checker — runs while the app is alive, even when
  // minimised to the card (this window stays loaded, just hidden).
  useEffect(() => {
    let cancelled = false;
    void ensureNotificationPermission().then(() => {
      if (!cancelled) void runReminderCheck();
    });
    const id = window.setInterval(() => void runReminderCheck(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <motion.div
      key={entrance}
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="flex h-screen w-screen overflow-hidden text-white"
      style={{
        background:
          "radial-gradient(ellipse at 50% 28%, #176245 0%, #0d4730 45%, #082a1c 100%)",
      }}
    >
      <Sidebar active={screen} onSelect={setScreen} onMinimize={hideToCard} />

      <main className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={screen}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 overflow-y-auto p-6"
          >
            {screen === "tracker" ? (
              <Tracker />
            ) : screen === "calendar" ? (
              <Calendar />
            ) : screen === "analytics" ? (
              <Analytics />
            ) : screen === "files" ? (
              <FileVault />
            ) : screen === "cover" ? (
              <CoverLetter />
            ) : screen === "whiteboard" ? (
              <Whiteboard />
            ) : screen === "notes" ? (
              <Notepad />
            ) : screen === "ai" ? (
              <AIBuddy />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </main>

      {onboarded === false && <Onboarding onDone={() => setOnboarded(true)} />}
      <UpdateBanner />
    </motion.div>
  );
}
