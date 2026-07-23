"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/supabase/server";
import { parseAmountToCents, isSupportedCurrency } from "@/lib/money";
import { invoiceLimitFor, canSend } from "@/lib/plans";
import { endTrialIfFairUseExceeded, isFreeTierInvoiceBlocked, TRIAL_FAIR_USE_INVOICE_CAP } from "@/lib/trial";
import {
  armingPlan,
  stopSequence,
  resumeSequence,
  payLinkFor,
  appUrl,
} from "@/lib/scheduler";
import { renderTemplate, emailHtml, linkifyPayLink, finalizeSms } from "@/lib/templates";
import { formatMoney, formatDate } from "@/lib/money";
import { daysOverdue, nextAllowedSendTime } from "@/lib/tz";
import { sendEmail, sendSms, normalizePhone, cleanPhoneInput, type SendResult } from "@/lib/senders";
import { recordSmsUsage } from "@/lib/smsUsage";
import { replyToFor } from "@/lib/brand";
import type { Business, Customer, Invoice, SequenceStep } from "@/lib/types";

async function findOrCreateCustomer(
  supabase: Awaited<ReturnType<typeof requireBusiness>>["supabase"],
  businessId: string,
  data: { name: string; email?: string | null; phone?: string | null; extraEmails?: string[] }
): Promise<Customer> {
  if (data.phone) data.phone = normalizePhone(data.phone);
  // match on email or phone first, then exact name
  let existing = null;
  if (data.email) {
    const { data: byEmail } = await supabase
      .from("customers")
      .select("*")
      .eq("business_id", businessId)
      .ilike("email", data.email)
      .maybeSingle();
    existing = byEmail;
  }
  if (!existing && data.phone) {
    const { data: byPhone } = await supabase
      .from("customers")
      .select("*")
      .eq("business_id", businessId)
      .eq("phone", data.phone)
      .maybeSingle();
    existing = byPhone;
  }
  if (!existing) {
    const { data: byName } = await supabase
      .from("customers")
      .select("*")
      .eq("business_id", businessId)
      .ilike("name", data.name)
      .maybeSingle();
    existing = byName;
  }
  if (existing) {
    // backfill contact info if we learned more
    const updates: Record<string, string | string[]> = {};
    // The form is the source of truth for the name: when we matched by email/phone but the
    // user typed a different name, silently keeping the old one makes the new invoice appear
    // under a name the user never entered — a real support complaint. Rename to what they typed.
    const typedName = data.name.trim();
    if (typedName && existing.name.trim().toLowerCase() !== typedName.toLowerCase()) {
      updates.name = typedName;
    }
    if (data.email && !existing.email) updates.email = data.email;
    if (data.phone && !existing.phone) updates.phone = data.phone;
    if (data.extraEmails?.length) updates.extra_emails = data.extraEmails;
    if (Object.keys(updates).length) {
      await supabase.from("customers").update(updates).eq("id", existing.id);
      Object.assign(existing, updates);
    }
    return existing as Customer;
  }

  const { data: created, error } = await supabase
    .from("customers")
    .insert({
      business_id: businessId,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      extra_emails: data.extraEmails ?? [],
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return created as Customer;
}

type SchedulingBusiness = Pick<
  Business,
  "id" | "timezone" | "allow_sunday" | "quiet_start" | "quiet_end" | "preferred_send_hour"
>;

async function armInvoice(
  supabase: Awaited<ReturnType<typeof requireBusiness>>["supabase"],
  invoice: Invoice,
  business: SchedulingBusiness
) {
  const { data: seq } = await supabase
    .from("sequences")
    .select("*")
    .eq("business_id", business.id)
    .eq("is_default", true)
    .single();
  if (!seq) return;
  const plan = armingPlan(
    seq.steps as SequenceStep[],
    invoice.due_at,
    business.timezone,
    new Date(),
    business.allow_sunday,
    business.quiet_start,
    business.quiet_end,
    business.preferred_send_hour
  );
  await supabase.from("invoice_sequences").insert({
    invoice_id: invoice.id,
    sequence_id: seq.id,
    business_id: business.id,
    state: "armed",
    current_step: plan.stepIndex,
    next_run_at: plan.nextRunAt.toISOString(),
  });
}

export interface CreateInvoiceResult {
  error?: string;
  invoiceId?: string;
  upgradeRequired?: boolean;
}

export async function createInvoice(formData: FormData): Promise<CreateInvoiceResult> {
  const { supabase, business } = await requireBusiness();

  // plan limits: invoices created this calendar month
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id)
    .gte("created_at", monthStart.toISOString());
  const limit = invoiceLimitFor(business);
  if ((count ?? 0) >= limit) {
    return {
      error:
        limit === 0
          ? "Your trial has ended — pick a plan in Settings to keep chasing invoices."
          : `You've reached your plan's limit of ${limit} invoices this month. Upgrade in Settings → Billing.`,
    };
  }

  // legacy card-required Stripe trial: exceeding the cap ends the trial early and charges now.
  // No-op for no-card free-tier businesses (they have no stripe_subscription_id) — see the
  // separate free-tier gate below.
  await endTrialIfFairUseExceeded(supabase, business);

  // no-card free tier: first 2 invoices ever (by creation order) arm normally; everything after
  // still gets created, just unarmed, until the business adds a card (see lib/trial.ts)
  const freeCapBlocked = await isFreeTierInvoiceBlocked(supabase, business);

  const customerName = String(formData.get("customer_name") || "").trim();
  const amountCents = parseAmountToCents(String(formData.get("amount") || ""));
  const dueAt = String(formData.get("due_at") || "");
  // per-invoice currency from the form's picker; anything unexpected falls back to the
  // business default (also keeps CSV import and any older callers working unchanged)
  const chosenCurrency = String(formData.get("currency") || "");
  const currency = isSupportedCurrency(chosenCurrency) ? chosenCurrency : business.currency;
  if (!customerName) return { error: "Customer name is required" };
  if (!amountCents) return { error: "Enter a valid amount" };
  if (!dueAt) return { error: "Due date is required" };

  const email = String(formData.get("customer_email") || "").trim() || null;
  const phone = cleanPhoneInput(formData.get("customer_phone"));
  const extraEmails = [
    ...new Set(
      formData
        .getAll("extra_email")
        .map((e) => String(e).trim())
        .filter((e) => e.includes("@") && e !== email)
    ),
  ].slice(0, 4);
  const number =
    String(formData.get("number") || "").trim() ||
    `INV-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const issuedAt = String(formData.get("issued_at") || "") || new Date().toISOString().slice(0, 10);
  const source = String(formData.get("source") || "manual");
  const arm = formData.get("arm") !== "off" && !freeCapBlocked;
  const extractionRaw = formData.get("extraction");

  try {
    const customer = await findOrCreateCustomer(supabase, business.id, {
      name: customerName,
      email,
      phone,
      extraEmails,
    });

    const { data: invoice, error } = await supabase
      .from("invoices")
      .insert({
        business_id: business.id,
        customer_id: customer.id,
        number,
        amount_cents: amountCents,
        currency,
        issued_at: issuedAt,
        due_at: dueAt,
        status: freeCapBlocked ? "paused" : "outstanding",
        source,
        notes: String(formData.get("notes") || "").trim() || null,
        extraction: extractionRaw ? JSON.parse(String(extractionRaw)) : null,
      })
      .select()
      .single();
    if (error) return { error: error.message };

    if (arm) await armInvoice(supabase, invoice as Invoice, business);

    await supabase.from("events").insert({
      business_id: business.id,
      type: freeCapBlocked ? "invoice_blocked_free_cap" : "invoice_created",
      entity: "invoice",
      entity_id: invoice.id,
      data: { source, armed: arm },
    });

    revalidatePath("/invoices");
    return { invoiceId: invoice.id, upgradeRequired: freeCapBlocked || undefined };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export async function importInvoices(rows: {
  customer_name: string;
  email?: string;
  phone?: string;
  amount: string;
  due_at: string;
  number?: string;
}[]): Promise<{ created: number; errors: string[]; upgradeRequired: number }> {
  const errors: string[] = [];
  let created = 0;
  let upgradeRequired = 0;
  for (const [i, row] of rows.entries()) {
    const fd = new FormData();
    fd.set("customer_name", row.customer_name);
    fd.set("customer_email", row.email || "");
    fd.set("customer_phone", row.phone || "");
    fd.set("amount", row.amount);
    fd.set("due_at", row.due_at);
    fd.set("number", row.number || "");
    fd.set("source", "csv");
    const result = await createInvoice(fd);
    if (result.error) errors.push(`Row ${i + 1} (${row.customer_name}): ${result.error}`);
    else {
      created++;
      if (result.upgradeRequired) upgradeRequired++;
    }
  }
  return { created, errors, upgradeRequired };
}

export async function markPaid(invoiceId: string) {
  const { supabase, business } = await requireBusiness();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();
  if (!invoice) return { error: "Invoice not found" };
  if (invoice.status === "paid") return { ok: true };

  const now = new Date().toISOString();
  await supabase.from("invoices").update({ status: "paid", paid_at: now }).eq("id", invoiceId);
  await supabase.from("payments").insert({
    business_id: business.id,
    invoice_id: invoiceId,
    amount_cents: invoice.amount_cents,
    currency: invoice.currency,
    method: "manual",
    paid_at: now,
  });
  await stopSequence(supabase, invoiceId);
  await supabase.from("events").insert({
    business_id: business.id,
    type: "invoice_paid",
    entity: "invoice",
    entity_id: invoiceId,
    data: { method: "manual" },
  });
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}

export async function pauseReminders(invoiceId: string) {
  const { supabase, business } = await requireBusiness();
  await supabase.from("invoices").update({ status: "paused" }).eq("id", invoiceId).eq("status", "outstanding");
  await stopSequence(supabase, invoiceId, "paused");
  await supabase.from("events").insert({
    business_id: business.id,
    type: "reminders_paused",
    entity: "invoice",
    entity_id: invoiceId,
  });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true };
}

export async function resumeReminders(invoiceId: string) {
  const { supabase, business } = await requireBusiness();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();
  if (!invoice) return { error: "Invoice not found" };
  await supabase.from("invoices").update({ status: "outstanding" }).eq("id", invoiceId);
  await resumeSequence(supabase, invoiceId, invoice.due_at, business.timezone, business.allow_sunday, business.quiet_start, business.quiet_end, business.preferred_send_hour);
  await supabase.from("events").insert({
    business_id: business.id,
    type: "reminders_resumed",
    entity: "invoice",
    entity_id: invoiceId,
  });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true };
}

export async function remindNow(invoiceId: string) {
  const { supabase, business } = await requireBusiness();
  if (!canSend(business))
    return { error: "Your trial has ended — pick a plan to keep sending reminders." };

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, customer:customers(*)")
    .eq("id", invoiceId)
    .single();
  if (!invoice) return { error: "Invoice not found" };
  if (invoice.status === "paid") return { error: "This invoice is already paid" };
  const customer = invoice.customer as Customer;

  const overdueDays = daysOverdue(invoice.due_at);
  const ctx = {
    first_name: customer.name.split(" ")[0],
    amount: formatMoney(invoice.amount_cents, invoice.currency),
    invoice_no: invoice.number,
    days_overdue: String(overdueDays),
    due_date: formatDate(invoice.due_at),
    pay_link: payLinkFor(invoice),
    business_name: business.from_name || business.name,
  };

  // no-card free tier is email-only (see lib/scheduler.ts for the scheduled-send equivalent)
  const canSms = business.plan !== "free" && customer.phone && !customer.sms_opted_out && customer.sms_consent;
  const canEmail = customer.email && !customer.email_opted_out;
  if (!canSms && !canEmail)
    return { error: "This customer has no reachable contact details." };

  const smsBody = renderTemplate(
    overdueDays > 0
      ? "Hi {first_name},\n\nJust a nudge — invoice {invoice_no} for {amount} is {days_overdue} days overdue.\n\nPay now: {pay_link}"
      : "Hi {first_name},\n\nA reminder — invoice {invoice_no} for {amount} is due {due_date}.\n\nPay now: {pay_link}",
    ctx
  );
  // brand-level layout: on-behalf-of signature + correctly-keyed opt-out (see finalizeSms)
  const smsBodyWithOptOut = finalizeSms(smsBody, {
    businessName: ctx.business_name,
    customerPhone: customer.phone ?? "",
    optOutUrl: `${appUrl()}/pay/${invoice.pay_token}?optout=sms`,
  });

  const emailSubject = renderTemplate(
    overdueDays > 0 ? "Invoice {invoice_no} — {days_overdue} days overdue" : "Reminder: invoice {invoice_no}",
    ctx
  );
  const emailBody = renderTemplate(
    "Hi {first_name},\n\nA quick reminder about invoice {invoice_no} for {amount}" +
      (overdueDays > 0 ? ", now {days_overdue} days overdue" : ", due {due_date}") +
      ". You can pay online here: {pay_link}\n\nThanks,\n{business_name}",
    ctx
  );

  // send every reachable channel at once, not just one — a customer with both
  // phone and email should get both, same as the automated sequence would over time
  const sends: Promise<{ channel: "sms" | "email"; result: SendResult; body: string; subject?: string; toAddress: string }>[] = [];
  if (canSms) {
    sends.push(
      sendSms({ to: customer.phone!, body: smsBodyWithOptOut }).then((result) => ({
        channel: "sms" as const,
        result,
        body: smsBodyWithOptOut,
        toAddress: customer.phone!,
      }))
    );
  }
  if (canEmail) {
    const toAddresses = [customer.email, ...(customer.extra_emails ?? [])].filter(Boolean) as string[];
    sends.push(
      sendEmail({
        to: toAddresses,
        subject: emailSubject,
        html: linkifyPayLink(emailHtml(emailBody, ctx.business_name, business.phone), ctx.pay_link),
        replyTo: replyToFor(invoice.id),
        fromName: ctx.business_name,
        bcc: business.reply_to_email,
      }).then((result) => ({
        channel: "email" as const,
        result,
        body: emailBody,
        subject: emailSubject,
        toAddress: toAddresses.join(", "),
      }))
    );
  }

  const outcomes = await Promise.all(sends);

  const rows = outcomes.map((o) => ({
    business_id: business.id,
    invoice_id: invoiceId,
    customer_id: customer.id,
    channel: o.channel,
    direction: "outbound",
    to_address: o.toAddress,
    subject: o.subject ?? null,
    body: o.body,
    status: o.result.status,
    provider_id: o.result.providerId ?? null,
    error: o.result.error ?? null,
    idempotency_key: `manual:${invoiceId}:${o.channel}:${Date.now()}`,
    sent_at: new Date().toISOString(),
  }));
  await supabase.from("messages").insert(rows);

  // SMS pack metering — after the insert above, so the derived count sees this send
  const smsRow = rows.find((r) => r.channel === "sms" && r.status === "sent");
  if (smsRow) {
    await recordSmsUsage({
      db: supabase,
      business,
      customerPhone: customer.phone!,
      messageIdempotencyKey: smsRow.idempotency_key,
    });
  }

  revalidatePath(`/invoices/${invoiceId}`);
  return {
    ok: true,
    results: outcomes.map((o) => ({ channel: o.channel, status: o.result.status, error: o.result.error })),
  };
}

export async function updateInvoice(formData: FormData) {
  const { supabase, business } = await requireBusiness();
  const invoiceId = String(formData.get("invoice_id"));
  const amountCents = parseAmountToCents(String(formData.get("amount") || ""));
  const dueAt = String(formData.get("due_at") || "");
  const number = String(formData.get("number") || "").trim();
  if (!amountCents || !dueAt || !number) return { error: "All fields are required" };

  const updates: Record<string, unknown> = { amount_cents: amountCents, due_at: dueAt, number };
  // optional fields: only touch what the form actually sent, so other callers can't wipe data
  const currency = String(formData.get("currency") || "");
  if (isSupportedCurrency(currency)) updates.currency = currency;
  const issuedAt = String(formData.get("issued_at") || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(issuedAt)) updates.issued_at = issuedAt;
  if (formData.get("notes") !== null) updates.notes = String(formData.get("notes")).trim() || null;

  const { error } = await supabase.from("invoices").update(updates).eq("id", invoiceId);
  if (error) return { error: error.message };

  // re-plan the sequence around the new due date if still armed
  const { data: iseq } = await supabase
    .from("invoice_sequences")
    .select("state")
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  if (iseq?.state === "armed") {
    await resumeSequence(supabase, invoiceId, dueAt, business.timezone, business.allow_sunday, business.quiet_start, business.quiet_end, business.preferred_send_hour);
  }

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  redirect(`/invoices/${invoiceId}`);
}

export async function armReminders(invoiceId: string) {
  const { supabase, business } = await requireBusiness();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();
  if (!invoice) return { error: "Invoice not found" };

  const { data: existing } = await supabase
    .from("invoice_sequences")
    .select("id")
    .eq("invoice_id", invoiceId)
    .maybeSingle();

  if (!existing) {
    // first-time arm: gated against the no-card free-tier cap (see lib/trial.ts) — resuming an
    // already-armed sequence below doesn't consume new free-tier capacity, so isn't re-gated
    if (await isFreeTierInvoiceBlocked(supabase, business, invoice.created_at)) {
      return {
        error: `You've used your ${TRIAL_FAIR_USE_INVOICE_CAP} free invoices — add a card to keep chasing this one.`,
        upgradeRequired: true,
      };
    }
  }

  if (invoice.status === "paused") {
    await supabase.from("invoices").update({ status: "outstanding" }).eq("id", invoiceId);
  }
  if (existing) {
    await resumeSequence(supabase, invoiceId, invoice.due_at, business.timezone, business.allow_sunday, business.quiet_start, business.quiet_end, business.preferred_send_hour);
  } else {
    await armInvoice(supabase, invoice as Invoice, business);
  }
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true };
}

