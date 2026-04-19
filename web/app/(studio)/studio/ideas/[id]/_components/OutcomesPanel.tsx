"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Idea, OutcomeEntry, Outcomes } from "@/lib/types";

const STATUS_STYLES: Record<string, { color: string; bg: string }> = {
  exploring: { color: "#9ca3af", bg: "rgba(156,163,175,0.10)" },
  active:    { color: "#60a5fa", bg: "rgba(96,165,250,0.10)" },
  paused:    { color: "#f0b429", bg: "rgba(240,180,41,0.10)" },
  killed:    { color: "#f87171", bg: "rgba(248,113,113,0.10)" },
  launched:  { color: "#4ade80", bg: "rgba(74,222,128,0.10)" },
};

const TYPE_ICON: Record<string, string> = {
  milestone: "⚑",
  pivot:     "⇄",
  kill:      "✕",
  pause:     "⏸",
  launch:    "🚀",
  learning:  "💡",
  metric:    "📊",
};

const ALL_STATUSES: Outcomes["current_status"][] = ["exploring", "active", "paused", "killed", "launched"];
const ALL_TYPES: OutcomeEntry["type"][] = ["milestone", "pivot", "kill", "pause", "launch", "learning", "metric"];
const ALL_DIMENSIONS = ["effort", "impact", "timeline", "confidence"] as const;

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = 86_400_000, w = 7 * d, mo = 30 * d;
  if (diff < d) return "today";
  if (diff < 2 * d) return "yesterday";
  if (diff < w) return `${Math.floor(diff / d)} days ago`;
  if (diff < mo) return `${Math.floor(diff / w)}w ago`;
  return new Date(iso).toLocaleDateString();
}

function autoPrediction(dimension: string, triage: Idea["triage"]): string {
  if (!triage) return "";
  if (dimension === "effort") return `Triage estimated effort at ${triage.effort_score}/5`;
  if (dimension === "impact") return `Triage estimated impact at ${triage.impact_score}/5`;
  if (dimension === "timeline") return `Triage estimated time horizon: ${triage.time_horizon}`;
  if (dimension === "confidence") return `Triage confidence: ${triage.confidence}/5`;
  return "";
}

