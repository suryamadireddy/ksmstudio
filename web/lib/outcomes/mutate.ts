import type { OutcomeEntry, Outcomes } from "@/lib/types";

export const STATUS_FROM_TYPE: Partial<
  Record<OutcomeEntry["type"], Outcomes["current_status"]>
> = {
  kill: "killed",
  launch: "launched",
  pause: "paused",
};

export function emptyOutcomes(now = new Date().toISOString()): Outcomes {
  return {
    entries: [],
    current_status: "exploring",
    status_updated_at: now,
  };
}

/** Latest kill/pause/launch entry wins; otherwise exploring. */
export function currentStatusFromEntries(
  entries: OutcomeEntry[],
): Outcomes["current_status"] {
  const latestStatusEntry = [...entries]
    .reverse()
    .find((entry) => STATUS_FROM_TYPE[entry.type]);
  return latestStatusEntry
    ? STATUS_FROM_TYPE[latestStatusEntry.type]!
    : "exploring";
}

export type OutcomesAction =
  | {
      action: "add_entry";
      entry: Partial<OutcomeEntry>;
      id?: string;
      date?: string;
      now?: string;
    }
  | {
      action: "update_status";
      status: Outcomes["current_status"];
      now?: string;
    }
  | {
      action: "delete_entry";
      entry_id: string;
      now?: string;
    };

/**
 * Pure outcomes JSONB mutation. Callers persist the result with compare-and-swap
 * on status_updated_at so concurrent writers cannot silently drop entries.
 */
export function applyOutcomesAction(
  current: Outcomes | null | undefined,
  action: OutcomesAction,
): Outcomes {
  const now = action.now ?? new Date().toISOString();
  const outcomes: Outcomes = current
    ? {
        entries: [...current.entries],
        current_status: current.current_status,
        status_updated_at: current.status_updated_at,
      }
    : emptyOutcomes(now);

  if (action.action === "add_entry") {
    const newEntry: OutcomeEntry = {
      id: action.id ?? crypto.randomUUID(),
      date: action.date ?? now,
      type: action.entry.type!,
      title: action.entry.title!,
      description: action.entry.description!,
      predicted_vs_actual: action.entry.predicted_vs_actual ?? null,
    };
    outcomes.entries.push(newEntry);
    const autoStatus = STATUS_FROM_TYPE[newEntry.type];
    if (autoStatus) outcomes.current_status = autoStatus;
    outcomes.status_updated_at = now;
    return outcomes;
  }

  if (action.action === "update_status") {
    outcomes.current_status = action.status;
    outcomes.status_updated_at = now;
    return outcomes;
  }

  const deletedEntry = outcomes.entries.find((e) => e.id === action.entry_id);
  outcomes.entries = outcomes.entries.filter((e) => e.id !== action.entry_id);
  const deletedStatus = deletedEntry
    ? STATUS_FROM_TYPE[deletedEntry.type]
    : undefined;
  if (deletedStatus && outcomes.current_status === deletedStatus) {
    outcomes.current_status = currentStatusFromEntries(outcomes.entries);
  }
  outcomes.status_updated_at = now;
  return outcomes;
}

/** Version token used for optimistic concurrency on the outcomes JSONB blob. */
export function outcomesVersionToken(
  outcomes: Outcomes | null | undefined,
): string | null {
  return outcomes?.status_updated_at ?? null;
}
