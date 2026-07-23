"use client";

import { useState, useTransition } from "react";
import { updateTone, updateSequenceStep } from "@/app/actions/business";
import type { Sequence, SequenceStep, Tone } from "@/lib/types";

const TONES: { key: Tone; label: string; blurb: string }[] = [
  { key: "friendly", label: "Friendly", blurb: "Warm and casual — good for regulars" },
  { key: "professional", label: "Professional", blurb: "Polite and direct — the safe default" },
  { key: "firm", label: "Firm", blurb: "No-nonsense — for chronic late payers" },
  { key: "custom", label: "Custom", blurb: "Your own words — nothing gets auto-replaced" },
];

export function TemplatesEditor({ sequence, tone }: { sequence: Sequence; tone: Tone }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  function switchTone(next: Tone) {
    if (next === tone) return;
    // Moving TO custom is non-destructive (it just stops future auto-resets), so no confirm.
    // Moving to a written preset replaces all 5 messages with fresh copy in that tone.
    if (
      next !== "custom" &&
      !confirm(`Switch all reminder copy to the ${next} tone? Any custom edits will be replaced.`)
    )
      return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("tone", next);
      await updateTone(fd);
      setNotice(
        next === "custom"
          ? "Switched to Custom — edit any message below and it'll stay exactly as you write it."
          : `Tone switched to ${next} — all 5 messages updated.`
      );
    });
  }

  function saveStep(index: number, form: HTMLFormElement) {
    startTransition(async () => {
      const fd = new FormData(form);
      fd.set("sequence_id", sequence.id);
      fd.set("step_index", String(index));
      const result = await updateSequenceStep(fd);
      if (result?.error) setNotice(result.error);
      else {
        setNotice("Message saved ✓ — tone set to Custom so this wording won't get overwritten.");
        setEditing(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* tone picker */}
      <div className="card p-5">
        <h2 className="font-bold text-ink mb-3">Tone</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TONES.map((t) => (
            <button
              key={t.key}
              disabled={pending}
              onClick={() => switchTone(t.key)}
              className="rounded-xl border p-3 text-left transition-colors"
              style={
                tone === t.key
                  ? { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                  : { borderColor: "var(--hair)", background: "var(--surface)" }
              }
            >
              <span className="font-bold text-sm block text-ink">{t.label}</span>
              <span className="text-xs text-muted hidden sm:block mt-0.5">{t.blurb}</span>
            </button>
          ))}
        </div>
        {tone === "custom" && (
          <p className="text-xs font-medium text-muted mt-3">
            You&rsquo;re on Custom — none of these 5 messages will ever be auto-replaced. Pick a
            written tone above anytime to reset them to fresh, professionally-written copy.
          </p>
        )}
      </div>

      {notice && (
        <p className="text-sm font-semibold bg-accent-soft text-accent-text rounded-xl p-3.5">
          {notice}
        </p>
      )}

      {/* the 5 messages — always selectable to view, always editable */}
      <div className="space-y-3">
        {(sequence.steps as SequenceStep[]).map((step, i) => (
          <div key={i} className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-bold text-sm text-ink">{step.label}</span>
                <span className="text-xs text-muted ml-2">
                  {step.offset_days < 0
                    ? `${-step.offset_days}d before due`
                    : step.offset_days === 0
                      ? "on due date"
                      : `${step.offset_days}d after due`}{" "}
                  · {step.channel === "sms" ? "SMS" : "email"}
                </span>
              </div>
              <button
                className="text-sm font-bold text-accent-text underline shrink-0"
                onClick={() => setEditing(editing === i ? null : i)}
              >
                {editing === i ? "Close" : "Edit"}
              </button>
            </div>

            {editing === i ? (
              <form
                className="mt-3 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveStep(i, e.currentTarget);
                }}
              >
                {step.channel === "email" && (
                  <div>
                    <label className="label">Subject</label>
                    <input name="subject" defaultValue={step.subject ?? ""} className="field" />
                  </div>
                )}
                <div>
                  <label className="label">Message</label>
                  <textarea
                    name="body"
                    defaultValue={step.body}
                    rows={step.channel === "sms" ? 4 : 8}
                    className="field font-mono text-sm"
                  />
                  <p className="text-xs text-muted mt-1.5">
                    Merge tags: {"{first_name} {amount} {invoice_no} {days_overdue} {due_date} {pay_link} {business_name}"}
                  </p>
                </div>
                <button type="submit" disabled={pending} className="btn-primary !min-h-10 text-sm">
                  Save message
                </button>
              </form>
            ) : (
              <p className="text-sm text-muted mt-2 whitespace-pre-line line-clamp-3">
                {step.body}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
