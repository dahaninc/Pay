"use client";

import { useState, useTransition } from "react";
import { updateTone, updateSequenceStep } from "@/app/actions/business";
import type { Sequence, SequenceStep, Tone } from "@/lib/types";

const TONES: { key: Tone; label: string; blurb: string }[] = [
  { key: "friendly", label: "Friendly", blurb: "Warm and casual — good for regulars" },
  { key: "professional", label: "Professional", blurb: "Polite and direct — the safe default" },
  { key: "firm", label: "Firm", blurb: "No-nonsense — for chronic late payers" },
];

export function TemplatesEditor({ sequence, tone }: { sequence: Sequence; tone: Tone }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  function switchTone(next: Tone) {
    if (next === tone) return;
    if (
      !confirm(
        `Switch all reminder copy to the ${next} tone? Any custom edits to messages will be replaced.`
      )
    )
      return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("tone", next);
      await updateTone(fd);
      setNotice(`Tone switched to ${next} — all 5 messages updated.`);
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
        setNotice("Message saved ✓");
        setEditing(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* tone dial */}
      <div className="card p-5">
        <h2 className="font-bold mb-3">Tone</h2>
        <div className="grid grid-cols-3 gap-2">
          {TONES.map((t) => (
            <button
              key={t.key}
              disabled={pending}
              onClick={() => switchTone(t.key)}
              className={`rounded-xl border p-3 text-left ${
                tone === t.key
                  ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                  : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <span className="font-semibold text-sm block">{t.label}</span>
              <span className="text-xs text-ink-400 hidden sm:block mt-0.5">{t.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      {notice && <p className="text-sm bg-brand-50 text-brand-700 rounded-lg p-3">{notice}</p>}

      {/* steps */}
      <div className="space-y-3">
        {(sequence.steps as SequenceStep[]).map((step, i) => (
          <div key={i} className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-sm">{step.label}</span>
                <span className="text-xs text-ink-400 ml-2">
                  {step.offset_days < 0
                    ? `${-step.offset_days}d before due`
                    : step.offset_days === 0
                      ? "on due date"
                      : `${step.offset_days}d after due`}{" "}
                  · {step.channel === "sms" ? "SMS" : "email"}
                </span>
              </div>
              <button
                className="text-sm font-medium text-brand-700 underline"
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
                  <p className="text-xs text-ink-400 mt-1.5">
                    Merge tags: {"{first_name} {amount} {invoice_no} {days_overdue} {due_date} {pay_link} {business_name}"}
                  </p>
                </div>
                <button type="submit" disabled={pending} className="btn-primary !min-h-10 text-sm">
                  Save message
                </button>
              </form>
            ) : (
              <p className="text-sm text-ink-600 mt-2 whitespace-pre-line line-clamp-3">
                {step.body}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
