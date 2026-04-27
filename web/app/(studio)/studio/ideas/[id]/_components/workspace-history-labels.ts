import type { PortfolioVersion, WorkingDraftSnapshot } from "@/lib/types";

const TRIGGER_LABEL: Record<WorkingDraftSnapshot["trigger"], string> = {
  autosave: "Autosave",
  before_distillation: "Before distillation",
  explicit: "Explicit save",
};

export function formatSnapshotTriggerLabel(trigger: WorkingDraftSnapshot["trigger"]): string {
  return TRIGGER_LABEL[trigger] ?? trigger;
}

export function formatVersionRowLabel(v: PortfolioVersion): string {
  const d = new Date(v.created_at);
  if (Number.isNaN(d.getTime())) return "Version";
  const month = d.toLocaleString("en-US", { month: "long" });
  const day = d.getDate();
  const year = d.getFullYear();
  if (v.status === "draft") {
    return `Draft — ${month} ${day}, ${year}`;
  }
  if (v.status === "archived") {
    return `Archived — ${month} ${day}, ${year}`;
  }
  if (v.status === "active") {
    return `Active — ${month} ${day}, ${year}`;
  }
  return `Version — ${month} ${day}, ${year}`;
}

export function formatShortTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
