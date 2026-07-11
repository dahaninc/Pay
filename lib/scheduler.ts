import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Business,
  Customer,
  Invoice,
  InvoiceSequence,
  Sequence,
  SequenceStep,
} from "@/lib/types";
import { formatMoney, formatDate } from "@/lib/money";
import { nextAllowedSendTime, zonedTimeToUtc, addDays, daysOverdue } from "@/lib/tz";
import { renderTemplate, emailHtml, linkifyPayLink, type MergeContext } from "@/lib/templates";
import { sendEmail, sendSms } from "@/lib/senders";
import { canSend } from "@/lib/plans";

const SEND_HOUR = 10; // local time reminders aim for

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function payLinkFor(invoice: Pick<Invoice, "pay_token">): string {
  return `${appUrl()}/pay/${invoice.pay_token}`;
}

/** UTC instant a step should fire for a given invoice. */
export function stepSendTime(step: SequenceStep, dueAt: string, tz: string): Date {
  const date = addDays(dueAt, step.offset_days);
  return zonedTimeToUtc(date, SEND_HOUR, tz);
}

/**
 * Initial arming: first step whose send time is in the future; if the invoice
 * is already past every step, fire the final step at the next allowed time.
 */
export function armingPlan(
  steps: SequenceStep[],
  dueAt: string,
  tz: string,
  now = new Date()
): { stepIndex: number; nextRunAt: Date } {
  for (let i = 0; i < steps.length; i++) {
    const t = stepSendTime(steps[i], dueAt, tz);
    if (t > now) return { stepIndex: i, nextRunAt: nextAllowedSendTime(t, tz) };
  }
  return {
    stepIndex: steps.length - 1,
    nextRunAt: nextAllowedSendTime(now, tz),
  };
}

function mergeContext(business: Business, customer: Customer, invoice: Invoice): MergeContext {
  return {
    first_name: customer.name.split(" ")[0],
    amount: formatMoney(invoice.amount_cents, invoice.currency),
    invoice_no: invoice.number,
    days_overdue: String(daysOverdue(invoice.due_at)),
    due_date: formatDate(invoice.due_at),
    pay_link: payLinkFor(invoice),
    business_name: business.from_name || business.name,
  };
}

export interface ScheduledSendOutcome {
  invoiceId: string;
  action: "sent" | "simulated" | "failed" | "deferred" | "skipped" | "stopped";
  detail?: string;
}

/**
 * Process all due reminder steps. Idempotent: each (invoice_sequence, step) pair
 * is guarded by a unique idempotency key on messages. Safe to run every 5 minutes.
 * Works with either an RLS-scoped client (in-app "run now") or the service client (cron).
 */
export async function processDueReminders(
  db: SupabaseClient,
  opts: { businessId?: string; limit?: number } = {}
): Promise<ScheduledSendOutcome[]> {
  const now = new Date();
  let query = db
    .from("invoice_sequences")
    .select("*")
    .eq("state", "armed")
    .lte("next_run_at", now.toISOString())
    .limit(opts.limit ?? 50);
  if (opts.businessId) query = query.eq("business_id", opts.businessId);

  const { data: due, error } = await query;
  if (error) throw new Error(`scheduler query failed: ${error.message}`);
  if (!due?.length) return [];

  const outcomes: ScheduledSendOutcome[] = [];
  for (const iseq of due as InvoiceSequence[]) {
    outcomes.push(await processOne(db, iseq, now));
  }
  return outcomes;
}

