import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { listJobs } from "../../lib/db";
import type { Job } from "../../lib/types";

const WEEKS = 10;

export function Analytics() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listJobs().then((j) => {
      setJobs(j);
      setLoading(false);
    });
  }, []);

  const stats = useMemo(() => {
    const applied = jobs.filter((j) => j.status !== "To Apply");
    const positive = jobs.filter((j) => j.status === "Interviewing" || j.status === "Offer");
    const offers = jobs.filter((j) => j.status === "Offer");
    const rate = applied.length ? Math.round((positive.length / applied.length) * 100) : 0;
    return {
      total: jobs.length,
      applied: applied.length,
      responseRate: rate,
      offers: offers.length,
    };
  }, [jobs]);

  const weekly = useMemo(() => buildWeekly(jobs, WEEKS), [jobs]);
  const maxCount = Math.max(1, ...weekly.map((w) => w.count));

  if (loading) {
    return <p className="text-white/40">Crunching the numbers…</p>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-5">
        <h1 className="text-2xl font-black">Analytics</h1>
        <p className="text-sm text-white/50">Your job hunt, by the numbers</p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total cards" value={stats.total} />
        <Stat label="Applied" value={stats.applied} />
        <Stat label="Response rate" value={`${stats.responseRate}%`} accent />
        <Stat label="Offers" value={stats.offers} />
      </div>

      <div className="rounded-2xl bg-black/20 p-5 ring-1 ring-white/10">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-white/50">
            Applications per week
          </h2>
          <span className="text-xs text-white/30">last {WEEKS} weeks</span>
        </div>

        {stats.total === 0 ? (
          <div className="py-12 text-center text-sm text-white/30">
            No data yet — add some job cards to see trends.
          </div>
        ) : (
          <div className="mt-5 flex h-48 items-end gap-2">
            {weekly.map((w) => (
              <div key={w.key} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(w.count / maxCount) * 100}%` }}
                    transition={{ type: "spring", stiffness: 200, damping: 22 }}
                    className="w-full rounded-t-md bg-accent/80"
                    style={{ minHeight: w.count > 0 ? 6 : 0 }}
                    title={`${w.count} on week of ${w.label}`}
                  />
                </div>
                <span className="text-[10px] font-bold text-white/35">{w.count}</span>
                <span className="text-[10px] text-white/30">{w.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-white/30">
        Response rate = cards that reached Interviewing or Offer, divided by everything you've
        applied to.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.03 }}
      transition={{ type: "spring", stiffness: 320, damping: 20 }}
      className="rounded-xl bg-black/20 p-4 ring-1 ring-white/10 transition-colors hover:ring-accent/30"
    >
      <div className="text-xs font-bold uppercase tracking-wide text-white/40">{label}</div>
      <div
        className="mt-1 text-3xl font-black"
        style={{ color: accent ? "#e7c35b" : "white" }}
      >
        {value}
      </div>
    </motion.div>
  );
}

// ---- weekly bucketing -----------------------------------------------------

interface Week {
  key: string;
  label: string;
  count: number;
}

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildWeekly(jobs: Job[], weeks: number): Week[] {
  const curMon = mondayOf(new Date());

  // Build the ordered list of week-start keys (oldest -> newest).
  const list: Week[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const wd = new Date(curMon);
    wd.setDate(curMon.getDate() - i * 7);
    list.push({
      key: isoDay(wd),
      label: wd.toLocaleString(undefined, { month: "short", day: "numeric" }),
      count: 0,
    });
  }
  const index = new Map(list.map((w, i) => [w.key, i]));

  for (const j of jobs) {
    const ds = j.date_applied || j.date_added;
    if (!ds) continue;
    const wd = mondayOf(new Date(`${ds}T00:00:00`));
    const i = index.get(isoDay(wd));
    if (i != null) list[i].count += 1;
  }
  return list;
}
