"use client";

import { useState, useTransition } from "react";
import { updateBusiness } from "@/app/actions/business";

/** 7am–10pm floor/ceiling — a compliance hard limit (see CLAUDE.md), not a UI choice.
 *  8am–9pm is the suggested standard default; everything WITHIN 7–22 is the business's to pick. */
const MIN_HOUR = 7;
const MAX_HOUR = 22;

function hourLabel(h: number): string {
  if (h === 12) return "12:00pm";
  if (h === 24) return "12:00am";
  return h < 12 ? `${h}:00am` : `${h - 12}:00pm`;
}

export function QuietHoursEditor({
  initialStart,
  initialEnd,
  initialSendHour,
}: {
  initialStart: number;
  initialEnd: number;
  initialSendHour: number;
}) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [sendHour, setSendHour] = useState(initialSendHour);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(nextStart: number, nextEnd: number, nextSendHour: number) {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("quiet_start", String(nextStart));
      fd.set("quiet_end", String(nextEnd));
      fd.set("preferred_send_hour", String(nextSendHour));
      try {
        await updateBusiness(fd);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save — try again");
      }
    });
  }

  function onStartChange(v: number) {
    const nextEnd = end <= v ? Math.min(MAX_HOUR, v + 1) : end;
    const nextSendHour = Math.min(Math.max(sendHour, v), nextEnd - 1);
    setStart(v);
    setEnd(nextEnd);
    setSendHour(nextSendHour);
    save(v, nextEnd, nextSendHour);
  }

  function onEndChange(v: number) {
    const nextSendHour = Math.min(sendHour, v - 1);
    setEnd(v);
    setSendHour(nextSendHour);
    save(start, v, nextSendHour);
  }

  function onSendHourChange(v: number) {
    setSendHour(v);
    save(start, end, v);
  }

  const startOptions = Array.from({ length: MAX_HOUR - MIN_HOUR }, (_, i) => MIN_HOUR + i); // 7..21
  const endOptions = Array.from({ length: MAX_HOUR - start }, (_, i) => start + 1 + i); // start+1..22
  const sendHourOptions = Array.from({ length: end - start }, (_, i) => start + i); // start..end-1

  return (
    <div>
      <div className="flex items-center gap-2.5 flex-wrap">
        <select
          value={start}
          disabled={pending}
          onChange={(e) => onStartChange(Number(e.target.value))}
          className="field !w-auto !py-2 !px-3 text-sm font-bold"
        >
          {startOptions.map((h) => (
            <option key={h} value={h}>
              {hourLabel(h)}
            </option>
          ))}
        </select>
        <span className="text-sm font-bold text-muted">to</span>
        <select
          value={end}
          disabled={pending}
          onChange={(e) => onEndChange(Number(e.target.value))}
          className="field !w-auto !py-2 !px-3 text-sm font-bold"
        >
          {endOptions.map((h) => (
            <option key={h} value={h}>
              {hourLabel(h)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap mt-3">
        <span className="text-[13px] font-semibold text-muted">Reminders go out around</span>
        <select
          value={sendHour}
          disabled={pending}
          onChange={(e) => onSendHourChange(Number(e.target.value))}
          className="field !w-auto !py-2 !px-3 text-sm font-bold"
        >
          {sendHourOptions.map((h) => (
            <option key={h} value={h}>
              {hourLabel(h)}
            </option>
          ))}
        </select>
        <span className="text-[13px] font-semibold text-muted">each day</span>
      </div>
      <p className="text-[11.5px] font-medium text-muted mt-1.5">
        Every reminder in the sequence — 1st, 2nd, 3rd, and so on — aims for this same local
        time each day it&rsquo;s due to send.
      </p>

      {error && <p className="text-xs font-semibold text-danger-ink mt-2">{error}</p>}
    </div>
  );
}
