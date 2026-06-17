import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { getSetting, setSetting } from "../../lib/db";

const PALETTE = {
  hearts: { face: "#fff1f0", bar: "#e24b4a", suit: "♥" },
  diamonds: { face: "#fff7e6", bar: "#d9982f", suit: "♦" },
  clubs: { face: "#eef6f0", bar: "#2f9e6b", suit: "♣" },
  spades: { face: "#eef0f4", bar: "#2b2b3a", suit: "♠" },
} as const;

type Suit = keyof typeof PALETTE;
const SUITS = Object.keys(PALETTE) as Suit[];

const PROMPTS = [
  "Company to research…",
  "Question to ask…",
  "Follow-up…",
  "Pro / con…",
  "Contact…",
  "Idea…",
];

const KEY = "board_notes";
const NOTE_W = 180;
const NOTE_H = 150;

interface Note {
  id: string;
  text: string;
  x: number;
  y: number;
  color: Suit;
}

export function Whiteboard() {
  const [notes, setNotes] = useState<Note[]>([]);
  const loaded = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; offX: number; offY: number } | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    void getSetting(KEY).then((v) => {
      if (v) {
        try {
          setNotes(JSON.parse(v) as Note[]);
        } catch {
          /* ignore corrupt state */
        }
      }
      loaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void setSetting(KEY, JSON.stringify(notes));
    }, 400);
  }, [notes]);

  function addNote() {
    const i = notes.length;
    setNotes((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text: "",
        x: 40 + (i % 6) * 26,
        y: 40 + (i % 6) * 22,
        color: SUITS[i % SUITS.length],
      },
    ]);
  }

  function update(id: string, patch: Partial<Note>) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  function remove(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  function onHeaderDown(e: React.PointerEvent, note: Note) {
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    drag.current = {
      id: note.id,
      offX: e.clientX - rect.left - note.x,
      offY: e.clientY - rect.top - note.y,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function onHeaderMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left - drag.current.offX, rect.width - NOTE_W));
    const y = Math.max(0, Math.min(e.clientY - rect.top - drag.current.offY, rect.height - NOTE_H));
    update(drag.current.id, { x, y });
  }

  function onHeaderUp() {
    drag.current = null;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Strategy Table</h1>
          <p className="text-sm text-white/50">Lay your cards out and plan the play</p>
        </div>
        <div className="flex gap-2">
          {notes.length > 0 && (
            <button
              onClick={() => setNotes([])}
              className="rounded-xl bg-white/5 px-3 py-2 text-sm font-bold text-white/60 hover:bg-white/10"
            >
              Clear table
            </button>
          )}
          <button
            onClick={addNote}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-black text-felt-dark hover:bg-accent-hover active:scale-95"
          >
            + Deal a Note
          </button>
        </div>
      </header>

      <div
        ref={boardRef}
        className="relative flex-1 overflow-hidden rounded-2xl ring-1 ring-accent/15"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, #0e5238 0%, #0a3a27 70%, #072a1d 100%)",
          boxShadow: "inset 0 0 80px rgba(0,0,0,0.45)",
        }}
      >
        {notes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-white/30">
            <div className="text-4xl">🂠</div>
            <div className="text-sm font-bold">Deal a note to start planning</div>
          </div>
        )}

        {notes.map((note, i) => {
          const p = PALETTE[note.color];
          return (
            <motion.div
              key={note.id}
              initial={{ scale: 0.8, opacity: 0, rotate: -4 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              whileHover={{ scale: 1.03 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
              className="absolute flex flex-col overflow-hidden rounded-lg shadow-xl"
              style={{
                left: note.x,
                top: note.y,
                width: NOTE_W,
                height: NOTE_H,
                background: p.face,
                boxShadow: "0 10px 26px -8px rgba(0,0,0,0.55)",
              }}
            >
              <div
                onPointerDown={(e) => onHeaderDown(e, note)}
                onPointerMove={onHeaderMove}
                onPointerUp={onHeaderUp}
                className="flex cursor-grab touch-none items-center justify-between px-2 py-1 active:cursor-grabbing"
                style={{ background: p.bar }}
              >
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() =>
                    update(note.id, {
                      color: SUITS[(SUITS.indexOf(note.color) + 1) % SUITS.length],
                    })
                  }
                  className="text-sm font-black text-white/90 hover:scale-125"
                  title="Change suit"
                >
                  {p.suit}
                </button>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => remove(note.id)}
                  className="text-sm font-black text-white/70 hover:text-white"
                  aria-label="Delete note"
                >
                  ✕
                </button>
              </div>
              <textarea
                value={note.text}
                onChange={(e) => update(note.id, { text: e.target.value })}
                placeholder={PROMPTS[i % PROMPTS.length]}
                className="flex-1 resize-none bg-transparent p-2 text-sm text-card-ink outline-none placeholder-black/30"
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
