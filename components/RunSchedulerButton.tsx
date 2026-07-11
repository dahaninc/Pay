"use client";

import { useState, useTransition } from "react";
import { runSchedulerNow } from "@/app/actions/scheduler";

export function RunSchedulerButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  return (
    <div className="text-center">
      <button
        disabled={pending}
        className="btn-secondary text-sm"
        onClick={() =>
          startTransition(async () => {
            const r = await runSchedulerNow();
            setResult(
              r.processed === 0
                ? "Nothing due right now — reminders fire on their own schedule."
                : `Processed ${r.processed} due ${r.processed === 1 ? "reminder" : "reminders"} (${r.sent} sent).`
            );
          })
        }
      >
        {pending ? "Processing…" : "⚡ Process due reminders now"}
      </button>
      {result && <p className="text-sm text-ink-600 mt-2">{result}</p>}
      <p className="text-xs text-ink-400 mt-1.5">
        In production this runs automatically every 5 minutes.
      </p>
    </div>
  );
}
