import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/supabase/server";
import { formatMoney, formatDate } from "@/lib/money";
import { payLinkFor } from "@/lib/scheduler";
import { PLANS, type BillingInterval, type PlanKey } from "@/lib/plans";
import { isFreeTierInvoiceBlocked } from "@/lib/trial";
import { StatusPill, dueInDaysOf } from "@/components/StatusPill";
import { InvoiceActions } from "@/components/InvoiceActions";
import { BackIcon, PhoneIcon, MailIcon, CheckIcon } from "@/components/icons";
import type { Customer, InvoiceRow, InvoiceSequence, Message, SequenceStep } from "@/lib/types";

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, business } = await requireBusiness();

  const { data: invoice } = await supabase
    .from("invoices_view")
    .select("*, customer:customers(*)")
    .eq("id", id)
    .maybeSingle();
  if (!invoice) notFound();
  const inv = invoice as InvoiceRow & { customer: Customer };

  const [{ data: iseq }, { data: messages }, { data: payments }] = await Promise.all([
    supabase
      .from("invoice_sequences")
      .select("*, sequence:sequences(steps, tone)")
      .eq("invoice_id", id)
      .maybeSingle(),
    supabase.from("messages").select("*").eq("invoice_id", id).order("created_at", { ascending: false }),
    supabase.from("payments").select("*").eq("invoice_id", id),
  ]);

  const seq = iseq as (InvoiceSequence & { sequence: { steps: SequenceStep[]; tone: string } }) | null;
  const nextStep =
    seq?.state === "armed" && seq.sequence?.steps ? seq.sequence.steps[seq.current_step] : null;

  // no-card free tier: this invoice is beyond the 2-invoice cap and has never been armed —
  // show the upgrade wall (components/InvoiceActions.tsx) instead of a plain "Arm reminders"
  const needsUpgrade =
    inv.status !== "paid" && !seq && (await isFreeTierInvoiceBlocked(supabase, business, inv.created_at));
  const intendedPlanRaw = business.signup_source?.intended_plan;
  const intendedPlan: PlanKey = intendedPlanRaw && intendedPlanRaw in PLANS ? (intendedPlanRaw as PlanKey) : "crew";
  const intendedInterval: BillingInterval = business.signup_source?.intended_interval === "yearly" ? "yearly" : "monthly";

  const timeline = ((messages ?? []) as Message[]).map((m) => ({
    id: m.id,
    kind: m.direction === "inbound" ? "reply" : m.channel,
    title:
      m.direction === "inbound"
        ? "Reply from customer"
        : `${m.channel === "sms" ? "SMS" : "Email"} · ${statusLabel(m.status)}`,
    detail: m.subject || m.body,
    when: new Date(m.sent_at ?? m.created_at).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: business.timezone,
    }),
    error: m.error,
  }));

  return (
    <div className="max-w-[560px] mx-auto pt-3">
      <Link
        href="/invoices"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
      >
        <BackIcon />
        All invoices
      </Link>

      {sp.upgraded === "1" && business.plan !== "free" && (
        <div className="card p-4 bg-win-soft text-win-ink text-sm font-bold mt-3">
          🎉 You&rsquo;re upgraded — tap &ldquo;Arm reminders&rdquo; below to start chasing this invoice.
        </div>
      )}

      <div className="card p-5 sm:p-6 mt-3" style={{ borderRadius: 22, boxShadow: "0 1px 3px var(--shadow)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-disp font-extrabold text-[21px] tracking-[-0.01em] text-ink">
              {inv.customer?.name}
            </h1>
            <p className="text-[13px] font-medium text-muted mt-[3px]">
              #{inv.number} · issued {formatDate(inv.issued_at)} · due {formatDate(inv.due_at)}
            </p>
          </div>
          <span className="shrink-0">
            <StatusPill
              status={inv.display_status}
              daysOverdue={inv.days_overdue}
              dueInDays={dueInDaysOf(inv.due_at)}
              long
            />
          </span>
        </div>

        <p className="font-disp font-bold text-[clamp(38px,10vw,46px)] tracking-[-0.02em] text-ink tnum mt-4">
          {formatMoney(inv.amount_cents, inv.currency)}
        </p>

        {inv.status === "paid" && inv.paid_at && (
          <div className="mt-3 flex items-center gap-2.5 bg-win-soft text-win-ink rounded-xl px-3.5 py-3 text-sm font-bold">
            <CheckIcon size={18} />
            Paid {formatDate(inv.paid_at.slice(0, 10))}
            {payments?.[0]?.method === "stripe" ? " via Pay Now link" : ""} · reminders stopped
          </div>
        )}

        {inv.status !== "paid" && nextStep && seq?.next_run_at && (
          <div className="mt-3 bg-surface2 rounded-xl px-3.5 py-3 text-[13.5px] font-semibold text-muted">
            Next: {nextStep.label} via {nextStep.channel === "sms" ? "SMS" : "email"} ·{" "}
            {new Date(seq.next_run_at).toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZone: business.timezone,
            })}
          </div>
        )}
        {inv.status === "paused" && !needsUpgrade && (
          <div className="mt-3 bg-surface2 rounded-xl px-3.5 py-3 text-[13.5px] font-semibold text-muted">
            Reminders paused for this customer
          </div>
        )}

        <InvoiceActions
          invoiceId={inv.id}
          status={inv.status}
          sequenceState={seq?.state ?? null}
          payLink={payLinkFor(inv)}
          amountStr={formatMoney(inv.amount_cents, inv.currency)}
          customerName={inv.customer?.name ?? "customer"}
          ownerFirstName={(business.from_name || business.name).split(" ")[0]}
          canPayOnline={!!business.stripe_account_id && !!business.stripe_charges_enabled}
          upgrade={needsUpgrade ? { plan: intendedPlan, interval: intendedInterval } : null}
        />

        <div className="mt-4 flex flex-col gap-2 text-[13.5px] font-medium text-muted">
          {inv.customer?.phone && (
            <span className="flex items-center gap-2.5">
              <PhoneIcon />
              {inv.customer.phone}
              {inv.customer.sms_opted_out && (
                <span className="text-danger-ink font-bold">· opted out of SMS</span>
              )}
            </span>
          )}
          {inv.customer?.email && (
            <span className="flex items-center gap-2.5">
              <MailIcon />
              {inv.customer.email}
            </span>
          )}
          {!inv.customer?.phone && !inv.customer?.email && (
            <span className="bg-amber-soft text-amber-ink rounded-[10px] px-3 py-2.5 font-semibold">
              No contact details — reminders can&rsquo;t send.{" "}
              <Link href={`/invoices/${inv.id}/edit`} className="underline font-bold">
                Add them
              </Link>
            </span>
          )}
          {!inv.customer?.phone && inv.customer?.email && (
            <span className="bg-amber-soft text-amber-ink rounded-[10px] px-3 py-2.5 font-semibold">
              No mobile number — SMS reminders can&rsquo;t send.{" "}
              <Link href={`/invoices/${inv.id}/edit`} className="underline font-bold">
                Add one to get paid faster
              </Link>
            </span>
          )}
          {inv.notes && <p className="pt-1">📝 {inv.notes}</p>}
        </div>
      </div>

      {/* activity timeline */}
      <h2 className="font-disp font-extrabold text-base text-ink mt-6 mb-3 px-0.5">Activity</h2>
      {timeline.length === 0 ? (
        <div className="card p-5 text-sm text-muted font-medium">
          Nothing sent yet — reminders will show up here as they go out.
        </div>
      ) : (
        <div className="relative pl-1.5">
          {timeline.map((e, i) => (
            <div key={e.id} className="flex gap-3 pb-4 relative">
              <div className="shrink-0 w-3 flex flex-col items-center">
                <span
                  className="w-[11px] h-[11px] rounded-full z-[2]"
                  style={{
                    border: "2px solid var(--bg)",
                    background:
                      e.kind === "reply"
                        ? "var(--win)"
                        : e.kind === "sms" || e.kind === "email"
                          ? "var(--accent)"
                          : "var(--muted)",
                  }}
                />
                {i < timeline.length - 1 && (
                  <span className="flex-1 w-[2px] mt-0.5" style={{ background: "var(--hair)" }} />
                )}
              </div>
              <div className="flex-1 min-w-0 -mt-0.5">
                <div className="flex justify-between gap-2.5">
                  <span className="font-bold text-[13.5px] text-ink">{e.title}</span>
                  <span className="text-xs font-medium text-muted shrink-0">{e.when}</span>
                </div>
                <p className="text-[13px] leading-relaxed text-muted mt-0.5 line-clamp-3 whitespace-pre-line">
                  {e.detail}
                </p>
                {e.error && <p className="text-xs text-danger-ink mt-1">{e.error}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "simulated":
      return "simulated (no send keys yet)";
    case "delivered":
      return "delivered ✓";
    case "opened":
      return "opened 👀";
    case "clicked":
      return "clicked 🔗";
    case "failed":
      return "failed ⚠️";
    default:
      return status;
  }
}
