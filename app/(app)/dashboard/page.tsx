import Link from "next/link";
import { requireBusiness } from "@/lib/supabase/server";
import { getHeaderStats } from "@/lib/stats";
import { formatMoney } from "@/lib/money";
import { RunSchedulerButton } from "@/components/RunSchedulerButton";
import { BRAND } from "@/lib/brand";
import type { Customer, InvoiceRow, InvoiceSequence, SequenceStep } from "@/lib/types";

interface AdvisorCard {
  head: string;
  body: string;
  accent: string;
  action?: { label: string; href: string };
}

export default async function DashboardPage() {
  const { supabase, business } = await requireBusiness();

  // last 6 calendar months, oldest first, for the "Collected" chart (prototype design)
  const chartStart = new Date();
  chartStart.setUTCMonth(chartStart.getUTCMonth() - 5, 1);
  chartStart.setUTCHours(0, 0, 0, 0);

  const [stats, { data: upcoming }, { data: openInvoices }, { data: failedMsgs }, { data: recentPayments }] =
    await Promise.all([
      getHeaderStats(supabase, business.id, business.currency),
      supabase
        .from("invoice_sequences")
        .select(
          "*, invoice:invoices(number, amount_cents, currency, customer:customers(name)), sequence:sequences(steps)"
        )
        .eq("business_id", business.id)
        .eq("state", "armed")
        .not("next_run_at", "is", null)
        .lte("next_run_at", new Date(Date.now() + 7 * 86400000).toISOString())
        .order("next_run_at", { ascending: true })
        .limit(6),
      supabase
        .from("invoices_view")
        .select("*, customer:customers(*)")
        .eq("business_id", business.id)
        .in("status", ["outstanding"]),
      supabase
        .from("messages")
        .select("invoice_id")
        .eq("business_id", business.id)
        .eq("direction", "outbound")
        .eq("status", "failed")
        .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
        .limit(50),
      supabase
        .from("payments")
        .select("amount_cents, paid_at")
        .eq("business_id", business.id)
        .gte("paid_at", chartStart.toISOString()),
    ]);

  // bucket real payments into the last 6 calendar months (prototype: "Collected — last 6 months")
  const monthBuckets: { label: string; cents: number; current: boolean }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - i, 1);
    monthBuckets.push({
      label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
      cents: 0,
      current: i === 0,
    });
  }
  for (const p of (recentPayments ?? []) as { amount_cents: number; paid_at: string }[]) {
    const pd = new Date(p.paid_at);
    const idx = 5 - ((new Date().getUTCFullYear() - pd.getUTCFullYear()) * 12 + (new Date().getUTCMonth() - pd.getUTCMonth()));
    if (idx >= 0 && idx < 6) monthBuckets[idx].cents += p.amount_cents;
  }
  const maxMonth = Math.max(...monthBuckets.map((b) => b.cents), 1);

  const open = (openInvoices ?? []) as (InvoiceRow & { customer: Customer })[];
  const fmt = (c: number) => formatMoney(c, business.currency);

  // ---- rule-based advisor cards (max 3, plain English, per PRD guardrails) ----
  const advisor: AdvisorCard[] = [];

  // Failed deliveries come first — a reminder the customer never got is the one thing
  // this product must never be quiet about. (Owner also gets an email; see lib/notify.ts.)
  const openById = new Map(open.map((r) => [r.id, r]));
  const failedOpen = [
    ...new Set(((failedMsgs ?? []) as { invoice_id: string | null }[]).map((m) => m.invoice_id)),
  ]
    .filter((id): id is string => !!id && openById.has(id))
    .map((id) => openById.get(id)!);
  if (failedOpen.length > 0) {
    const first = failedOpen[0];
    advisor.push({
      head: `⚠️ ${failedOpen.length} ${failedOpen.length === 1 ? "reminder" : "reminders"} couldn't be delivered`,
      body: `${failedOpen.length === 1 ? `${first.customer?.name} isn't` : `${failedOpen.map((r) => r.customer?.name).slice(0, 2).join(" & ")}${failedOpen.length > 2 ? " and others" : ""} aren't`} getting your reminders — usually a wrong number or a dead email address. Fix the contact details and sending resumes automatically.`,
      accent: "var(--danger)",
      action: { label: "Fix contact details", href: `/invoices/${first.id}/edit` },
    });
  }

  const biggestLate = open
    .filter((r) => r.display_status === "late")
    .sort((a, b) => b.amount_cents - a.amount_cents)[0];
  if (biggestLate) {
    advisor.push({
      head: `${biggestLate.customer?.name} is your biggest overdue`,
      body: `${fmt(biggestLate.amount_cents)} across ${biggestLate.days_overdue} days. A firmer nudge from the invoice page usually moves things.`,
      accent: "var(--danger)",
      action: { label: "Open invoice", href: `/invoices/${biggestLate.id}` },
    });
  }
  if (
    stats.avgDaysToPay !== null &&
    stats.prevAvgDaysToPay !== null &&
    stats.avgDaysToPay < stats.prevAvgDaysToPay
  ) {
    const gain = stats.prevAvgDaysToPay - stats.avgDaysToPay;
    advisor.push({
      head: `You're getting paid ~${gain} days faster`,
      body: `Average days-to-pay dropped ${stats.prevAvgDaysToPay} → ${stats.avgDaysToPay} since you started ${BRAND}. That money lands earlier every month.`,
      accent: "var(--win)",
    });
  }
  const noPhone = open.filter((r) => !r.customer?.phone && !r.customer?.sms_opted_out);
  if (noPhone.length > 0) {
    advisor.push({
      head: `${noPhone.length} ${noPhone.length === 1 ? "invoice has" : "invoices have"} no mobile number`,
      body: `SMS reminders get paid about 3× faster than email alone. Add ${noPhone.length === 1 ? `a number for ${noPhone[0].customer?.name}` : `numbers for ${noPhone.slice(0, 2).map((r) => r.customer?.name).join(" & ")}`}?`,
      accent: "var(--accent)",
      action: { label: "Add numbers", href: `/invoices/${noPhone[0].id}/edit` },
    });
  }

  const maxBucket = Math.max(...stats.aging.map((b) => b.cents), 1);
  const bucketColor = (minDays: number) =>
    minDays > 60 ? "var(--danger)" : minDays > 30 ? "var(--accent)" : "var(--win)";
  const trend =
    stats.avgDaysToPay !== null && stats.prevAvgDaysToPay !== null
      ? stats.avgDaysToPay - stats.prevAvgDaysToPay
      : null;

  return (
    <div className="pt-3">
      <h1 className="sm:hidden font-disp font-extrabold text-[26px] tracking-[-0.02em] text-ink px-0.5">
        Your money
      </h1>
      <p className="text-[13px] font-semibold text-muted px-0.5 mb-4 sm:mb-5 mt-1 sm:mt-0">
        A plain-English read on who owes you what.
      </p>

      {/* stat grid: 2 cols mobile, 4 desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="section-label !text-[10.5px]">You&rsquo;re owed</p>
          <p className="font-disp font-bold text-[26px] text-ink tnum mt-1.5">
            {fmt(stats.outstandingCents)}
          </p>
        </div>
        <div className="card p-4">
          <p className="section-label !text-[10.5px] !text-danger-ink">Overdue</p>
          <p className="font-disp font-bold text-[26px] text-danger-ink tnum mt-1.5">
            {fmt(stats.overdueCents)}
          </p>
        </div>
        <div className="rounded-[18px] p-4 bg-accent border border-accent">
          <p className="section-label !text-[10.5px] !text-accent-ink opacity-80">
            Recovered by {BRAND}
          </p>
          <p className="font-disp font-bold text-[26px] text-accent-ink tnum mt-1.5">
            {fmt(stats.recoveredCents)}
          </p>
        </div>
        <div className="card p-4">
          <p className="section-label !text-[10.5px]">Avg days to pay</p>
          <p className="font-disp font-bold text-[26px] text-ink tnum mt-1.5">
            {stats.avgDaysToPay ?? "—"}
            {trend !== null && (
              <span
                className={`text-[13px] font-bold ml-2 ${trend <= 0 ? "text-win-ink" : "text-danger-ink"}`}
              >
                {trend <= 0 ? "↓" : "↑"} {Math.abs(trend)}d
              </span>
            )}
          </p>
        </div>
      </div>

      {/* aging */}
      <h2 className="font-disp font-extrabold text-base text-ink mt-7 mb-3 px-0.5">
        How old is what you&rsquo;re owed
      </h2>
      <div className="card p-[18px]">
        <div className="flex flex-col gap-[13px]">
          {stats.aging.map((b) => (
            <Link
              key={b.label}
              href={`/invoices?tab=outstanding&minDays=${b.minDays}${b.maxDays !== null ? `&maxDays=${b.maxDays}` : ""}`}
              className="flex items-center gap-3 group"
            >
              <span className="w-[74px] shrink-0 text-[12.5px] font-semibold text-muted">
                {b.label} days
              </span>
              <span className="flex-1 h-[26px] bg-surface2 rounded-lg overflow-hidden">
                <span
                  className="block h-full rounded-lg group-hover:opacity-80 transition-opacity"
                  style={{
                    width: `${b.cents > 0 ? Math.max(6, Math.round((b.cents / maxBucket) * 100)) : 0}%`,
                    background: bucketColor(b.minDays),
                  }}
                />
              </span>
              <span className="w-[76px] shrink-0 text-right font-disp font-bold text-[13px] text-ink tnum">
                {fmt(b.cents)}
              </span>
            </Link>
          ))}
        </div>
        <p className="text-xs text-muted mt-3.5">Tap a bar to see those invoices.</p>
      </div>

      {/* collected per month — prototype's "Your money" chart, from real payments */}
      <div className="card p-[18px] mt-4">
        <p className="font-bold text-[15px] text-ink mb-4">Collected — last 6 months</p>
        <div className="flex items-end gap-3.5 h-[150px]">
          {monthBuckets.map((b) => (
            <div key={b.label} className="flex-1 h-full flex flex-col items-center justify-end gap-2">
              <div
                className="w-full rounded-t-lg"
                title={fmt(b.cents)}
                style={{
                  background: b.current ? "var(--accent)" : "var(--surface2)",
                  height: `${b.cents > 0 ? Math.max(6, Math.round((b.cents / maxMonth) * 100)) : 2}%`,
                }}
              />
              <span className="text-[11px] font-semibold text-muted">{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* advisor */}
      {advisor.length > 0 && (
        <>
          <h2 className="font-disp font-extrabold text-base text-ink mt-7 mb-3 px-0.5">
            A few things worth knowing
          </h2>
          <div className="flex flex-col gap-3">
            {advisor.slice(0, 3).map((c) => (
              <div
                key={c.head}
                className="card px-4 py-[15px]"
                style={
                  // failed-delivery card gets the prototype's ⚠️ accent-soft alert style
                  c.head.includes("couldn't be delivered")
                    ? { border: "1px solid var(--accent)", background: "var(--accent-soft)", borderRadius: 14 }
                    : { borderLeft: `3px solid ${c.accent}`, borderRadius: 14 }
                }
              >
                <p className="font-bold text-[14.5px] text-ink">{c.head}</p>
                <p className="text-[13.5px] leading-relaxed text-muted mt-1">{c.body}</p>
                {c.action && (
                  <Link
                    href={c.action.href}
                    className="inline-block mt-2.5 px-3.5 py-2 rounded-[10px] bg-surface2 border border-hair text-[12.5px] font-bold text-ink hover:bg-surface transition-colors"
                  >
                    {c.action.label}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* upcoming */}
      <h2 className="font-disp font-extrabold text-base text-ink mt-7 mb-3 px-0.5">
        Coming up this week
      </h2>
      <div className="card overflow-hidden mb-5">
        {(upcoming ?? []).length === 0 && (
          <p className="p-5 text-sm text-muted font-medium">
            No reminders scheduled in the next 7 days.
          </p>
        )}
        {((upcoming ?? []) as (InvoiceSequence & {
          invoice: { number: string; customer: { name: string } };
          sequence: { steps: SequenceStep[] };
        })[]).map((u) => {
          const step = u.sequence?.steps?.[u.current_step];
          return (
            <Link
              key={u.id}
              href={`/invoices/${u.invoice_id}`}
              className="flex items-center justify-between gap-3 px-4 py-[13px] border-b border-hair last:border-b-0 hover:bg-surface2 transition-colors"
            >
              <span className="min-w-0 truncate">
                <span className="font-bold text-sm text-ink">{u.invoice?.customer?.name}</span>
                <span className="text-[13px] font-medium text-muted">
                  {" "}
                  · {step?.label ?? "reminder"} · {step?.channel === "sms" ? "SMS" : "email"}
                </span>
              </span>
              <span className="text-[12.5px] font-semibold text-muted shrink-0">
                {u.next_run_at &&
                  new Date(u.next_run_at).toLocaleString("en-US", {
                    weekday: "short",
                    hour: "numeric",
                    timeZone: business.timezone,
                  })}
              </span>
            </Link>
          );
        })}
      </div>

      <RunSchedulerButton />
    </div>
  );
}