async function processOne(
  db: SupabaseClient,
  iseq: InvoiceSequence,
  now: Date
): Promise<ScheduledSendOutcome> {
  const [{ data: invoice }, { data: sequence }, { data: business }] = await Promise.all([
    db.from("invoices").select("*").eq("id", iseq.invoice_id).single(),
    db.from("sequences").select("*").eq("id", iseq.sequence_id).single(),
    db.from("businesses").select("*").eq("id", iseq.business_id).single(),
  ]);
  if (!invoice || !sequence || !business)
    return { invoiceId: iseq.invoice_id, action: "skipped", detail: "missing related row" };

  const inv = invoice as Invoice;
  const seq = sequence as Sequence;
  const biz = business as Business;

  // paid / paused / written off → stop the sequence
  if (inv.status !== "outstanding") {
    await db
      .from("invoice_sequences")
      .update({ state: inv.status === "paid" ? "stopped" : "paused", next_run_at: null })
      .eq("id", iseq.id);
    return { invoiceId: inv.id, action: "stopped", detail: `invoice ${inv.status}` };
  }

  // trial expired / plan lapsed → defer a day, don't send
  if (!canSend(biz)) {
    await db
      .from("invoice_sequences")
      .update({ next_run_at: new Date(now.getTime() + 86400000).toISOString() })
      .eq("id", iseq.id);
    return { invoiceId: inv.id, action: "deferred", detail: "subscription inactive" };
  }

  // quiet hours / Sunday → defer to next allowed window
  const allowed = nextAllowedSendTime(now, biz.timezone, biz.quiet_start, biz.quiet_end);
  if (allowed.getTime() > now.getTime() + 60000) {
    await db
      .from("invoice_sequences")
      .update({ next_run_at: allowed.toISOString() })
      .eq("id", iseq.id);
    return { invoiceId: inv.id, action: "deferred", detail: "quiet hours" };
  }

  const steps = seq.steps as SequenceStep[];
  const step = steps[iseq.current_step];
  if (!step) {
    await db
      .from("invoice_sequences")
      .update({ state: "completed", next_run_at: null })
      .eq("id", iseq.id);
    return { invoiceId: inv.id, action: "stopped", detail: "sequence complete" };
  }

  const { data: customer } = await db
    .from("customers")
    .select("*")
    .eq("id", inv.customer_id)
    .single();
  if (!customer)
    return { invoiceId: inv.id, action: "skipped", detail: "customer missing" };
  const cust = customer as Customer;

  // channel resolution with opt-out + missing-contact fallbacks
  let channel = step.channel;
  if (channel === "sms" && (!cust.phone || cust.sms_opted_out || !cust.sms_consent)) {
    channel = "email";
  }
  if (channel === "email" && (!cust.email || cust.email_opted_out)) {
    channel = cust.phone && !cust.sms_opted_out && cust.sms_consent ? "sms" : channel;
  }
  const hasDestination =
    channel === "sms" ? !!cust.phone : !!cust.email && !cust.email_opted_out;

  const emailRecipients = [cust.email, ...(cust.extra_emails ?? [])].filter(Boolean) as string[];
  const idempotencyKey = `${iseq.id}:${iseq.current_step}`;
  const ctx = mergeContext(biz, cust, inv);
  let body = renderTemplate(step.body, ctx);
  const subject = step.subject ? renderTemplate(step.subject, ctx) : undefined;

  // per-market SMS opt-out language
  if (channel === "sms") {
    if (["US", "CA"].includes(biz.country)) {
      if (!/reply stop/i.test(body)) body += " Reply STOP to opt out.";
    } else {
      body += ` Opt out: ${appUrl()}/pay/${inv.pay_token}?optout=sms`;
    }
  }

  if (!hasDestination) {
    // nothing to send this step with — advance past it
    await advance(db, iseq, steps, inv, biz, now);
    return { invoiceId: inv.id, action: "skipped", detail: "no contact info for channel" };
  }

  // idempotency guard: if this (sequence, step) already has a message, just advance
  const { error: insertErr } = await db.from("messages").insert({
    business_id: biz.id,
    invoice_id: inv.id,
    customer_id: cust.id,
    channel,
    direction: "outbound",
    to_address: channel === "sms" ? cust.phone : emailRecipients.join(", "),
    subject: subject ?? null,
    body,
    status: "queued",
    step_index: iseq.current_step,
    idempotency_key: idempotencyKey,
  });
  if (insertErr) {
    if (insertErr.code === "23505") {
      await advance(db, iseq, steps, inv, biz, now);
      return { invoiceId: inv.id, action: "skipped", detail: "already sent (idempotent)" };
    }
    return { invoiceId: inv.id, action: "failed", detail: insertErr.message };
  }

  const result =
    channel === "sms"
      ? await sendSms({ to: cust.phone!, body })
      : await sendEmail({
          to: emailRecipients,
          subject: subject || `Invoice ${inv.number} from ${ctx.business_name}`,
          html: linkifyPayLink(emailHtml(body, ctx.business_name), ctx.pay_link),
          replyTo: biz.reply_to_email,
          fromName: ctx.business_name,
        });

  await db
    .from("messages")
    .update({
      status: result.status,
      provider_id: result.providerId ?? null,
      error: result.error ?? null,
      sent_at: new Date().toISOString(),
    })
    .eq("idempotency_key", idempotencyKey);

  await db.from("events").insert({
    business_id: biz.id,
    type: `reminder_${result.status}`,
    entity: "invoice",
    entity_id: inv.id,
    data: { step: iseq.current_step, channel, label: step.label },
  });

  await advance(db, iseq, steps, inv, biz, now);
  return {
    invoiceId: inv.id,
    action: result.status === "failed" ? "failed" : result.status,
    detail: `${step.label} via ${channel}${result.error ? `: ${result.error}` : ""}`,
  };
}

async function advance(
  db: SupabaseClient,
  iseq: InvoiceSequence,
  steps: SequenceStep[],
  inv: Invoice,
  biz: Business,
  now: Date
) {
  const nextIndex = iseq.current_step + 1;
  if (nextIndex >= steps.length) {
    await db
      .from("invoice_sequences")
      .update({ state: "completed", current_step: nextIndex, next_run_at: null })
      .eq("id", iseq.id);
    return;
  }
  let nextRun = stepSendTime(steps[nextIndex], inv.due_at, biz.timezone);
  // never fire more than one step per invoice per 24h (catch-up guard)
  const floor = new Date(now.getTime() + 24 * 3600 * 1000);
  if (nextRun < floor) nextRun = floor;
  nextRun = nextAllowedSendTime(nextRun, biz.timezone, biz.quiet_start, biz.quiet_end);

  await db
    .from("invoice_sequences")
    .update({ current_step: nextIndex, next_run_at: nextRun.toISOString() })
    .eq("id", iseq.id);
}

/** Stop the reminder sequence for an invoice (payment received, pause, write-off). */
export async function stopSequence(
  db: SupabaseClient,
  invoiceId: string,
  state: "stopped" | "paused" = "stopped"
) {
  await db
    .from("invoice_sequences")
    .update({ state, next_run_at: null })
    .eq("invoice_id", invoiceId);
}

/** Re-arm a paused sequence. */
export async function resumeSequence(
  db: SupabaseClient,
  invoiceId: string,
  dueAt: string,
  tz: string
) {
  const { data: iseq } = await db
    .from("invoice_sequences")
    .select("*, sequence:sequences(steps)")
    .eq("invoice_id", invoiceId)
    .single();
  if (!iseq) return;
  const steps = (iseq.sequence as { steps: SequenceStep[] }).steps;
  const plan = armingPlan(steps, dueAt, tz);
  await db
    .from("invoice_sequences")
    .update({
      state: "armed",
      current_step: plan.stepIndex,
      next_run_at: plan.nextRunAt.toISOString(),
    })
    .eq("id", iseq.id);
}
