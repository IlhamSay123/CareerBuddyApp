import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  aiAddMemory,
  aiAddMessage,
  aiClearMessages,
  aiDeleteMemory,
  aiGetMessages,
  aiListMemories,
  aiSetMemoryPinned,
  listJobs,
  setSetting,
  type AIMessage,
} from "../../lib/db";
import {
  generateStream,
  getAIConfig,
  listOllamaModels,
  saveAIConfig,
  testConnection,
  type AIConfig,
  type ChatMsg,
  type Provider,
} from "../../services/llm";
import { useApp } from "../store";

const inputCls =
  "w-full rounded-lg bg-black/30 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-accent/60";

async function buildSystem(): Promise<string> {
  const [jobs, mems] = await Promise.all([listJobs(), aiListMemories(40)]);
  const ctx =
    jobs
      .slice(0, 20)
      .map((j) => `- ${j.role || "role"} at ${j.company || "—"} (${j.status})`)
      .join("\n") || "(no applications tracked yet)";
  const memText = mems.length
    ? mems.map((m) => `- ${m.content}`).join("\n")
    : "(none yet)";
  return [
    "You are CareerBuddy, a supportive, practical career assistant for someone job hunting.",
    "Be concise, encouraging, and specific. Use plain text, no markdown symbols.",
    "",
    "Things to remember about the user:",
    memText,
    "",
    "The user's current applications:",
    ctx,
  ].join("\n");
}

