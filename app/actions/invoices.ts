"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/supabase/server";
import { parseAmountToCents } from "@/lib/money";
import { invoiceLimitFor, canSend } from "@/lib/plans";
import {
  armingPlan,
  stopSequence,
  resumeSequence,
  payLinkFor,
  appUrl,
} from "@/lib/scheduler";
import { renderTemplate, emailHtml, linkifyPayLink } from "@/lib/templates";
import { formatMoney, formatDate } from "@/lib/money";
import { daysOverdue } from "@/lib/tz";
import { sendEmail, sendSms } from "@/lib/senders";
import type { Customer, Invoice, SequenceStep } from "@/lib/types";

async function findOrCreateCustomer(
  supabase: Awaited<ReturnType<typeof requireBusiness>>["supabase"],
  businessId: string,
  data: { name: string; email?: string | null; phone?: string | null }
): Promise<Customer> {
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
    const updates: Record<string, string> = {};
    if (data.email && !existing.email) updates.email = data.email;
    if (data.phone && !existing.phone) updates.phone = data.phone;
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
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return created as Customer;
}

async function armInvoice(
  supabase: Awaited<ReturnType<typeof requireBusiness>>["supabase"],
  invoice: Invoice,
  businessId: string,
  timezone: string
) {
  const { data: seq } = await supabase
    .from("sequences")
    .select("*")
    .eq("business_id", businessId)
    .eq("is_default", true)
    .single();
  if (!seq) return;
  const plan = armingPlan(seq.steps as SequenceStep[], invoice.due_at, timezone);
  await supabase.from("invoice_sequences").insert({
    invoice_id: invoice.id,
    sequence_id: seq.id,
    business_id: businessId,
    state: "armed",
    current_step: plan.stepIndex,
    next_run_at: plan.nextRunAt.toISOString(),
  });
}

export interface CreateInvoiceResult {
  error?: string;
  invoiceId?: string;
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

  const customerName = String(formData.get("customer_name") || "").trim();
  const amountCents = parseAmountToCents(String(formData.get("amount") || ""));
  const dueAt = String(formData.get("due_at") || "");
  if (!customerName) return { error: "Customer name is required" };
  if (!amountCents) return { error: "Enter a valid amount" };
  if (!dueAt) return { error: "Due date is required" };

