import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { listDueReminders, listJobs, markReminderNotified } from "../lib/db";

export async function ensureNotificationPermission(): Promise<boolean> {
  let granted = await isPermissionGranted();
  if (!granted) {
    granted = (await requestPermission()) === "granted";
  }
  return granted;
}

// Track deadline notifications we've already sent this session so we don't spam.
const notifiedDeadlines = new Set<string>();

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dateStr}T00:00:00`);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

/** Fire notifications for any due reminders and imminent job deadlines. */
export async function runReminderCheck(): Promise<void> {
  try {
    const due = await listDueReminders();
    for (const r of due) {
      sendNotification({
        title: `⏰ ${r.title}`,
        body: r.description || `${r.date}${r.time ? " " + r.time : ""}`,
      });
      await markReminderNotified(r.id);
    }

    const jobs = await listJobs();
    for (const j of jobs) {
      if (!j.deadline) continue;
      const d = daysUntil(j.deadline);
      if (d < 0 || d > 1) continue; // only today / tomorrow
      const key = `${j.id}:${j.deadline}`;
      if (notifiedDeadlines.has(key)) continue;
      notifiedDeadlines.add(key);
      sendNotification({
        title: `📌 Deadline ${d === 0 ? "today" : "tomorrow"}`,
        body: `${j.role || "A role"} at ${j.company || "a company"}`,
      });
    }
  } catch (err) {
    console.error("reminder check failed", err);
  }
}
