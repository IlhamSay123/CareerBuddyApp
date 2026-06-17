import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { addVaultFile, listJobs, listVaultFiles, type VaultFile } from "../../lib/db";
import type { Job } from "../../lib/types";
import { generate, type ChatMsg } from "../../services/llm";
import { useApp } from "../store";

const TONES = ["Professional", "Friendly", "Enthusiastic", "Concise"] as const;
const LENGTHS = ["Short", "Medium", "Detailed"] as const;

const inputCls =
  "w-full rounded-lg bg-black/30 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-accent/60";

export function CoverLetter() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [cvs, setCvs] = useState<VaultFile[]>([]);
  const [jobId, setJobId] = useState(0);
  const [cvId, setCvId] = useState(0); // 0 = paste manually
  const [cvText, setCvText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [tone, setTone] = useState<(typeof TONES)[number]>("Professional");
  const [length, setLength] = useState<(typeof LENGTHS)[number]>("Medium");
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);

  const setScreen = useApp((s) => s.setScreen);
  const setCoverDraft = useApp((s) => s.setCoverDraft);

  useEffect(() => {
    void listJobs().then(setJobs);
    void listVaultFiles().then((files) =>
      setCvs(files.filter((f) => f.category === "CV/Resume"))
    );
  }, []);

  const job = useMemo(() => jobs.find((j) => j.id === jobId) ?? null, [jobs, jobId]);

  function showFlash(text: string, ok: boolean) {
    setFlash({ text, ok });
    window.setTimeout(() => setFlash(null), 5000);
  }

  async function onPickCv(id: number) {
    setCvId(id);
    if (id === 0) return; // manual paste
    const file = cvs.find((c) => c.id === id);
    if (!file) return;
    setExtracting(true);
    try {
      const text = await invoke<string>("extract_text", { path: file.path });
      if (text.trim()) {
        setCvText(text);
        showFlash(`Pulled ${text.length} characters from ${file.original_name}.`, true);
      } else {
        showFlash("Couldn't read text from that file — paste your CV below.", false);
      }
    } catch (e) {
      showFlash(`${e}`, false);
    } finally {
      setExtracting(false);
    }
  }

  function buildPrompt(): { system: string; messages: ChatMsg[] } {
    const jd = job
      ? [
          `Role: ${job.role || "(unspecified)"}`,
          `Company: ${job.company || "(unspecified)"}`,
          job.location ? `Location: ${job.location}` : "",
          job.work_mode ? `Work mode: ${job.work_mode}` : "",
          job.notes ? `Notes about the role: ${job.notes}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "(no job selected)";

    const system =
      "You are an expert cover-letter writer. Write a tailored cover letter using ONLY facts " +
      "present in the candidate's CV and the job details. Do not invent experience. " +
      `Tone: ${tone}. Length: ${length}. Output only the letter body in plain text — no markdown, ` +
      "no placeholders like [Your Name] unless the info is genuinely missing.";

    const user =
      `JOB DETAILS:\n${jd}\n\n` +
      `CANDIDATE CV:\n${cvText.trim() || "(none provided)"}\n\n` +
      "Write the cover letter now.";

    return { system, messages: [{ role: "user", content: user }] };
  }

  async function onGenerate() {
    if (!job) {
      showFlash("Pick a job first.", false);
      return;
    }
    if (!cvText.trim()) {
      showFlash("Add your CV — pick one from the vault or paste it.", false);
      return;
    }
    setGenerating(true);
    setDraft("");
    try {
      const { system, messages } = buildPrompt();
      const out = await generate(system, messages);
      setDraft(out);
    } catch (e) {
      showFlash(`${e}`, false);
    } finally {
      setGenerating(false);
    }
  }

  async function onExport() {
    if (!draft.trim()) return;
    const name = `Cover Letter - ${job?.company || "job"}.txt`;
    const dest = await save({ defaultPath: name });
    if (!dest) return;
    try {
      await invoke("write_text_file", { path: dest, content: draft });
      showFlash("Exported.", true);
    } catch (e) {
      showFlash(`Export failed: ${e}`, false);
    }
  }

  async function onSaveToVault() {
    if (!draft.trim()) return;
    const name = `Cover Letter - ${job?.company || "job"}.txt`;
    try {
      const path = await invoke<string>("save_to_vault", { name, content: draft });
      await addVaultFile({
        path,
        original_name: name,
        category: "Cover Letter",
        mode: "copy",
        job_id: jobId,
      });
      showFlash("Saved to File Vault.", true);
    } catch (e) {
      showFlash(`Save failed: ${e}`, false);
    }
  }

  function refineInChat() {
    if (!draft.trim()) return;
    setCoverDraft(draft);
    setScreen("ai");
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <header className="mb-4">
        <h1 className="text-2xl font-black">Cover Letter</h1>
        <p className="text-sm text-white/50">Tailor a letter from a job card and your CV</p>
      </header>

      {flash && (
        <div
          className="mb-4 rounded-xl px-4 py-2 text-sm"
          style={{
            background: flash.ok ? "rgba(39,174,96,0.12)" : "rgba(231,76,60,0.12)",
            color: flash.ok ? "#34d27f" : "#ef6b63",
          }}
        >
          {flash.text}
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-2">
        {/* left: inputs */}
        <div className="flex flex-col gap-3 overflow-y-auto rounded-2xl bg-black/20 p-4 ring-1 ring-white/10">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40">Job</span>
            <select className={inputCls} value={jobId} onChange={(e) => setJobId(Number(e.target.value))}>
              <option value={0}>— pick a job —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.role || "role"} · {j.company || "—"}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40">CV</span>
            <select className={inputCls} value={cvId} onChange={(e) => onPickCv(Number(e.target.value))}>
              <option value={0}>— paste manually —</option>
              {cvs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.original_name}
                </option>
              ))}
            </select>
            {cvs.length === 0 && (
              <span className="mt-1 block text-[11px] text-white/35">
                Tip: add a CV in the File Vault (category CV/Resume) to auto-fill this.
              </span>
            )}
          </label>

          <label className="flex flex-1 flex-col">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40">
              CV text {extracting && <span className="text-accent">· reading…</span>}
            </span>
            <textarea
              value={cvText}
              onChange={(e) => setCvText(e.target.value)}
              placeholder="Paste your CV here, or pick one above to auto-fill."
              className={inputCls + " min-h-[160px] flex-1 resize-none font-mono text-xs"}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40">Tone</span>
              <select className={inputCls} value={tone} onChange={(e) => setTone(e.target.value as typeof tone)}>
                {TONES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40">Length</span>
              <select className={inputCls} value={length} onChange={(e) => setLength(e.target.value as typeof length)}>
                {LENGTHS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>
          </div>

          <button
            onClick={onGenerate}
            disabled={generating}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-black text-felt-dark hover:bg-accent-hover active:scale-95 disabled:opacity-60"
          >
            {generating ? "Writing…" : "✨ Generate cover letter"}
          </button>
        </div>

        {/* right: draft */}
        <div className="flex flex-col gap-3 overflow-hidden rounded-2xl bg-black/20 p-4 ring-1 ring-white/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-white/40">Draft</span>
            <span className="text-[11px] text-white/30">{draft ? `${draft.split(/\s+/).filter(Boolean).length} words` : ""}</span>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={generating ? "Generating…" : "Your generated letter will appear here, fully editable."}
            className={inputCls + " flex-1 resize-none leading-relaxed"}
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => draft && navigator.clipboard.writeText(draft)}
              disabled={!draft}
              className="rounded-lg bg-white/5 px-3 py-2 text-sm font-bold text-white/70 hover:bg-white/10 disabled:opacity-50"
            >
              Copy
            </button>
            <button
              onClick={onExport}
              disabled={!draft}
              className="rounded-lg bg-white/5 px-3 py-2 text-sm font-bold text-white/70 hover:bg-white/10 disabled:opacity-50"
            >
              Export…
            </button>
            <button
              onClick={onSaveToVault}
              disabled={!draft}
              className="rounded-lg bg-white/5 px-3 py-2 text-sm font-bold text-white/70 hover:bg-white/10 disabled:opacity-50"
            >
              Save to vault
            </button>
            <button
              onClick={refineInChat}
              disabled={!draft}
              className="ml-auto rounded-lg bg-accent/80 px-3 py-2 text-sm font-black text-felt-dark hover:bg-accent active:scale-95 disabled:opacity-50"
            >
              Refine in AI Buddy →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
