import { create } from "zustand";
import type { ScreenKey } from "./Sidebar";

interface AppState {
  screen: ScreenKey;
  setScreen: (s: ScreenKey) => void;
  // Hand-off: a cover-letter draft sent from the Cover Letter page to AI Buddy.
  coverDraft: string | null;
  setCoverDraft: (d: string | null) => void;
}

export const useApp = create<AppState>((set) => ({
  screen: "tracker",
  setScreen: (screen) => set({ screen }),
  coverDraft: null,
  setCoverDraft: (coverDraft) => set({ coverDraft }),
}));
