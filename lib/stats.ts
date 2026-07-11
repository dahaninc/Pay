import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoiceRow, Payment } from "@/lib/types";

export interface HeaderStats {
  outstandingCents: number;
  overdueCents: number;
  recoveredCents: number;
  avgDaysToPay: number | null;
  prevAvgDaysToPay: number | null;
  aging: { label: string; cents: number; count: number; minDays: number; maxDays: number | null }[];
  currency: string;
}

export async function getHeaderStats(
  db: SupabaseClient,
  businessId: string,
  currency: string
): Promise<HeaderStats> {
  const [{ data: invoices }, { data: payments }, { data: remindedIds }] = await Promise.all([
    db.from("invoices_view").select("*").eq("business_id", businessId),
    db.from("payments").select("*").eq("business_id", businessId),
    db
      .from("messages")
      .select("invoice_id")
      .eq("business_id", businessId)
      .eq("direction", "outbound")
      .not("invoice_id", "is", null),
  ]);

  const rows = (invoices ?? []) as InvoiceRow[];
  const pays = (payments ?? []) as Payment[];
  const reminded = new Set((remindedIds ?? []).map((m) => m.invoice_id));

  const outstanding = rows.filter((r) => r.display_status === "outstanding" || r.display_status === "late");
  const late = rows.filter((r) => r.display_status === "late");

  const outstandingCents = outstanding.reduce((s, r) => s + r.amount_cents, 0);
  const overdueCents = late.reduce((s, r) => s + r.amount_cents, 0);

  // "Recovered by PaidUp" = payments on invoices that got at least one reminder
  const recoveredCents = pays
    .filter((p) => reminded.has(p.invoice_id))
    .reduce((s, p) => s + p.amount_cents, 0);

  // avg days-to-pay, this quarter vs previous quarter
  const paid = rows.filter((r) => r.status === "paid" && r.paid_at);
  const daysToPay = (r: InvoiceRow) =>
    Math.max(0, (new Date(r.paid_at!).getTime() - new Date(r.issued_at).getTime()) / 86400000);
  const qMs = 91 * 86400000;
  const nowMs = Date.now();
  const thisQ = paid.filter((r) => nowMs - new Date(r.paid_at!).getTime() < qMs);
  const prevQ = paid.filter((r) => {
    const age = nowMs - new Date(r.paid_at!).getTime();
    return age >= qMs && age < 2 * qMs;
  });
  const avg = (arr: InvoiceRow[]) =>
    arr.length ? Math.round(arr.reduce((s, r) => s + daysToPay(r), 0) / arr.length) : null;

  const buckets = [
    { label: "0–30", minDays: 0, maxDays: 30 as number | null },
    { label: "31–60", minDays: 31, maxDays: 60 as number | null },
    { label: "61–90", minDays: 61, maxDays: 90 as number | null },
    { label: "90+", minDays: 91, maxDays: null },
  ];
  const aging = buckets.map((b) => {
    const inBucket = outstanding.filter(
      (r) => r.days_overdue >= b.minDays && (b.maxDays === null || r.days_overdue <= b.maxDays)
    );
    return {
      ...b,
      cents: inBucket.reduce((s, r) => s + r.amount_cents, 0),
      count: inBucket.length,
    };
  });

  return {
    outstandingCents,
    overdueCents,
    recoveredCents,
    avgDaysToPay: avg(thisQ),
    prevAvgDaysToPay: avg(prevQ),
    aging,
    currency,
  };
}
