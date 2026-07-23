/** Timezone helpers without external deps. */

function tzOffsetMs(tz: string, utcDate: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(utcDate)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour % 24,
    +parts.minute,
    +parts.second
  );
  return asUtc - utcDate.getTime();
}

/** UTC instant for `hour`:00 local time on `dateStr` (YYYY-MM-DD) in `tz`. */
export function zonedTimeToUtc(dateStr: string, hour: number, tz: string): Date {
  const guess = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00Z`);
  return new Date(guess.getTime() - tzOffsetMs(tz, guess));
}

export function localParts(tz: string, date: Date = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  return {
    hour: +parts.hour % 24,
    weekday: parts.weekday, // "Sun".."Sat"
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/**
 * Compliance window: send only within the business's own quiet-hours range, recipient-local.
 * The range itself is bounded 7:00am–10:00pm everywhere (a legal floor/ceiling for automated
 * SMS/email hours across markets — TCPA-style rules) — the standard suggested default is
 * 8:00am–9:00pm, but each business can pick their own window inside 7–22 (see
 * components/QuietHoursEditor.tsx). Skipping Sunday is the recommended default (matches most
 * Western markets) but not forced — allowSunday lets a business opt in for markets where Sunday
 * is a normal business day (much of the Middle East, parts of Asia/Africa) or where they simply
 * know their customers best.
 * Returns `date` if inside the window, else the next allowed send instant (falls back to the
 * business's preferred send hour, clamped into the window, when rolling to the next day).
 */
export function nextAllowedSendTime(
  date: Date,
  tz: string,
  quietStart = 8,
  quietEnd = 21,
  allowSunday = false,
  fallbackHour?: number
): Date {
  const rollHour = Math.min(Math.max(fallbackHour ?? quietStart + 2, quietStart), quietEnd - 1);
  let candidate = new Date(date);
  for (let i = 0; i < 8; i++) {
    const { hour, weekday, dateStr } = localParts(tz, candidate);
    if ((allowSunday || weekday !== "Sun") && hour >= quietStart && hour < quietEnd) return candidate;
    // move to the roll-forward hour local — today if we're before the window, otherwise tomorrow
    const todayAtRoll = zonedTimeToUtc(dateStr, rollHour, tz);
    candidate =
      todayAtRoll > candidate
        ? todayAtRoll
        : new Date(zonedTimeToUtc(dateStr, rollHour, tz).getTime() + 24 * 3600 * 1000);
  }
  return candidate;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayInTz(tz: string): string {
  return localParts(tz).dateStr;
}

/** Calendar days overdue (matches the invoices_view SQL derivation). */
export function daysOverdue(dueAt: string): number {
  const due = new Date(dueAt + "T00:00:00Z").getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((today - due) / 86400000));
}