/**
 * Replaces an invoice's reminder plan with a custom cadence — daily/weekly/monthly repeat,
 * or a single specific date. Bypasses the offset-from-due-date step template entirely: creates
 * a dedicated one-step sequence for this invoice and drives timing directly via next_run_at /
 * custom_repeat_days (see advance() in lib/scheduler.ts for the repeat mechanics).
 */
export async function setCustomSchedule(invoiceId: string, formData: FormData) {
  const { supabase, business } = await requireBusiness();
  const mode = String(formData.get("mode") || "");
  const dateStr = String(formData.get("date") || "");
  if (!["daily", "weekly", "monthly", "date"].includes(mode)) return { error: "Pick a schedule" };
  if (mode === "date" && !dateStr) return { error: "Pick a date" };

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, customer:customers(*)")
    .eq("id", invoiceId)
    .single();
  if (!invoice) return { error: "Invoice not found" };
  if (invoice.status === "paid") return { error: "This invoice is already paid" };
  const customer = invoice.customer as Customer;

  const { data: existingSeq } = await supabase
    .from("invoice_sequences")
    .select("id")
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  // first-time arm (no sequence yet): gated against the no-card free-tier cap, same as
  // armReminders — switching an already-armed invoice to a custom schedule isn't new capacity
  if (!existingSeq && (await isFreeTierInvoiceBlocked(supabase, business, invoice.created_at))) {
    return {
      error: `You've used your ${TRIAL_FAIR_USE_INVOICE_CAP} free invoices — add a card to keep chasing this one.`,
      upgradeRequired: true,
    };
  }

  const repeatDays = mode === "daily" ? 1 : mode === "weekly" ? 7 : mode === "monthly" ? 30 : null;
  const startingPoint = mode === "date" ? new Date(`${dateStr}T09:00:00`) : new Date();
  if (mode === "date" && isNaN(startingPoint.getTime())) return { error: "Invalid date" };
  const nextRun = nextAllowedSendTime(startingPoint, business.timezone, business.quiet_start, business.quiet_end);

  // free tier is email-only — never pick SMS as the custom-schedule channel (see lib/scheduler.ts
  // for the equivalent gate on the default sequence)
  const channel: "sms" | "email" =
    business.plan !== "free" && customer.phone && customer.sms_consent && !customer.sms_opted_out
      ? "sms"
      : "email";
  const step: SequenceStep = {
    offset_days: 0,
    channel,
    label: "Custom reminder",
    subject: "Reminder: invoice {invoice_no}",
    body: "Hi {first_name}, a reminder from {business_name} — invoice {invoice_no} ({amount}) is due {due_date}. Pay online: {pay_link}",
  };

  const { data: newSeq, error: seqErr } = await supabase
    .from("sequences")
    .insert({
      business_id: business.id,
      name: `Custom schedule — invoice ${invoice.number}`,
      tone: business.tone,
      steps: [step],
      is_default: false,
    })
    .select()
    .single();
  if (seqErr) return { error: seqErr.message };

  await supabase.from("invoice_sequences").delete().eq("invoice_id", invoiceId);
  const { error: isErr } = await supabase.from("invoice_sequences").insert({
    invoice_id: invoiceId,
    sequence_id: newSeq.id,
    business_id: business.id,
    state: "armed",
    current_step: 0,
    next_run_at: nextRun.toISOString(),
    custom_repeat_days: repeatDays,
  });
  if (isErr) return { error: isErr.message };
  if (invoice.status === "paused") await supabase.from("invoices").update({ status: "outstanding" }).eq("id", invoiceId);

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true };
}
