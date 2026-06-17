import { fetch } from "@tauri-apps/plugin-http";
import { getSetting, setSetting } from "../lib/db";

export type Provider = "gemini" | "ollama";

export interface AIConfig {
  provider: Provider;
  geminiKey: string;
  geminiModel: string;
  ollamaModel: string;
}

export interface ChatMsg {
  role: "user" | "assistant" | "system";
  content: string;
}

const DEFAULTS: AIConfig = {
  provider: "gemini",
  geminiKey: "",
  geminiModel: "gemini-2.0-flash",
  ollamaModel: "llama3.1",
};

export async function getAIConfig(): Promise<AIConfig> {
  const [provider, geminiKey, geminiModel, ollamaModel] = await Promise.all([
    getSetting("ai_provider"),
    getSetting("ai_gemini_key"),
    getSetting("ai_gemini_model"),
    getSetting("ai_ollama_model"),
  ]);
  return {
    provider: (provider as Provider) || DEFAULTS.provider,
    geminiKey: geminiKey || DEFAULTS.geminiKey,
    geminiModel: geminiModel || DEFAULTS.geminiModel,
    ollamaModel: ollamaModel || DEFAULTS.ollamaModel,
  };
}

export async function saveAIConfig(c: AIConfig): Promise<void> {
  await Promise.all([
    setSetting("ai_provider", c.provider),
    setSetting("ai_gemini_key", c.geminiKey),
    setSetting("ai_gemini_model", c.geminiModel),
    setSetting("ai_ollama_model", c.ollamaModel),
  ]);
}

/** Generate a completion from the configured provider. */
export async function generate(system: string, messages: ChatMsg[]): Promise<string> {
  const cfg = await getAIConfig();
  return cfg.provider === "ollama"
    ? ollamaGenerate(cfg, system, messages)
    : geminiGenerate(cfg, system, messages);
}

async function geminiGenerate(cfg: AIConfig, system: string, messages: ChatMsg[]): Promise<string> {
  if (!cfg.geminiKey) {
    throw new Error("No Gemini API key set — open Settings and paste your key.");
  }
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const body = {
    contents,
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.geminiModel}:generateContent?key=${encodeURIComponent(
    cfg.geminiKey
  )}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    if (res.status === 429) {
      throw new Error(
        "Gemini's free-tier limit was hit (quota/rate). Wait a minute and retry, switch to a different model, or use local AI."
      );
    }
    if (res.status === 400 && /API key/i.test(t)) {
      throw new Error("That Gemini API key looks invalid — double-check it in Settings.");
    }
    if (res.status === 403) {
      throw new Error("Gemini denied the request — the key may lack access to this model.");
    }
    if (res.status === 404) {
      throw new Error(`Model "${cfg.geminiModel}" not found — check the model name in Settings.`);
    }
    throw new Error(`Gemini error ${res.status}: ${t.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ??
    "";
  if (!text) throw new Error("Gemini returned no text (check the model name in Settings).");
  return text;
}

async function ollamaGenerate(cfg: AIConfig, system: string, messages: ChatMsg[]): Promise<string> {
  const msgs = [
    { role: "system", content: system },
    ...messages.filter((m) => m.role !== "system"),
  ];
  const res = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: cfg.ollamaModel, messages: msgs, stream: false }),
  });
  if (!res.ok) {
    throw new Error(`Ollama error ${res.status} — is Ollama running on localhost:11434?`);
  }
  const data: any = await res.json();
  return data?.message?.content ?? "";
}

/**
 * Streaming generate. Calls onToken with each chunk of text as it arrives.
 * Falls back to a single non-streaming call if the platform can't stream.
 */
export async function generateStream(
  system: string,
  messages: ChatMsg[],
  onToken: (t: string) => void
): Promise<string> {
  const cfg = await getAIConfig();
  try {
    return cfg.provider === "ollama"
      ? await ollamaStream(cfg, system, messages, onToken)
      : await geminiStream(cfg, system, messages, onToken);
  } catch {
    // Fallback: no streaming available — one shot.
    const full = await generate(system, messages);
    onToken(full);
    return full;
  }
}

async function* readLines(res: Response): AsyncGenerator<string> {
  if (!res.body) throw new Error("no stream body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      yield buf.slice(0, idx);
      buf = buf.slice(idx + 1);
    }
  }
  if (buf.trim()) yield buf;
}

async function ollamaStream(
  cfg: AIConfig,
  system: string,
  messages: ChatMsg[],
  onToken: (t: string) => void
): Promise<string> {
  const msgs = [
    { role: "system", content: system },
    ...messages.filter((m) => m.role !== "system"),
  ];
  const res = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: cfg.ollamaModel, messages: msgs, stream: true }),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}`);

  let full = "";
  for await (const line of readLines(res)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const j: any = JSON.parse(t);
      const c: string = j?.message?.content ?? "";
      if (c) {
        full += c;
        onToken(c);
      }
    } catch {
      /* ignore partial line */
    }
  }
  return full;
}

async function geminiStream(
  cfg: AIConfig,
  system: string,
  messages: ChatMsg[],
  onToken: (t: string) => void
): Promise<string> {
  if (!cfg.geminiKey) throw new Error("No Gemini API key set.");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const body = {
    contents,
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.geminiModel}:streamGenerateContent?alt=sse&key=${encodeURIComponent(
    cfg.geminiKey
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);

  let full = "";
  for await (const line of readLines(res)) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const payload = t.slice(5).trim();
    if (payload === "[DONE]") break;
    try {
      const j: any = JSON.parse(payload);
      const text: string =
        j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ??
        "";
      if (text) {
        full += text;
        onToken(text);
      }
    } catch {
      /* ignore partial line */
    }
  }
  return full;
}

/** List models already installed in the local Ollama. */
export async function listOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch("http://localhost:11434/api/tags");
    if (!res.ok) return [];
    const data: any = await res.json();
    return (data?.models ?? []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  }
}

/** Quick reachability check used by the Settings panel. */
export async function testConnection(cfg: AIConfig): Promise<string> {
  if (cfg.provider === "ollama") {
    const res = await fetch("http://localhost:11434/api/tags");
    if (!res.ok) throw new Error("Couldn't reach Ollama at localhost:11434.");
    const data: any = await res.json();
    const models = (data?.models ?? []).map((m: { name: string }) => m.name);
    return `Connected to Ollama. Installed models: ${models.join(", ") || "none"}`;
  }
  const reply = await geminiGenerate(cfg, "You are a connectivity test.", [
    { role: "user", content: "Reply with just: OK" },
  ]);
  return `Gemini reachable — replied "${reply.trim().slice(0, 40)}"`;
}
