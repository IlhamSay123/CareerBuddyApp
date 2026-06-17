import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  addReminder,
  deleteReminder,
  listJobs,
  listUpcomingReminders,
  type Reminder,
} from "../../lib/db";
import type { Job } from "../../lib/types";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { ensureNotificationPermission, runReminderCheck } from "../../services/reminders";

const inputCls =
  "w-full rounded-lg bg-black/30 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-accent/60 placeholder-white/30";

export function Calendar() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [adding, setAdding] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState("");

  async function testNotifications() {
    const granted = await ensureNotificationPermission();
    if (!granted) {
      setNotifyMsg(
        "Windows hasn't allowed notifications. Open Settings → Notifications and enable them for CareerBuddy."
      );
      return;
    }
    sendNotification({ title: "CareerBuddy", body: "Notifications are working ✓" });
    await runReminderCheck();
    setNotifyMsg("Sent a test notification — check the bottom-right / Action Center.");
    window.setTimeout(() => setNotifyMsg(""), 6000);
  }

  async function refresh() {
    setReminders(await listUpcomingReminders());
    setJobs(await listJobs());
  }
  useEffect(() => {
    void refresh();
  }, []);

  const deadlines = jobs
    .filter((j) => j.deadline)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Reminders</h1>
          <p className="text-sm text-white/50">Desktop alerts for what's coming up</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={testNotifications}
            className="rounded-xl bg-white/5 px-3 py-2 text-sm font-bold text-white/70 hover:bg-white/10"
            title="Send a test notification & check what's due"
          >
            Test notification
          </button>
          <button
            onClick={() => setAdding((v) => !v)}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-black text-felt-dark hover:bg-accent-hover active:scale-95"
          >
            + Add Reminder
          </button>
        </div>
      </header>

      {notifyMsg && (
        <div className="mb-4 rounded-xl bg-accent/10 px-4 py-2 text-sm text-accent ring-1 ring-accent/20">
          {notifyMsg}
        </div>
      )}

      <AnimatePresence>
        {adding && (
          <AddReminderForm
            onAdd={async (r) => {
              await ensureNotificationPermission();
              await addReminder(r);
              setAdding(false);
              await refresh();
            }}
            onCancel={() => setAdding(false)}
          />
        )}
      </AnimatePresence>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-white/40">
          Upcoming reminders
        </h2>
        {reminders.length === 0 ? (
          <Empty text="No reminders yet — add one above." />
        ) : (
          <div className="flex flex-col gap-2">
            {reminders.map((r) => (
              <motion.div
                key={r.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -2, scale: 1.008 }}
                transition={{ type: "spring", stiffness: 320, damping: 24 }}
                className="group flex items-center gap-3 rounded-xl bg-black/20 p-3 ring-1 ring-white/10 transition-colors hover:ring-accent/30"
              >
                <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <span className="text-[10px] font-bold uppercase">{monthShort(r.date)}</span>
                  <span className="text-sm font-black leading-none">{dayNum(r.date)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{r.title}</div>
                  <div className="truncate text-xs text-white/50">
                    {r.date}
                    {r.time ? ` · ${r.time}` : ""}
                    {r.description ? ` · ${r.description}` : ""}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await deleteReminder(r.id);
                    await refresh();
                  }}
                  className="opacity-0 transition group-hover:opacity-100 text-white/40 hover:text-status-rejected"
                  aria-label="Delete reminder"
                >
                  ✕
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-white/40">
          Job deadlines
        </h2>
        {deadlines.length === 0 ? (
          <Empty text="No job deadlines set. Add a deadline when editing a card." />
        ) : (
          <div className="flex flex-col gap-2">
            {deadlines.map((j) => {
              const d = daysUntil(j.deadline);
              const urgent = d <= 2;
              return (
                <div
                  key={j.id}
                  className="flex items-center gap-3 rounded-xl bg-black/20 p-3 ring-1 ring-white/10 transition hover:ring-accent/25"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: urgent ? "#ef4444" : "#e7c35b" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">
                      {j.role || "Untitled"} <span className="text-white/40">·</span>{" "}
                      <span className="text-white/60">{j.company || "—"}</span>
                    </div>
                    <div className="text-xs text-white/50">{j.deadline}</div>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-bold"
                    style={{
                      background: urgent ? "rgba(239,68,68,0.15)" : "rgba(231,195,91,0.15)",
                      color: urgent ? "#ef4444" : "#e7c35b",
                    }}
                  >
                    {d < 0 ? "overdue" : d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d}d`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function AddReminderForm({
  onAdd,
  onCancel,
}: {
  onAdd: (r: { title: string; description: string; date: string; time: string; category: string }) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("09:00");
  const [description, setDescription] = useState("");

  return (
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onAdd({ title: title.trim(), description: description.trim(), date, time, category: "" });
      }}
      className="mb-6 grid grid-cols-2 gap-3 overflow-hidden rounded-xl2 bg-black/20 p-4 ring-1 ring-white/10"
    >
      <label className="col-span-2">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40">Title</span>
        <input autoFocus className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Follow up with recruiter" />
      </label>
      <label>
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40">Date</span>
        <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label>
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40">Time</span>
        <input type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      <label className="col-span-2">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40">Note (optional)</span>
        <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Anything to remember" />
      </label>
      <div className="col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg bg-white/5 px-4 py-2 text-sm font-bold text-white/70 hover:bg-white/10">
          Cancel
        </button>
        <button type="submit" className="rounded-lg bg-accent px-5 py-2 text-sm font-black text-felt-dark hover:bg-accent-hover active:scale-95">
          Save
        </button>
      </div>
    </motion.form>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 py-8 text-center text-sm text-white/30">
      {text}
    </div>
  );
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dateStr}T00:00:00`);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function monthShort(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { month: "short" });
}

function dayNum(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return isNaN(d.getTime()) ? "" : String(d.getDate());
}
