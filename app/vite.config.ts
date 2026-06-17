import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Tauri expects a fixed port and ignores the cleared screen.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      // Don't watch the Rust side.
      ignored: ["**/src-tauri/**"],
    },
  },

  // Multi-page: the main window and the floating card are separate HTML entries.
  build: {
    rollupOptions: {
      // Relative paths resolve from the project root (where this config lives).
      input: {
        main: "index.html",
        card: "card.html",
      },
    },
    target: "esnext",
  },

  // Only env vars prefixed with these are exposed to the client.
  envPrefix: ["VITE_", "TAURI_ENV_*"],
});
