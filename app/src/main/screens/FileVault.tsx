import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import {
  addVaultFile,
  deleteVaultFile,
  listJobs,
  listVaultFiles,
  type VaultFile,
} from "../../lib/db";
import type { Job } from "../../lib/types";

const CATEGORIES = ["CV/Resume", "Cover Letter", "Portfolio", "Certificate", "Other"];

const CATEGORY_META: Record<string, { suit: string; color: string; code: string }> = {
  "CV/Resume": { suit: "♠", color: "#2b2b3a", code: "CV" },
  "Cover Letter": { suit: "♥", color: "#e24b4a", code: "CL" },
  Portfolio: { suit: "♦", color: "#d9982f", code: "PF" },
  Certificate: { suit: "♣", color: "#2f9e6b", code: "CT" },
  Other: { suit: "★", color: "#7d6ccf", code: "··" },
};

const inputCls =
  "w-full rounded-lg bg-black/30 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-accent/60";

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

function iconFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "📄";
  if (["doc", "docx"].includes(ext)) return "📝";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "🖼️";
  if (["txt", "md"].includes(ext)) return "📃";
  return "📁";
}

export function FileVault() {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState("All");
  const [pending, setPending] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);

  function showFlash(text: string, ok: boolean) {
    setFlash({ text, ok });
    window.setTimeout(() => setFlash(null), 4000);
  }

  async function refresh() {
    setFiles(await listVaultFiles());
    setJobs(await listJobs());
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function pickFile() {
    const selected = await open({
      multiple: false,
      filters: [
        { name: "Documents", extensions: ["pdf", "doc", "docx", "txt", "md", "png", "jpg", "jpeg"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (typeof selected === "string") setPending(selected);
  }

  async function handleOpen(f: VaultFile) {
    try {
      await invoke("open_file", { path: f.path });
    } catch (e) {
      showFlash(`Couldn't open the file: ${e}`, false);
    }
  }

  async function handleExport(f: VaultFile) {
    try {
      const dest = await save({ defaultPath: f.original_name });
      if (!dest) return;
      await invoke("export_file", { src: f.path, dest });
      showFlash(`Exported ${f.original_name}`, true);
    } catch (e) {
      showFlash(`Export failed: ${e}`, false);
    }
  }

  async function handleDelete(f: VaultFile) {
    if (f.mode === "copy") {
      try {
        await invoke("remove_vault_file", { path: f.path });
      } catch {
        /* ignore */
      }
    }
    await deleteVaultFile(f.id);
    await refresh();
  }

  const jobName = (id: number) => {
    const j = jobs.find((x) => x.id === id);
    return j ? `${j.role || "role"} · ${j.company || "—"}` : null;
  };

  const shown = filter === "All" ? files : files.filter((f) => f.category === filter);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">File Vault</h1>
          <p className="text-sm text-white/50">Your hand of documents — copy in, link, or deal out</p>
        </div>
        <button
          onClick={pickFile}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-black text-felt-dark hover:bg-accent-hover active:scale-95"
        >
          + Add File
        </button>
      </header>

      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-4 rounded-xl px-4 py-2 text-sm ring-1"
            style={{
              background: flash.ok ? "rgba(39,174,96,0.12)" : "rgba(231,76,60,0.12)",
              color: flash.ok ? "#34d27f" : "#ef6b63",
              boxShadow: `inset 0 0 0 1px ${flash.ok ? "rgba(39,174,96,0.3)" : "rgba(231,76,60,0.3)"}`,
            }}
          >
            {flash.text}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-5 flex flex-wrap gap-2">
        {["All", ...CATEGORIES].map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className="rounded-full px-3 py-1 text-xs font-bold transition"
            style={{
              background: filter === c ? "#e7c35b" : "rgba(255,255,255,0.06)",
              color: filter === c ? "#082a1c" : "rgba(255,255,255,0.7)",
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 py-16 text-center text-sm text-white/30">
          {files.length === 0 ? "No files yet — add your CV to get started." : "Nothing in this category."}
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
        >
          <AnimatePresence>
            {shown.map((f) => (
              <FileCard
                key={f.id}
                file={f}
                jobName={jobName(f.job_id)}
                onOpen={() => handleOpen(f)}
                onExport={() => handleExport(f)}
                onDelete={() => handleDelete(f)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {pending && (
          <AddFileModal
            src={pending}
            jobs={jobs}
            onClose={() => setPending(null)}
            onSaved={async () => {
              setPending(null);
              await refresh();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function FileCard({
  file,
  jobName,
  onOpen,
  onExport,
  onDelete,
}: {
  file: VaultFile;
  jobName: string | null;
  onOpen: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const meta = CATEGORY_META[file.category] ?? CATEGORY_META.Other;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.85, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, y: 8 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      whileHover={{
        y: -8,
        rotate: -2,
        scale: 1.045,
        boxShadow: "0 22px 44px -10px rgba(231,195,91,0.45)",
      }}
      className="group relative flex min-h-[244px] cursor-default flex-col overflow-hidden rounded-xl
                 bg-card-face text-card-ink ring-1 ring-accent/40"
      style={{ boxShadow: "0 8px 20px -8px rgba(0,0,0,0.55)" }}
    >
      <div className="pointer-events-none absolute inset-1.5 rounded-lg border border-accent/25" />

      {/* corner pip */}
      <div className="absolute left-2.5 top-2 flex flex-col items-center leading-none">
        <span className="text-[11px] font-black" style={{ color: meta.color }}>
          {meta.code}
        </span>
        <span className="text-sm" style={{ color: meta.color }}>
          {meta.suit}
        </span>
      </div>
      <div className="absolute bottom-[88px] right-2.5 flex rotate-180 flex-col items-center leading-none">
        <span className="text-[11px] font-black" style={{ color: meta.color }}>
          {meta.code}
        </span>
        <span className="text-sm" style={{ color: meta.color }}>
          {meta.suit}
        </span>
      </div>

      {/* center icon */}
      <div className="flex flex-1 items-center justify-center pt-4">
        <span className="text-5xl">{iconFor(file.original_name)}</span>
      </div>

      {/* details */}
      <div className="px-3">
        <div className="line-clamp-2 text-sm font-black leading-tight">{file.original_name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-card-ink/50">
          <span style={{ color: file.mode === "copy" ? "#1d9e75" : undefined }}>
            {file.mode === "copy" ? "in vault" : "linked"}
          </span>
          <span>·</span>
          <span>{file.date_added}</span>
        </div>
        {jobName && (
          <div className="mt-0.5 truncate text-[11px] font-bold" style={{ color: meta.color }}>
            → {jobName}
          </div>
        )}
      </div>

      {/* actions */}
      <div className="mt-2 flex border-t border-black/10 text-xs font-bold">
        <button onClick={onOpen} className="flex-1 py-2 text-felt hover:bg-black/5" title="Open">
          Open
        </button>
        <button
          onClick={onExport}
          className="flex-1 border-l border-black/10 py-2 text-card-ink/70 hover:bg-black/5"
          title="Export a copy"
        >
          Export
        </button>
        <button
          onClick={onDelete}
          className="border-l border-black/10 px-3 py-2 text-card-ink/40 hover:bg-red-500/10 hover:text-red-600"
          title="Remove"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}

function AddFileModal({
  src,
  jobs,
  onClose,
  onSaved,
}: {
  src: string;
  jobs: Job[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [mode, setMode] = useState<"copy" | "link">("copy");
  const [jobId, setJobId] = useState(0);
  const [busy, setBusy] = useState(false);

  async function doSave() {
    setBusy(true);
    try {
      const imported = await invoke<{ stored_path: string; original_name: string }>("import_file", {
        src,
        copy: mode === "copy",
      });
      await addVaultFile({
        path: imported.stored_path,
        original_name: imported.original_name,
        category,
        mode,
        job_id: jobId,
      });
      onSaved();
    } catch (e) {
      setBusy(false);
      alert(`Could not add file: ${e}`);
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
        <h2 className="mb-1 text-lg font-black">Add to vault</h2>
        <p className="mb-4 truncate text-sm text-white/50">{basename(src)}</p>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40">Category</span>
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <div className="mb-3">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40">Storage</span>
          <div className="grid grid-cols-2 gap-2">
            <ModeButton
              active={mode === "copy"}
              onClick={() => setMode("copy")}
              title="Copy into vault"
              desc="Self-contained — survives if you move the original."
            />
            <ModeButton
              active={mode === "link"}
              onClick={() => setMode("link")}
              title="Link in place"
              desc="Points at the file where it already lives."
            />
          </div>
        </div>

        <label className="mb-5 block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40">
            Tag to a job (optional)
          </span>
          <select className={inputCls} value={jobId} onChange={(e) => setJobId(Number(e.target.value))}>
            <option value={0}>— none —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.role || "role"} · {j.company || "—"}
              </option>
            ))}
          </select>
        </label>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg bg-white/5 px-4 py-2 text-sm font-bold text-white/70 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={doSave}
            disabled={busy}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-black text-felt-dark hover:bg-accent-hover active:scale-95 disabled:opacity-60"
          >
            {busy ? "Adding…" : "Add file"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ModeButton({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg p-2.5 text-left text-sm transition"
      style={{
        background: active ? "rgba(231,195,91,0.15)" : "rgba(0,0,0,0.25)",
        boxShadow: active
          ? "inset 0 0 0 1px rgba(231,195,91,0.5)"
          : "inset 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      <div className="font-black">{title}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-white/45">{desc}</div>
    </button>
  );
}
