import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  JOB_STATUSES,
  STATUS_COLORS,
  STATUS_SUITS,
  WORK_MODES,
  parseTags,
  type Job,
  type JobInput,
  type JobStatus,
  type WorkMode,
} from "../../lib/types";
import {
  addJob,
  deleteJob,
  editJob,
  listJobEvents,
  listJobs,
  logEvent,
  markApplied,
  updateJobStatus,
  type JobEvent,
} from "../../lib/db";

function jobMatches(job: Job, q: string): boolean {
  if (!q.trim()) return true;
  const hay = [job.company, job.role, job.location, job.tags, job.notes, job.recruiter]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((term) => hay.includes(term));
}

export function Tracker() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Job | "new" | null>(null);
  const [query, setQuery] = useState("");
  const draggedAt = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  async function refresh() {
    setJobs(await listJobs());
    setLoading(false);
  }
  useEffect(() => {
    void refresh();
  }, []);

  const activeJob = activeId != null ? jobs.find((j) => j.id === activeId) ?? null : null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(Number(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    draggedAt.current = Date.now();
    const id = Number(e.active.id);
    setActiveId(null);
    const overId = e.over?.id;
    if (overId == null) return;
    const status = String(overId) as JobStatus;
    const job = jobs.find((j) => j.id === id);
    if (job && (JOB_STATUSES as readonly string[]).includes(status) && job.status !== status) {
      const today = new Date().toISOString().slice(0, 10);
      const stampApplied = status === "Applied" && !job.date_applied;
      setJobs((prev) =>
        prev.map((j) =>
          j.id === id ? { ...j, status, date_applied: stampApplied ? today : j.date_applied } : j
        )
      ); // optimistic
      await updateJobStatus(id, status);
      await logEvent(id, "status", job.status, status);
      if (stampApplied) await markApplied(id);
    }
  }

  async function handleSave(input: JobInput, id: number | null) {
    if (id == null) {
      await addJob(input);
    } else {
      const prev = editing && editing !== "new" ? editing.status : null;
      await editJob(id, input);
      if (prev && prev !== input.status) await logEvent(id, "status", prev, input.status);
    }
    setEditing(null);
    await refresh();
  }

  async function handleDelete(id: number) {
    await deleteJob(id);
    setEditing(null);
    await refresh();
  }

  return (
    <div className="mx-auto flex h-full max-w-[1500px] flex-col">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Dealer's Table</h1>
          <p className="text-sm text-white/50">
            {loading ? "Shuffling…" : `${jobs.length} ${jobs.length === 1 ? "card" : "cards"} in play`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cards…"
              className="w-56 rounded-xl bg-black/25 px-3 py-2 text-sm text-white outline-none
                         ring-1 ring-white/10 transition focus:w-64 focus:ring-2 focus:ring-accent/50
                         placeholder-white/30"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          <button
            onClick={() => setEditing("new")}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-black text-felt-dark shadow
                       transition hover:bg-accent-hover active:scale-95"
          >
            + Deal a Job
          </button>
        </div>
      </header>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
          {JOB_STATUSES.map((status) => (
            <Zone
              key={status}
              status={status}
              jobs={jobs.filter((j) => j.status === status && jobMatches(j, query))}
              onOpen={(job) => setEditing(job)}
              draggedAtRef={draggedAt}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeJob ? (
            <div className="w-60">
              <PlayingCard job={activeJob} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <AnimatePresence>
        {editing && (
          <JobModal
            initial={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
            onSave={handleSave}
            onDelete={handleDelete}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Zone (drop target) ---------------------------------------------------

function Zone({
  status,
  jobs,
  onOpen,
  draggedAtRef,
}: {
  status: JobStatus;
  jobs: Job[];
  onOpen: (j: Job) => void;
  draggedAtRef: MutableRefObject<number>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const color = STATUS_COLORS[status];

  return (
    <div
      ref={setNodeRef}
      className="flex w-64 shrink-0 flex-col rounded-2xl border p-2 transition-colors"
      style={{
        borderColor: isOver ? color : "rgba(255,255,255,0.12)",
        background: isOver ? `${color}1f` : "rgba(0,0,0,0.20)",
      }}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="flex items-center gap-2 text-sm font-black">
          <span style={{ color }} className="text-base">
            {STATUS_SUITS[status]}
          </span>
          {status}
        </span>
        <span className="rounded-full bg-black/30 px-2 text-xs font-bold text-white/60">
          {jobs.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden pr-0.5">
        {jobs.map((job) => (
          <DraggableCard key={job.id} job={job} onOpen={onOpen} draggedAtRef={draggedAtRef} />
        ))}
        {jobs.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 py-10 text-center text-xs text-white/30">
            drop here
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Draggable wrapper ----------------------------------------------------

function DraggableCard({
  job,
  onOpen,
  draggedAtRef,
}: {
  job: Job;
  onOpen: (j: Job) => void;
  draggedAtRef: MutableRefObject<number>;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: String(job.id) });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => {
        if (Date.now() - draggedAtRef.current < 200) return; // ignore the click that ends a drag
        onOpen(job);
      }}
      className="cursor-grab touch-none active:cursor-grabbing"
    >
      <PlayingCard job={job} faded={isDragging} />
    </div>
  );
}

// ---- The playing card (presentational) ------------------------------------

function PlayingCard({
  job,
  faded,
  dragging,
}: {
  job: Job;
  faded?: boolean;
  dragging?: boolean;
}) {
  const color = STATUS_COLORS[job.status];
  return (
    <motion.div
      animate={{ rotate: dragging ? 2.5 : 0 }}
      whileHover={
        faded || dragging
          ? undefined
          : { y: -4, scale: 1.025, boxShadow: "0 18px 38px -10px rgba(231,195,91,0.45)" }
      }
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className="relative w-full overflow-hidden rounded-xl bg-card-face text-card-ink ring-1 ring-black/10"
      style={{
        opacity: faded ? 0.3 : 1,
        boxShadow: dragging
          ? "0 20px 44px -8px rgba(0,0,0,0.65)"
          : "0 5px 12px -5px rgba(0,0,0,0.5)",
      }}
    >
      <div className="absolute left-0 top-0 h-full w-1.5" style={{ background: color }} />
      <div className="p-3 pl-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-black leading-tight">{job.role || "Untitled role"}</div>
            <div className="truncate text-sm text-card-ink/60">{job.company || "—"}</div>
          </div>
          <span className="shrink-0 text-lg" style={{ color }}>
            {STATUS_SUITS[job.status]}
          </span>
        </div>

        {(job.work_mode || job.location || job.salary) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {job.work_mode && <Chip>{job.work_mode}</Chip>}
            {job.location && <Chip>{job.location}</Chip>}
            {job.salary && <Chip>{job.salary}</Chip>}
          </div>
        )}

        {parseTags(job.tags).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {parseTags(job.tags).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-felt/15 px-1.5 py-0.5 text-[11px] font-bold text-felt"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {(job.priority > 0 || job.deadline) && (
          <div className="mt-2 flex items-center justify-between text-[11px] text-card-ink/50">
            <span className="tracking-tight" style={{ color: "#caa53a" }}>
              {"★".repeat(job.priority)}
              <span className="text-card-ink/25">{"★".repeat(Math.max(0, 5 - job.priority))}</span>
            </span>
            {job.deadline && <span>⏳ {job.deadline}</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-black/5 px-1.5 py-0.5 text-[11px] font-semibold text-card-ink/70">
      {children}
    </span>
  );
}

// ---- Create / edit modal --------------------------------------------------

const inputCls =
  "w-full rounded-lg bg-black/30 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-accent/60 placeholder-white/30";

function JobModal({
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Job | null;
  onClose: () => void;
  onSave: (input: JobInput, id: number | null) => void;
  onDelete: (id: number) => void;
}) {
  const [f, setF] = useState<JobInput>(() => ({
    company: initial?.company ?? "",
    role: initial?.role ?? "",
    status: initial?.status ?? "To Apply",
    link: initial?.link ?? "",
    location: initial?.location ?? "",
    work_mode: initial?.work_mode ?? "",
    salary: initial?.salary ?? "",
    deadline: initial?.deadline ?? "",
    priority: initial?.priority ?? 0,
    notes: initial?.notes ?? "",
    date_applied: initial?.date_applied ?? "",
    recruiter: initial?.recruiter ?? "",
    contact: initial?.contact ?? "",
    tags: initial?.tags ?? "",
  }));

  function set<K extends keyof JobInput>(k: K, v: JobInput[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
        className="w-full max-w-lg rounded-2xl border border-accent/30 bg-felt-dark p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black">{initial ? "Edit job" : "Deal a new job"}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Role" full>
            <input
              autoFocus
              className={inputCls}
              value={f.role}
              onChange={(e) => set("role", e.target.value)}
              placeholder="Frontend Engineer"
            />
          </Field>
          <Field label="Company" full>
            <input
              className={inputCls}
              value={f.company}
              onChange={(e) => set("company", e.target.value)}
              placeholder="Acme Inc."
            />
          </Field>

          <Field label="Status">
            <select
              className={inputCls}
              value={f.status}
              onChange={(e) => set("status", e.target.value as JobStatus)}
            >
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Work mode">
            <select
              className={inputCls}
              value={f.work_mode}
              onChange={(e) => set("work_mode", e.target.value as WorkMode)}
            >
              {WORK_MODES.map((m) => (
                <option key={m || "any"} value={m}>
                  {m || "—"}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Location">
            <input
              className={inputCls}
              value={f.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="London"
            />
          </Field>
          <Field label="Salary">
            <input
              className={inputCls}
              value={f.salary}
              onChange={(e) => set("salary", e.target.value)}
              placeholder="£45k"
            />
          </Field>

          <Field label="Link / URL" full>
            <input
              className={inputCls}
              value={f.link}
              onChange={(e) => set("link", e.target.value)}
              placeholder="https://…"
            />
          </Field>

          <Field label="Deadline">
            <input
              type="date"
              className={inputCls}
              value={f.deadline}
              onChange={(e) => set("deadline", e.target.value)}
            />
          </Field>
          <Field label="Priority">
            <div className="flex items-center gap-1 py-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set("priority", f.priority === n ? 0 : n)}
                  className="text-xl leading-none transition hover:scale-110"
                  style={{ color: n <= f.priority ? "#e7c35b" : "rgba(255,255,255,0.2)" }}
                  aria-label={`Priority ${n}`}
                >
                  ★
                </button>
              ))}
            </div>
          </Field>

          <Field label="Recruiter">
            <input
              className={inputCls}
              value={f.recruiter}
              onChange={(e) => set("recruiter", e.target.value)}
              placeholder="Jane Doe"
            />
          </Field>
          <Field label="Contact">
            <input
              className={inputCls}
              value={f.contact}
              onChange={(e) => set("contact", e.target.value)}
              placeholder="jane@acme.com"
            />
          </Field>

          <Field label="Date applied">
            <input
              type="date"
              className={inputCls}
              value={f.date_applied}
              onChange={(e) => set("date_applied", e.target.value)}
            />
          </Field>
          <Field label="Tags (comma-separated)">
            <input
              className={inputCls}
              value={f.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="dream, remote, startup"
            />
          </Field>

          <Field label="Notes" full>
            <textarea
              className={inputCls + " h-20 resize-none"}
              value={f.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Anything else to remember…"
            />
          </Field>
        </div>

        {initial && <Timeline jobId={initial.id} />}

        <div className="mt-5 flex items-center justify-between">
          {initial ? (
            <button
              onClick={() => onDelete(initial.id)}
              className="rounded-lg px-3 py-2 text-sm font-bold text-status-rejected/80 hover:bg-status-rejected/10"
            >
              Discard card
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg bg-white/5 px-4 py-2 text-sm font-bold text-white/70 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(f, initial?.id ?? null)}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-black text-felt-dark hover:bg-accent-hover active:scale-95"
            >
              {initial ? "Save" : "Deal it"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={full ? "col-span-2" : "col-span-1"}>
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40">
        {label}
      </span>
      {children}
    </label>
  );
}

// ---- Status-change timeline ----------------------------------------------

function fmtTs(ts: string): string {
  // stored as ISO; show "YYYY-MM-DD HH:MM"
  return ts.length >= 16 ? ts.slice(0, 16).replace("T", " ") : ts;
}

function Timeline({ jobId }: { jobId: number }) {
  const [events, setEvents] = useState<JobEvent[]>([]);

  useEffect(() => {
    void listJobEvents(jobId).then(setEvents);
  }, [jobId]);

  if (events.length === 0) return null;

  return (
    <div className="mt-4 border-t border-white/10 pt-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-white/40">History</div>
      <div className="flex max-h-32 flex-col gap-2 overflow-y-auto pr-1">
        {events
          .slice()
          .reverse()
          .map((e) => {
            const dot =
              e.kind === "created"
                ? "#9ca3af"
                : STATUS_COLORS[e.to_status as JobStatus] ?? "#9ca3af";
            return (
              <div key={e.id} className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
                <span className="text-white/80">
                  {e.kind === "created"
                    ? "Card dealt"
                    : `${e.from_status || "—"} → ${e.to_status}`}
                </span>
                <span className="ml-auto text-xs text-white/35">{fmtTs(e.ts)}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
