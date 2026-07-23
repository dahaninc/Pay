import Link from "next/link";
import { requireBusiness } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { getHeaderStats } from "@/lib/stats";
import { StatusPill, dueInDaysOf } from "@/components/StatusPill";
import { SettingsIcon } from "@/components/icons";
import { BRAND_TLD } from "@/lib/brand";
import type { InvoiceRow, InvoiceSequence, Message, Customer } from "@/lib/types";

const TABS = [
  { key: "outstanding", label: "Outstanding" },
  { key: "late", label: "Late" },
  { key: "paid", label: "Paid" },
  { key: "all", label: "All" },
] as const;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; minDays?: string; maxDays?: string; welcome?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab ?? "outstanding";
  const q = (params.q ?? "").toLowerCase();
  const { supabase, business } = await requireBusiness();

  const [{ data: invoicesData }, stats] = await Promise.all([
    supabase
      .from("invoices_view")
      .select("*, customer:customers(*)")
      .eq("business_id", business.id)
      .order("due_at", { ascending: true }),
    getHeaderStats(supabase, business.id, business.currency),
  ]);

  const all = (invoicesData ?? []) as (InvoiceRow & { customer: Customer })[];
  const count = (key: string) =>
    all.filter((r) => {
      if (key === "outstanding") return r.display_status === "outstanding" || r.display_status === "late";
      if (key === "late") return r.display_status === "late";
      if (key === "paid") return r.display_status === "paid";
      return true;
    }).length;

  let rows = all.filter((r) => {
    if (tab === "outstanding") return r.display_status === "outstanding" || r.display_status === "late";
    if (tab === "late") return r.display_status === "late";
    if (tab === "paid") return r.display_status === "paid";
    return true;
  });
  if (q) {
    rows = rows.filter(
      (r) =>
        r.customer?.name.toLowerCase().includes(q) ||
        r.number.toLowerCase().includes(q) ||
        (r.amount_cents / 100).toString().includes(q)
    );
  }
  if (params.minDays) rows = rows.filter((r) => r.days_overdue >= parseInt(params.minDays!, 10));
  if (params.maxDays) rows = rows.filter((r) => r.days_overdue <= parseInt(params.maxDays!, 10));

  // late first (oldest first), then by amount desc; paid sinks
  const rank = (r: InvoiceRow) =>
    r.display_status === "paid" ? 3 : r.display_status === "paused" ? 2 : r.display_status === "late" ? 0 : 1;
  rows.sort((a, b) => rank(a) - rank(b) || b.days_overdue - a.days_overdue || b.amount_cents - a.amount_cents);

  const ids = rows.map((r) => r.id);
  const [{ data: seqs }, { data: lastMsgs }] = await Promise.all([
    ids.length
      ? supabase.from("invoice_sequences").select("*").in("invoice_id", ids)
      : Promise.resolve({ data: [] as InvoiceSequence[] }),
    ids.length
      ? supabase
          .from("messages")
          .select("invoice_id, channel, status, direction, sent_at, created_at")
          .in("invoice_id", ids)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Partial<Message>[] }),
  ]);
  const seqByInvoice = new Map((seqs ?? []).map((s) => [s.invoice_id, s as InvoiceSequence]));
  const lastMsgByInvoice = new Map<string, Partial<Message>>();
  for (const m of (lastMsgs ?? []) as Partial<Message>[]) {
    if (m.invoice_id && !lastMsgByInvoice.has(m.invoice_id)) lastMsgByInvoice.set(m.invoice_id, m);
  }

  const totalCents = rows.reduce((s, r) => s + r.amount_cents, 0);
  const personalName =
    business.from_name && business.from_name !== business.name
      ? business.from_name.split(" ")[0]
      : null;

  return (
    <div>
      {/* mobile greeting header */}
      <div className="sm:hidden flex items-center justify-between pt-3 pb-1">
        <div className="flex items-center gap-3">
          <span className="w-[38px] h-[38px] rounded-xl bg-accent text-accent-ink font-disp font-extrabold text-base flex items-center justify-center">
            {business.name.charAt(0).toUpperCase()}
          </span>
          <span>
            <span className="block font-disp font-bold text-base leading-tight tracking-[-0.01em] text-ink">
              {business.name}
            </span>
            <span className="block text-xs font-semibold text-muted mt-0.5">
              {greeting()}
              {personalName ? `, ${personalName}` : ""}
            </span>
          </span>
        </div>
        <Link
          href="/settings"
          className="w-[38px] h-[38px] rounded-full bg-surface border border-hair flex items-center justify-center text-muted"
        >
          <SettingsIcon size={19} />
        </Link>
      </div>

      {params.welcome && (
        <div className="card p-4 my-3 bg-accent-soft text-accent-text text-sm font-semibold">
          Welcome 🎉 Add your first unpaid invoice and we&rsquo;ll take it from there.
        </div>
      )}

      {/* hero: the number is the hero */}
      <div className="pt-4 pb-1">
        <p className="section-label" style={{ letterSpacing: "0.09em" }}>
          You&rsquo;re owed
        </p>
        <p className="font-disp font-bold text-[clamp(46px,13vw,60px)] leading-none tracking-[-0.025em] text-ink tnum mt-2">
          {formatMoney(stats.outstandingCents, business.currency)}
        </p>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <Link href="/invoices?tab=late" className="text-sm font-bold text-danger-ink">
            {formatMoney(stats.overdueCents, business.currency)} overdue
          </Link>
          <span className="w-[3px] h-[3px] rounded-full bg-muted" />
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-bold text-win-ink">
            <span
              className="w-2 h-2 rounded-full bg-win"
              style={{ boxShadow: "0 0 0 3px var(--win-soft)", animation: "ppPulse 2.6s ease-in-out infinite" }}
            />
            {formatMoney(stats.recoveredCents, business.currency)} recovered
          </Link>
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-2 mt-5 mb-3 overflow-x-auto -mx-4 px-4 [scrollbar-width:none]">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/invoices?tab=${t.key}`}
            className={tab === t.key ? "pill-tab-on" : "pill-tab-off"}
          >
            {t.label}
            <span className="opacity-55 ml-1.5">{count(t.key)}</span>
          </Link>
        ))}
      </div>

      {/* search */}
      <form action="/invoices">
        <input type="hidden" name="tab" value={tab} />
        <input
          name="q"
          defaultValue={params.q ?? ""}
          className="field !bg-surface !py-3"
          placeholder="Search customer, invoice #, amount…"
        />
      </form>

      {(params.minDays || params.maxDays) && (
        <div className="mt-3 text-sm font-semibold text-muted">
          Filtered by age.{" "}
          <Link className="underline text-ink" href={`/invoices?tab=${tab}`}>
            Clear filter
          </Link>
        </div>
      )}

      <p className="text-[13px] font-semibold text-muted mt-4 mb-2.5 px-0.5">
        {rows.length} {rows.length === 1 ? "invoice" : "invoices"} ·{" "}
        <span className="font-bold text-ink tnum">{formatMoney(totalCents, business.currency)}</span>
      </p>

      {/* list */}
      {rows.length === 0 ? (
        <EmptyState tab={tab} alias={business.inbound_alias} />
      ) : (
        <div className="card overflow-hidden" style={{ borderRadius: 20, boxShadow: "0 1px 3px var(--shadow)" }}>
          {rows.map((r) => {
            const seq = seqByInvoice.get(r.id);
            const last = lastMsgByInvoice.get(r.id);
            const meta =
              seq?.state === "armed" && seq.next_run_at
                ? `next reminder ${relativeTime(seq.next_run_at)}`
                : seq?.state === "paused" || r.status === "paused"
                  ? "reminders paused"
                  : last?.sent_at && last.direction === "outbound"
                    ? `${last.channel === "sms" ? "SMS" : "email"} ${last.status} ${relativeTime(last.sent_at)}`
                    : r.status === "paid"
                      ? "paid"
                      : "reminders off";
            return (
              <Link
                key={r.id}
                href={`/invoices/${r.id}`}
                className="flex items-center gap-3.5 px-4 py-3.5 border-b border-hair last:border-b-0 hover:bg-surface2 transition-colors"
                style={r.display_status === "paid" ? { background: "var(--win-tint)" } : undefined}
              >
                <span className="w-[42px] h-[42px] rounded-[11px] bg-surface2 grid place-items-center font-bold text-sm text-muted shrink-0">
                  {initialsOf(r.customer?.name)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-[15px] text-ink truncate">
                    {r.customer?.name ?? "—"}
                  </span>
                  <span className="block text-[12.5px] font-medium text-muted mt-[3px] truncate">
                    #{r.number} · {meta}
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block font-disp font-bold text-[15px] text-ink tnum">
                    {formatMoney(r.amount_cents, r.currency)}
                  </span>
                  <span className="mt-1 inline-block">
                    <StatusPill
                      status={r.display_status}
                      daysOverdue={r.days_overdue}
                      dueInDays={dueInDaysOf(r.due_at)}
                    />
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ tab, alias }: { tab: string; alias: string }) {
  if (tab === "paid")
    return (
      <div className="card p-8 text-center text-muted text-sm font-medium">
        Nothing paid yet — your recovered money will show up here. 💰
      </div>
    );
  if (tab === "late")
    return (
      <div className="card p-8 text-center text-muted text-sm font-medium">
        No late invoices. That&rsquo;s exactly how it should be. 🎉
      </div>
    );
  return (
    <div className="card p-8 text-center">
      <p className="text-4xl mb-3">🧾</p>
      <h2 className="font-disp font-extrabold text-lg text-ink">Add your first unpaid invoice</h2>
      <p className="text-muted text-sm mt-1 mb-5 max-w-sm mx-auto">
        Type it in 20 seconds, snap a photo of a paper one, or forward the invoice email to your
        private address.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link href="/invoices/new" className="btn-primary">
          ＋ Add invoice
        </Link>
        <Link href="/invoices/scan" className="btn-secondary">
          📸 Snap a photo
        </Link>
      </div>
      <p className="text-xs text-muted mt-5">
        Or forward invoice emails to{" "}
        <span className="font-mono font-semibold text-ink">bills+{alias}@{BRAND_TLD}</span>
      </p>
    </div>
  );
}

function initialsOf(name: string | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "—";
}

function relativeTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const label = mins < 60 ? `${mins}m` : hours < 48 ? `${hours}h` : `${days}d`;
  return diff < 0 ? `${label} ago` : `in ${label}`;
}
