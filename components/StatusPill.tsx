import type { DisplayStatus } from "@/lib/types";

/**
 * Money-state pills from the winner design:
 * late = danger, due soon = amber, paid = win, paused = muted.
 */
export function StatusPill({
  status,
  daysOverdue,
  dueInDays,
  long = false,
}: {
  status: DisplayStatus;
  daysOverdue?: number;
  dueInDays?: number | null;
  long?: boolean;
}) {
  let cls = "bg-amber-soft text-amber-ink";
  let label = "Outstanding";

  switch (status) {
    case "paid":
      cls = "bg-win-soft text-win-ink";
      label = long ? "Paid" : "Paid ✓";
      break;
    case "paused":
      cls = "bg-surface2 text-muted";
      label = "Paused";
      break;
    case "written_off":
      cls = "bg-surface2 text-muted";
      label = "Written off";
      break;
    case "late":
      cls = "bg-danger-soft text-danger-ink";
      label = long ? `${daysOverdue} days late` : `${daysOverdue}d late`;
      break;
    default:
      if (dueInDays !== null && dueInDays !== undefined) {
        label = long ? `Due in ${dueInDays} days` : `Due ${dueInDays}d`;
      }
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-bold ${cls}`}>
      {label}
    </span>
  );
}

export function dueInDaysOf(dueAt: string): number {
  return Math.max(
    0,
    Math.round(
      (new Date(dueAt + "T00:00:00Z").getTime() -
        new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime()) /
        86400000
    )
  );
}
