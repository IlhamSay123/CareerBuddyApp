import Database from "@tauri-apps/plugin-sql";
import type { Job, JobInput, JobStatus } from "./types";

// Schema is created/upgraded by the Rust migrations (see src-tauri/src/lib.rs).
let _db: Database | null = null;

export async function db(): Promise<Database> {
  if (!_db) {
    _db = await Database.load("sqlite:careerbuddy.db");
  }
  return _db;
}

const JOB_COLS =
  "id, company, role, status, link, location, work_mode, salary, deadline, priority, notes, date_applied, recruiter, contact, tags, date_added";

// ---- Jobs -----------------------------------------------------------------

export async function listJobs(): Promise<Job[]> {
  const conn = await db();
  return conn.select<Job[]>(
    `SELECT ${JOB_COLS} FROM jobs ORDER BY priority DESC, date_added DESC, id DESC`
  );
}

export async function addJob(input: JobInput): Promise<number> {
  const conn = await db();
  const date = new Date().toISOString().slice(0, 10);
  const res = await conn.execute(
    `INSERT INTO jobs
       (company, role, status, link, location, work_mode, salary, deadline, priority, notes,
        date_applied, recruiter, contact, tags, date_added)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      input.company,
      input.role,
      input.status,
      input.link,
      input.location,
      input.work_mode,
      input.salary,
      input.deadline,
      input.priority,
      input.notes,
      input.date_applied,
      input.recruiter,
      input.contact,
      input.tags,
      date,
    ]
  );
  const id = Number(res.lastInsertId);
  await logEvent(id, "created", "", input.status);
  return id;
}

export async function editJob(id: number, input: JobInput): Promise<void> {
  const conn = await db();
  await conn.execute(
    `UPDATE jobs SET
       company=$1, role=$2, status=$3, link=$4, location=$5,
       work_mode=$6, salary=$7, deadline=$8, priority=$9, notes=$10,
       date_applied=$11, recruiter=$12, contact=$13, tags=$14
     WHERE id=$15`,
    [
      input.company,
      input.role,
      input.status,
      input.link,
      input.location,
      input.work_mode,
      input.salary,
      input.deadline,
      input.priority,
      input.notes,
      input.date_applied,
      input.recruiter,
      input.contact,
      input.tags,
      id,
    ]
  );
}

export async function updateJobStatus(id: number, status: JobStatus): Promise<void> {
  const conn = await db();
  await conn.execute(`UPDATE jobs SET status = $1 WHERE id = $2`, [status, id]);
}

// ---- Job timeline ---------------------------------------------------------

export interface JobEvent {
  id: number;
  job_id: number;
  ts: string;
  kind: string; // "created" | "status"
  from_status: string;
  to_status: string;
}

export async function logEvent(
  jobId: number,
  kind: string,
  from: string,
  to: string
): Promise<void> {
  const conn = await db();
  await conn.execute(
    `INSERT INTO job_events (job_id, ts, kind, from_status, to_status) VALUES ($1,$2,$3,$4,$5)`,
    [jobId, new Date().toISOString(), kind, from, to]
  );
}

export async function listJobEvents(jobId: number): Promise<JobEvent[]> {
  const conn = await db();
  return conn.select<JobEvent[]>(
    `SELECT id, job_id, ts, kind, from_status, to_status
       FROM job_events WHERE job_id = $1 ORDER BY id ASC`,
    [jobId]
  );
}

// Stamp the applied date the first time a job reaches "Applied".
export async function markApplied(id: number): Promise<void> {
  const conn = await db();
  const date = new Date().toISOString().slice(0, 10);
  await conn.execute(
    `UPDATE jobs SET date_applied = $1 WHERE id = $2 AND (date_applied = '' OR date_applied IS NULL)`,
    [date, id]
  );
}

export async function deleteJob(id: number): Promise<void> {
  const conn = await db();
  await conn.execute(`DELETE FROM jobs WHERE id = $1`, [id]);
}

// ---- Reminders ------------------------------------------------------------

export interface Reminder {
  id: number;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  category: string;
  notified: number;
}

export async function addReminder(r: Omit<Reminder, "id" | "notified">): Promise<void> {
  const conn = await db();
  await conn.execute(
    `INSERT INTO reminders (title, description, date, time, category, notified)
     VALUES ($1,$2,$3,$4,$5,0)`,
    [r.title, r.description, r.date, r.time, r.category]
  );
}

export async function listUpcomingReminders(): Promise<Reminder[]> {
  const conn = await db();
  const today = new Date().toISOString().slice(0, 10);
  return conn.select<Reminder[]>(
    `SELECT id, title, description, date, time, category, notified
       FROM reminders WHERE date >= $1 ORDER BY date ASC, time ASC`,
    [today]
  );
}

export async function deleteReminder(id: number): Promise<void> {
  const conn = await db();
  await conn.execute(`DELETE FROM reminders WHERE id = $1`, [id]);
}

export async function listDueReminders(): Promise<Reminder[]> {
  const conn = await db();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const hm = now.toTimeString().slice(0, 5); // HH:MM local
  return conn.select<Reminder[]>(
    `SELECT id, title, description, date, time, category, notified
       FROM reminders
      WHERE notified = 0
        AND (date < $1 OR (date = $1 AND (time = '' OR time <= $2)))`,
    [today, hm]
  );
}

export async function markReminderNotified(id: number): Promise<void> {
  const conn = await db();
  await conn.execute(`UPDATE reminders SET notified = 1 WHERE id = $1`, [id]);
}

// ---- File vault -----------------------------------------------------------

export interface VaultFile {
  id: number;
  path: string;
  original_name: string;
  category: string;
  mode: string; // "copy" | "link"
  job_id: number; // 0 = not tagged to a job
  date_added: string;
}

export async function addVaultFile(f: {
  path: string;
  original_name: string;
  category: string;
  mode: string;
  job_id: number;
}): Promise<void> {
  const conn = await db();
  const date = new Date().toISOString().slice(0, 10);
  await conn.execute(
    `INSERT INTO files (filename, original_name, category, date_added, path, mode, job_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [f.original_name, f.original_name, f.category, date, f.path, f.mode, f.job_id]
  );
}

export async function listVaultFiles(): Promise<VaultFile[]> {
  const conn = await db();
  return conn.select<VaultFile[]>(
    `SELECT id, path, original_name, category, mode, job_id, date_added
       FROM files ORDER BY date_added DESC, id DESC`
  );
}

export async function deleteVaultFile(id: number): Promise<void> {
  const conn = await db();
  await conn.execute(`DELETE FROM files WHERE id = $1`, [id]);
}

// ---- AI chat history (single conversation for now) ------------------------

export interface AIMessage {
  role: string; // "user" | "assistant"
  content: string;
  ts: string;
}

async function ensureConversation(): Promise<void> {
  const conn = await db();
  await conn.execute(
    `INSERT OR IGNORE INTO ai_conversations (id, title, created_at) VALUES (1, 'AI Buddy', $1)`,
    [new Date().toISOString()]
  );
}

export async function aiAddMessage(role: string, content: string): Promise<void> {
  await ensureConversation();
  const conn = await db();
  await conn.execute(
    `INSERT INTO ai_messages (conversation_id, ts, role, content) VALUES (1, $1, $2, $3)`,
    [new Date().toISOString(), role, content]
  );
}

export async function aiGetMessages(): Promise<AIMessage[]> {
  const conn = await db();
  return conn.select<AIMessage[]>(
    `SELECT role, content, ts FROM ai_messages WHERE conversation_id = 1 ORDER BY id ASC`
  );
}

export async function aiClearMessages(): Promise<void> {
  const conn = await db();
  await conn.execute(`DELETE FROM ai_messages WHERE conversation_id = 1`);
}

// ---- AI memory ------------------------------------------------------------

export interface AIMemory {
  id: number;
  ts: string;
  type: string;
  content: string;
  importance: number;
  pinned: number;
}

export async function aiAddMemory(content: string, importance = 6): Promise<void> {
  const conn = await db();
  await conn.execute(
    `INSERT INTO ai_memories (ts, type, content, importance, pinned) VALUES ($1, 'fact', $2, $3, 0)`,
    [new Date().toISOString(), content, importance]
  );
}

export async function aiListMemories(limit = 100): Promise<AIMemory[]> {
  const conn = await db();
  return conn.select<AIMemory[]>(
    `SELECT id, ts, type, content, importance, pinned
       FROM ai_memories ORDER BY pinned DESC, importance DESC, id DESC LIMIT $1`,
    [limit]
  );
}

export async function aiDeleteMemory(id: number): Promise<void> {
  const conn = await db();
  await conn.execute(`DELETE FROM ai_memories WHERE id = $1`, [id]);
}

export async function aiSetMemoryPinned(id: number, pinned: number): Promise<void> {
  const conn = await db();
  await conn.execute(`UPDATE ai_memories SET pinned = $1 WHERE id = $2`, [pinned, id]);
}

// ---- Settings (key/value) -------------------------------------------------

export async function getSetting(key: string): Promise<string | null> {
  const conn = await db();
  const rows = await conn.select<{ value: string }[]>(
    `SELECT value FROM settings WHERE key = $1`,
    [key]
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const conn = await db();
  await conn.execute(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = $2`,
    [key, value]
  );
}

// ---- Notes (singleton) ----------------------------------------------------

export async function loadNotes(): Promise<string> {
  const conn = await db();
  const rows = await conn.select<{ content: string }[]>(
    `SELECT content FROM notes WHERE id = 1`
  );
  return rows[0]?.content ?? "";
}

export async function saveNotes(content: string): Promise<void> {
  const conn = await db();
  // Ensure the singleton row exists, then update.
  await conn.execute(`INSERT OR IGNORE INTO notes (id, content) VALUES (1, '')`);
  await conn.execute(`UPDATE notes SET content = $1 WHERE id = 1`, [content]);
}