function EntryCard({ entry, ideaId, onDelete }: { entry: OutcomeEntry; ideaId: string; onDelete: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const icon = TYPE_ICON[entry.type] ?? "·";

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/ideas/${ideaId}/outcomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_entry", entry_id: entry.id }),
    });
    onDelete();
  }

  return (
    <div
      className="relative flex gap-3"
    >
      {/* Timeline dot */}
      <div className="flex flex-col items-center">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
          style={{ backgroundColor: "var(--studio-bg-3)", color: "var(--studio-amber)" }}
        >
          {icon}
        </span>
        <div
          className="mt-1 w-px flex-1"
          style={{ backgroundColor: "var(--studio-border)", minHeight: 16 }}
        />
      </div>

      <div className="mb-5 flex-1 pb-1">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="rounded px-1.5 py-0.5 text-[11px] font-medium capitalize"
              style={{ color: "var(--studio-amber-dim)", backgroundColor: "rgba(var(--studio-amber-rgb,180,120,40),0.08)" }}
            >
              {entry.type}
            </span>
            <span className="text-sm font-medium" style={{ color: "var(--studio-fg)" }}>{entry.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px]" style={{ color: "var(--studio-fg-muted)" }}>{relativeDate(entry.date)}</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-[11px] opacity-40 transition-opacity hover:opacity-80 disabled:opacity-20"
              style={{ color: "var(--studio-fg-muted)" }}
            >
              {deleting ? "…" : "✕"}
            </button>
          </div>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--studio-fg-muted)" }}>{entry.description}</p>
        {entry.predicted_vs_actual && (
          <div
            className="mt-3 rounded border p-3"
            style={{ borderColor: "rgba(var(--studio-amber-rgb,180,120,40),0.3)", backgroundColor: "rgba(var(--studio-amber-rgb,180,120,40),0.04)" }}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--studio-amber-dim)" }}>
              Predicted vs Actual · {entry.predicted_vs_actual.dimension}
            </p>
            <div className="grid gap-1 text-xs" style={{ color: "var(--studio-fg-muted)" }}>
              <p><span className="font-medium" style={{ color: "var(--studio-fg)" }}>Predicted:</span> {entry.predicted_vs_actual.predicted}</p>
              <p><span className="font-medium" style={{ color: "var(--studio-fg)" }}>Actual:</span> {entry.predicted_vs_actual.actual}</p>
              <p><span className="font-medium" style={{ color: "var(--studio-fg)" }}>Delta:</span> {entry.predicted_vs_actual.delta_note}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AddEntryForm({ ideaId, triage, onSaved, onCancel }: {
  ideaId: string;
  triage: Idea["triage"];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<OutcomeEntry["type"]>("milestone");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [dimension, setDimension] = useState<typeof ALL_DIMENSIONS[number]>("effort");
  const [predicted, setPredicted] = useState("");
  const [actual, setActual] = useState("");
  const [deltaNote, setDeltaNote] = useState("");
  const [saving, setSaving] = useState(false);

  function handleDimensionChange(d: typeof ALL_DIMENSIONS[number]) {
    setDimension(d);
    setPredicted(autoPrediction(d, triage));
  }

  async function handleSave() {
    if (!title.trim() || !description.trim()) return;
    setSaving(true);
    const entry: Partial<OutcomeEntry> = {
      type,
      title: title.trim(),
      description: description.trim(),
      predicted_vs_actual: compareEnabled
        ? { dimension, predicted, actual, delta_note: deltaNote }
        : null,
    };
    await fetch(`/api/ideas/${ideaId}/outcomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_entry", entry }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div
      className="mt-4 rounded border p-4"
      style={{ borderColor: "var(--studio-border)", backgroundColor: "var(--studio-bg-2)" }}
    >
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--studio-amber-dim)" }}>
        New Entry
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {ALL_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className="rounded px-2 py-0.5 text-[11px] font-medium capitalize transition-colors"
            style={{
              color: type === t ? "var(--studio-bg)" : "var(--studio-fg-muted)",
              backgroundColor: type === t ? "var(--studio-amber)" : "var(--studio-bg-3)",
            }}
          >
            {TYPE_ICON[t]} {t}
          </button>
        ))}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Short label (e.g. Completed GDELT POC)"
        className="mb-2 w-full rounded border px-3 py-2 text-sm outline-none"
        style={{ borderColor: "var(--studio-border)", backgroundColor: "var(--studio-bg)", color: "var(--studio-fg)" }}
      />

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="2–4 sentences of what happened"
        rows={3}
        className="mb-3 w-full rounded border px-3 py-2 text-sm outline-none"
        style={{ borderColor: "var(--studio-border)", backgroundColor: "var(--studio-bg)", color: "var(--studio-fg)" }}
      />

      <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs" style={{ color: "var(--studio-fg-muted)" }}>
        <input
          type="checkbox"
          checked={compareEnabled}
          onChange={(e) => {
            setCompareEnabled(e.target.checked);
            if (e.target.checked) setPredicted(autoPrediction(dimension, triage));
          }}
        />
        Compare against prediction?
      </label>

      {compareEnabled && (
        <div
          className="mb-3 rounded border p-3"
          style={{ borderColor: "rgba(var(--studio-amber-rgb,180,120,40),0.3)", backgroundColor: "rgba(var(--studio-amber-rgb,180,120,40),0.04)" }}
        >
          <div className="mb-2 flex flex-wrap gap-1.5">
            {ALL_DIMENSIONS.map((d) => (
              <button
                key={d}
                onClick={() => handleDimensionChange(d)}
                className="rounded px-2 py-0.5 text-[11px] font-medium capitalize transition-colors"
                style={{
                  color: dimension === d ? "var(--studio-bg)" : "var(--studio-fg-muted)",
                  backgroundColor: dimension === d ? "var(--studio-amber-dim)" : "var(--studio-bg-3)",
                }}
              >
                {d}
              </button>
            ))}
          </div>
          <input
            value={predicted}
            onChange={(e) => setPredicted(e.target.value)}
            placeholder="Predicted"
            className="mb-2 w-full rounded border px-3 py-1.5 text-xs outline-none"
            style={{ borderColor: "var(--studio-border)", backgroundColor: "var(--studio-bg)", color: "var(--studio-fg-muted)" }}
          />
          <input
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            placeholder="What actually happened"
            className="mb-2 w-full rounded border px-3 py-1.5 text-xs outline-none"
            style={{ borderColor: "var(--studio-border)", backgroundColor: "var(--studio-bg)", color: "var(--studio-fg)" }}
          />
          <textarea
            value={deltaNote}
            onChange={(e) => setDeltaNote(e.target.value)}
            placeholder="Why was there a gap?"
            rows={2}
            className="w-full rounded border px-3 py-1.5 text-xs outline-none"
            style={{ borderColor: "var(--studio-border)", backgroundColor: "var(--studio-bg)", color: "var(--studio-fg)" }}
          />
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !title.trim() || !description.trim()}
          className="rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
          style={{ backgroundColor: "var(--studio-amber)", color: "var(--studio-bg)" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-xs transition-colors"
          style={{ color: "var(--studio-fg-muted)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function OutcomesPanel({ idea }: { idea: Idea }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const outcomes = idea.outcomes;
  const entries = outcomes?.entries ?? [];
  const currentStatus = outcomes?.current_status ?? "exploring";
  const ss = STATUS_STYLES[currentStatus] ?? STATUS_STYLES.exploring;

  async function changeStatus(status: Outcomes["current_status"]) {
    if (status === currentStatus) return;
    setUpdatingStatus(true);
    await fetch(`/api/ideas/${idea.id}/outcomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_status", status }),
    });
    setUpdatingStatus(false);
    router.refresh();
  }

  const sorted = [...entries].reverse();

  return (
    <div>
      {/* Status bar */}
      <div className="mb-6 flex items-center gap-3">
        <span
          className="rounded px-2.5 py-1 text-xs font-medium capitalize"
          style={{ color: ss.color, backgroundColor: ss.bg }}
        >
          {currentStatus}
        </span>
        <span className="text-[11px]" style={{ color: "var(--studio-fg-muted)" }}>Status</span>
        <div className="flex flex-wrap gap-1.5 ml-auto">
          {ALL_STATUSES.filter((s) => s !== currentStatus).map((s) => {
            const st = STATUS_STYLES[s];
            return (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                disabled={updatingStatus}
                className="rounded px-2 py-0.5 text-[11px] capitalize transition-opacity disabled:opacity-40"
                style={{ color: st.color, backgroundColor: st.bg }}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Timeline */}
      {sorted.length === 0 && !showForm ? (
        <div className="py-10 text-center">
          <p className="mb-2 text-sm" style={{ color: "var(--studio-fg-muted)" }}>
            No outcomes recorded yet. Record what happened with this idea — milestones, pivots, kills, learnings.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-2 rounded px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ backgroundColor: "var(--studio-amber)", color: "var(--studio-bg)" }}
          >
            Add first outcome →
          </button>
        </div>
      ) : (
        <>
          <div>
            {sorted.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                ideaId={idea.id}
                onDelete={() => router.refresh()}
              />
            ))}
          </div>

          {showForm ? (
            <AddEntryForm
              ideaId={idea.id}
              triage={idea.triage}
              onSaved={() => { setShowForm(false); router.refresh(); }}
              onCancel={() => setShowForm(false)}
            />
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="rounded px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ backgroundColor: "var(--studio-bg-3)", color: "var(--studio-fg-muted)" }}
            >
              + Add outcome
            </button>
          )}
        </>
      )}
    </div>
  );
}