  const email = String(formData.get("customer_email") || "").trim() || null;
  const phone = String(formData.get("customer_phone") || "").trim() || null;
  const number =
    String(formData.get("number") || "").trim() ||
    `INV-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const issuedAt = String(formData.get("issued_at") || "") || new Date().toISOString().slice(0, 10);
  const source = String(formData.get("source") || "manual");
  const arm = formData.get("arm") !== "off";
  const extractionRaw = formData.get("extraction");

  try {
    const customer = await findOrCreateCustomer(supabase, business.id, {
      name: customerName,
      email,
      phone,
    });

    const { data: invoice, error } = await supabase
      .from("invoices")
      .insert({
        business_id: business.id,
        customer_id: customer.id,
        number,
        amount_cents: amountCents,
        currency: business.currency,
        issued_at: issuedAt,
        due_at: dueAt,
        status: "outstanding",
        source,
        notes: String(formData.get("notes") || "").trim() || null,
        extraction: extractionRaw ? JSON.parse(String(extractionRaw)) : null,
      })
      .select()
      .single();
    if (error) return { error: error.message };

    if (arm) await armInvoice(supabase, invoice as Invoice, business.id, business.timezone);

    await supabase.from("events").insert({
      business_id: business.id,
      type: "invoice_created",
      entity: "invoice",
      entity_id: invoice.id,
      data: { source, armed: arm },
    });

    revalidatePath("/invoices");
    return { invoiceId: invoice.id };
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
}[]): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;
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
    else created++;
  }
  return { created, errors };
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
  await resumeSequence(supabase, invoiceId, invoice.due_at, business.timezone);
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

  const canSms = customer.phone && !customer.sms_opted_out && customer.sms_consent;
  const canEmail = customer.email && !customer.email_opted_out;
  if (!canSms && !canEmail)
    return { error: "This customer has no reachable contact details." };

  const channel = canSms ? "sms" : "email";
  let body: string;
  let subject: string | undefined;
  if (channel === "sms") {
    body = renderTemplate(
      overdueDays > 0
        ? "Hi {first_name}, just a nudge from {business_name} — invoice {invoice_no} ({amount}) is {days_overdue} days overdue. Pay in 30 seconds: {pay_link}"
        : "Hi {first_name}, a reminder from {business_name} — invoice {invoice_no} ({amount}) is due {due_date}. Pay online: {pay_link}",
      ctx
    );
    if (["US", "CA"].includes(business.country)) body += " Reply STOP to opt out.";
    else body += ` Opt out: ${appUrl()}/pay/${invoice.pay_token}?optout=sms`;
  } else {
    subject = renderTemplate(
      overdueDays > 0 ? "Invoice {invoice_no} — {days_overdue} days overdue" : "Reminder: invoice {invoice_no}",
      ctx
    );
    body = renderTemplate(
      "Hi {first_name},\n\nA quick reminder about invoice {invoice_no} for {amount}" +
        (overdueDays > 0 ? ", now {days_overdue} days overdue" : ", due {due_date}") +
        ". You can pay online here: {pay_link}\n\nThanks,\n{business_name}",
      ctx
    );
  }

  const result =
    channel === "sms"
      ? await sendSms({ to: customer.phone!, body })
      : await sendEmail({
          to: customer.email!,
          subject: subject!,
          html: linkifyPayLink(emailHtml(body, ctx.business_name), ctx.pay_link),
          replyTo: business.reply_to_email,
          fromName: ctx.business_name,
        });

  await supabase.from("messages").insert({
    business_id: business.id,
    invoice_id: invoiceId,
    customer_id: customer.id,
    channel,
    direction: "outbound",
    to_address: channel === "sms" ? customer.phone : customer.email,
    subject: subject ?? null,
    body,
    status: result.status,
    provider_id: result.providerId ?? null,
    error: result.error ?? null,
    idempotency_key: `manual:${invoiceId}:${Date.now()}`,
    sent_at: new Date().toISOString(),
  });

  revalidatePath(`/invoices/${invoiceId}`);
  if (result.status === "failed") return { error: `Send failed: ${result.error}` };
  return { ok: true, simulated: result.status === "simulated" };
}

export async function updateInvoice(formData: FormData) {
  const { supabase, business } = await requireBusiness();
  const invoiceId = String(formData.get("invoice_id"));
  const amountCents = parseAmountToCents(String(formData.get("amount") || ""));
  const dueAt = String(formData.get("due_at") || "");
  const number = String(formData.get("number") || "").trim();
  if (!amountCents || !dueAt || !number) return { error: "All fields are required" };

  const { error } = await supabase
    .from("invoices")
    .update({ amount_cents: amountCents, due_at: dueAt, number })
    .eq("id", invoiceId);
  if (error) return { error: error.message };

  // re-plan the sequence around the new due date if still armed
  const { data: iseq } = await supabase
    .from("invoice_sequences")
    .select("state")
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  if (iseq?.state === "armed") {
    await resumeSequence(supabase, invoiceId, dueAt, business.timezone);
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

  if (invoice.status === "paused") {
    await supabase.from("invoices").update({ status: "outstanding" }).eq("id", invoiceId);
  }
  const { data: existing } = await supabase
    .from("invoice_sequences")
    .select("id")
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  if (existing) {
    await resumeSequence(supabase, invoiceId, invoice.due_at, business.timezone);
  } else {
    await armInvoice(supabase, invoice as Invoice, business.id, business.timezone);
  }
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true };
}
