export const JOB_STATUSES = [
  "To Apply",
  "Applied",
  "Interviewing",
  "Offer",
  "Rejected",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const WORK_MODES = ["", "Remote", "Hybrid", "On-site"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export interface Job {
  id: number;
  company: string;
  role: string;
  status: JobStatus;
  link: string;
  location: string;
  work_mode: WorkMode;
  salary: string;
  deadline: string;
  priority: number; // 0-5
  notes: string;
  date_applied: string;
  recruiter: string;
  contact: string;
  tags: string; // comma-separated
  date_added: string;
}

export function parseTags(tags: string): string[] {
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export type JobInput = Omit<Job, "id" | "date_added">;

export const STATUS_COLORS: Record<JobStatus, string> = {
  "To Apply": "#3b82f6",
  Applied: "#e7c35b",
  Interviewing: "#a855f7",
  Offer: "#22c55e",
  Rejected: "#ef4444",
};

// Suit assigned to each zone, for the playing-card flourish.
export const STATUS_SUITS: Record<JobStatus, string> = {
  "To Apply": "♣",
  Applied: "♦",
  Interviewing: "♠",
  Offer: "♥",
  Rejected: "✕",
};