export function AIBuddy() {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const coverDraft = useApp((s) => s.coverDraft);
  const setCoverDraft = useApp((s) => s.setCoverDraft);

  async function reloadConfig() {
    setConfig(await getAIConfig());
  }

  useEffect(() => {
    void aiGetMessages().then(setMessages);
    void reloadConfig();
    // Pick up a cover-letter draft handed over from the Cover Letter page.
    if (coverDraft) {
      setInput(
        `Please help me refine this cover letter — keep it tailored and concise:\n\n---\n${coverDraft}`
      );
      setCoverDraft(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function appendToLast(tok: string) {
    setMessages((m) => {
      const last = m[m.length - 1];
      if (!last || last.role !== "assistant") return m;
      const base = last.content === "…" ? "" : last.content;
      return [...m.slice(0, -1), { ...last, content: base + tok }];
    });
  }

  async function handleCommand(text: string): Promise<boolean> {
    if (!text.startsWith("/")) return false;
    const [cmd, ...rest] = text.split(" ");
    const arg = rest.join(" ").trim();
    let reply = "";
    switch (cmd.toLowerCase()) {
      case "/remember":
        if (!arg) reply = "Usage: /remember <something to remember>";
        else {
          await aiAddMemory(arg);
          reply = `Got it — I'll remember: "${arg}"`;
        }
        break;
      case "/memories": {
        const mems = await aiListMemories(100);
        reply = mems.length
          ? "Saved memories:\n" +
            mems.map((m) => `${m.pinned ? "📌" : "•"} #${m.id} ${m.content}`).join("\n")
          : "No memories yet. Add one with /remember <fact>.";
        break;
      }
      case "/forget": {
        const id = parseInt(arg, 10);
        if (!id) reply = "Usage: /forget <id>";
        else {
          await aiDeleteMemory(id);
          reply = `Forgot memory #${id}.`;
        }
        break;
      }
      case "/pin": {
        const id = parseInt(arg, 10);
        if (!id) reply = "Usage: /pin <id>";
        else {
          await aiSetMemoryPinned(id, 1);
          reply = `Pinned memory #${id}.`;
        }
        break;
      }
      case "/unpin": {
        const id = parseInt(arg, 10);
        if (!id) reply = "Usage: /unpin <id>";
        else {
          await aiSetMemoryPinned(id, 0);
          reply = `Unpinned memory #${id}.`;
        }
        break;
      }
      case "/help":
        reply =
          "Commands:\n/remember <fact>\n/memories\n/pin <id>\n/unpin <id>\n/forget <id>";
        break;
      default:
        return false; // unknown — send as a normal message
    }
    setMessages((m) => [...m, { role: "note", content: reply, ts: "" }]);
    return true;
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    if (await handleCommand(text)) return;

    const next = [...messages, { role: "user", content: text, ts: "" }];
    setMessages([...next, { role: "assistant", content: "…", ts: "" }]);
    await aiAddMessage("user", text);
    setLoading(true);
    try {
      const system = await buildSystem();
      const history: ChatMsg[] = next
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }));
      const full = await generateStream(system, history, appendToLast);
      await aiAddMessage("assistant", full || "…");
    } catch (e) {
      appendToLast(`⚠️ ${e}`);
    } finally {
      setLoading(false);
    }
  }

  async function newChat() {
    await aiClearMessages();
    setMessages([]);
  }

  const providerBadge = !config
    ? "…"
    : config.provider === "gemini"
      ? config.geminiKey
        ? "Gemini"
        : "Gemini · no key"
      : "Ollama";

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">AI Buddy</h1>
          <p className="text-sm text-white/50">Your career corner — knows your tracker</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-black/30 px-3 py-1 text-xs font-bold text-white/60">
            {providerBadge}
          </span>
          <button
            onClick={newChat}
            className="rounded-xl bg-white/5 px-3 py-2 text-sm font-bold text-white/70 hover:bg-white/10"
          >
            New chat
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-xl bg-white/5 px-3 py-2 text-sm font-bold text-white/70 hover:bg-white/10"
          >
            ⚙ Settings
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto rounded-2xl bg-black/20 p-4 ring-1 ring-white/10">
        {messages.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-white/35">
            <div className="text-4xl">🤖</div>
            <div className="text-sm font-bold">Ask about your search, a role, interviews…</div>
            <div className="text-xs">
              {config && (config.provider === "gemini" ? !config.geminiKey : false)
                ? "Add your Gemini key in Settings to begin."
                : "Type a message below to begin."}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "self-end bg-accent/20 text-white ring-1 ring-accent/30"
                  : "self-start bg-white/5 text-white/90 ring-1 ring-white/10"
              }`}
            >
              <div className="mb-0.5 text-[10px] font-black uppercase tracking-wide text-white/35">
                {m.role === "user" ? "You" : "CareerBuddy"}
              </div>
              <div className="whitespace-pre-wrap">{m.content}</div>
            </motion.div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Ask CareerBuddy…  (Enter to send · /help for memory commands)"
          rows={2}
          className="flex-1 resize-none rounded-xl bg-black/30 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-accent/50 placeholder-white/30"
        />
        <button
          onClick={() => void send()}
          disabled={loading || !input.trim()}
          className="rounded-xl bg-accent px-5 py-3 text-sm font-black text-felt-dark hover:bg-accent-hover active:scale-95 disabled:opacity-50"
        >
          Send
        </button>
      </div>

      <AnimatePresence>
        {settingsOpen && (
          <SettingsModal
            onClose={() => setSettingsOpen(false)}
            onSaved={async () => {
              setSettingsOpen(false);
              await reloadConfig();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface SetupProgress {
  phase: string;
  percent: number;
  message: string;
}

function LocalAISetup({ model, onModel }: { model: string; onModel: (m: string) => void }) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<SetupProgress | null>(null);

  useEffect(() => {
    void invoke<boolean>("ollama_running").then(setReady);
  }, []);

  async function runSetup() {
    setBusy(true);
    setProg({ phase: "start", percent: 0, message: "Preparing…" });

    let chosen = model.trim();
    if (!chosen) {
      const ram = await invoke<number>("ai_ram_gb").catch(() => 8);
      chosen = ram >= 8 ? "llama3.1:8b" : "llama3.2:3b";
      onModel(chosen);
    }

    const unlisten = await listen<SetupProgress>("ollama-setup", (e) => setProg(e.payload));
    try {
      await invoke("setup_ollama", { model: chosen });
      await setSetting("ai_provider", "ollama");
      await setSetting("ai_ollama_model", chosen);
      setReady(true);
      setProg({ phase: "done", percent: 100, message: "Ready ✓" });
    } catch (e) {
      setProg({ phase: "error", percent: 0, message: `${e}` });
    } finally {
      unlisten();
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-lg bg-black/25 p-3 ring-1 ring-white/10">
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-white/40">
        Private local AI
      </div>
      {ready ? (
        <div className="text-sm font-bold text-status-offer">✓ Local AI is set up and running.</div>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-white/45">
            One-time setup: downloads a private AI that runs on your machine (a few minutes, a few GB).
          </p>
          <button
            onClick={runSetup}
            disabled={busy}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-black text-felt-dark hover:bg-accent-hover active:scale-95 disabled:opacity-60"
          >
            {busy ? "Setting up…" : "Set up local AI (free)"}
          </button>
        </>
      )}

      {prog && !ready && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-white/50">
            <span>{prog.message || prog.phase}</span>
            <span>{prog.percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${prog.percent}%` }}
            />
          </div>
          {prog.phase === "error" && (
            <div className="mt-1 text-[11px] text-status-rejected">{prog.message}</div>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [cfg, setCfg] = useState<AIConfig | null>(null);
  const [testMsg, setTestMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [testing, setTesting] = useState(false);
  const [detected, setDetected] = useState<string[]>([]);

  async function refreshModels() {
    setDetected(await listOllamaModels());
  }

  useEffect(() => {
    void getAIConfig().then(setCfg);
    void refreshModels();
  }, []);

  function set<K extends keyof AIConfig>(k: K, v: AIConfig[K]) {
    setCfg((c) => (c ? { ...c, [k]: v } : c));
  }

  async function runTest() {
    if (!cfg) return;
    setTesting(true);
    setTestMsg(null);
    try {
      const msg = await testConnection(cfg);
      setTestMsg({ text: msg, ok: true });
    } catch (e) {
      setTestMsg({ text: `${e}`, ok: false });
    } finally {
      setTesting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.94, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 8, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-accent/30 bg-felt-dark p-5 shadow-2xl"
      >
        <h2 className="mb-4 text-lg font-black">AI Settings</h2>

        {!cfg ? (
          <p className="text-white/50">Loading…</p>
        ) : (
          <>
            <div className="mb-3">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40">
                Provider
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(["gemini", "ollama"] as Provider[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => set("provider", p)}
                    className="rounded-lg p-2.5 text-left text-sm transition"
                    style={{
                      background: cfg.provider === p ? "rgba(231,195,91,0.15)" : "rgba(0,0,0,0.25)",
                      boxShadow:
                        cfg.provider === p
                          ? "inset 0 0 0 1px rgba(231,195,91,0.5)"
                          : "inset 0 0 0 1px rgba(255,255,255,0.08)",
                    }}
                  >
                    <div className="font-black">{p === "gemini" ? "Gemini" : "Ollama (local)"}</div>
                    <div className="mt-0.5 text-[11px] text-white/45">
                      {p === "gemini" ? "Free key from Google AI Studio" : "Runs on your machine"}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {cfg.provider === "gemini" ? (
              <>
                <label className="mb-3 block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40">
                    Gemini API key
                  </span>
                  <input
                    type="password"
                    className={inputCls}
                    value={cfg.geminiKey}
                    onChange={(e) => set("geminiKey", e.target.value)}
                    placeholder="AIza…"
                  />
                  <span className="mt-1 block text-[11px] text-white/35">
                    Get one free at aistudio.google.com → Get API key
                  </span>
                </label>
                <label className="mb-4 block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40">
                    Model
                  </span>
                  <input
                    className={inputCls}
                    value={cfg.geminiModel}
                    onChange={(e) => set("geminiModel", e.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                {detected.length > 0 && (
                  <label className="mb-3 block">
                    <span className="mb-1 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-white/40">
                      Installed models
                      <button
                        type="button"
                        onClick={refreshModels}
                        className="text-[10px] font-bold text-accent/80 hover:text-accent"
                      >
                        ↻ refresh
                      </button>
                    </span>
                    <select
                      className={inputCls}
                      value={detected.includes(cfg.ollamaModel) ? cfg.ollamaModel : ""}
                      onChange={(e) => e.target.value && set("ollamaModel", e.target.value)}
                    >
                      <option value="">— pick an installed model —</option>
                      {detected.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-[11px] text-status-offer">
                      Found {detected.length} model{detected.length === 1 ? "" : "s"} already on your machine.
                    </span>
                  </label>
                )}

                <label className="mb-3 block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40">
                    Model name
                  </span>
                  <input
                    className={inputCls}
                    value={cfg.ollamaModel}
                    onChange={(e) => set("ollamaModel", e.target.value)}
                    placeholder="llama3.1"
                  />
                  <span className="mt-1 block text-[11px] text-white/35">
                    {detected.length > 0
                      ? "Pick above, or type any model name to download a new one."
                      : "Leave blank to auto-pick by your RAM, then use Set up below."}
                  </span>
                </label>

                <LocalAISetup model={cfg.ollamaModel} onModel={(m) => set("ollamaModel", m)} />
              </>
            )}

            {testMsg && (
              <div
                className="mb-3 rounded-lg px-3 py-2 text-xs"
                style={{
                  background: testMsg.ok ? "rgba(39,174,96,0.12)" : "rgba(231,76,60,0.12)",
                  color: testMsg.ok ? "#34d27f" : "#ef6b63",
                }}
              >
                {testMsg.text}
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={runTest}
                disabled={testing}
                className="rounded-lg bg-white/5 px-3 py-2 text-sm font-bold text-white/70 hover:bg-white/10 disabled:opacity-60"
              >
                {testing ? "Testing…" : "Test connection"}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="rounded-lg bg-white/5 px-4 py-2 text-sm font-bold text-white/70 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await saveAIConfig(cfg);
                    onSaved();
                  }}
                  className="rounded-lg bg-accent px-5 py-2 text-sm font-black text-felt-dark hover:bg-accent-hover active:scale-95"
                >
                  Save
                </button>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
