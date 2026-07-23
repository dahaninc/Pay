import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { verifySvixSignature } from "@/lib/svix";
import { extractInvoice, extractionAvailable } from "@/lib/extraction";
import { sendEmail } from "@/lib/senders";
import { appUrl } from "@/lib/scheduler";
import { formatMoney } from "@/lib/money";
import { endTrialIfFairUseExceeded } from "@/lib/trial";
import { invoiceLimitFor } from "@/lib/plans";
import { emailBrandHeaderHtml } from "@/lib/brand";
import type { Business } from "@/lib/types";

/**
 * Inbound email webhook (Resend inbound route → POST here). Handles two flows:
 *  1. Customer reply to a reminder (to: reply+<invoiceId>@paypigeon.io) — logged onto the
 *     invoice timeline as an inbound message, owner notified by email. See replyToFor() in lib/brand.ts.
 *  2. Email-forward ingestion: user forwards an invoice to bills+<alias>@ their inbound domain.
 *     Creates a PAUSED invoice + emails back a one-tap confirm link. Never arms silently.
 *
 * Signature verification: shared Svix check in lib/svix.ts, enforced only once
 * RESEND_INBOUND_WEBHOOK_SECRET is set — grab it from the Resend dashboard's Inbound Route
 * settings and add it to Vercel prod. Without it, requests are still accepted (matches this
 * codebase's existing "degrade without keys" pattern) but a warning is logged so the gap is
 * visible instead of silent.
 *
 * Body content: the email.received webhook payload is metadata-only (from/to/subject/email_id) —
 * Resend never inlines text/html. The actual body must be fetched separately via
 * GET /emails/receiving/{email_id}. See fetchReceivedEmailBody() below.
 */

/** Fetches the actual body content for a received email — see comment above. */
async function fetchReceivedEmailBody(emailId: string): Promise<{ text: string; html: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !emailId) return { text: "", html: "" };
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return { text: "", html: "" };
    const json = await res.json();
    return { text: json.text ?? "", html: json.html ?? "" };
  } catch {
    return { text: "", html: "" };
  }
}

export async function POST(request: NextRequest) {
  const db = createAdminSupabase();
  if (!db) return NextResponse.json({ error: "service key not configured" }, { status: 503 });

  const rawBody = await request.text();
  if (!verifySvixSignature(rawBody, request.headers, process.env.RESEND_INBOUND_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  if (!process.env.RESEND_INBOUND_WEBHOOK_SECRET) {
    console.warn("[inbound] RESEND_INBOUND_WEBHOOK_SECRET not set — accepting unverified webhook request");
  }

  const payload = JSON.parse(rawBody || "null");
  if (!payload) return NextResponse.json({ error: "bad payload" }, { status: 400 });

  // Resend inbound shape: { data: { to: [], from, subject, email_id } } — accept flat too
  const data = payload.data ?? payload;
  const toList: string[] = Array.isArray(data.to)
    ? data.to.map((t: string | { address?: string }) => (typeof t === "string" ? t : t.address ?? ""))
    : [String(data.to ?? "")];
  const fromAddr: string = typeof data.from === "string" ? data.from : (data.from?.address ?? "");
  const subject: string = data.subject ?? "";
  const body = await fetchReceivedEmailBody(data.email_id);
  const text: string = body.text || body.html || "";

  const replyTarget = toList.map((t) => t.match(/^reply\+([0-9a-f-]{36})@/i)).find(Boolean);
  if (replyTarget) return handleReply(db, replyTarget[1], fromAddr, subject, text);

  // match business by inbound alias appearing in the local part of any recipient
  const { data: businesses } = await db
    .from("businesses")
    .select("id, name, inbound_alias, currency, timezone, stripe_subscription_id, plan, lifetime_tier");
  const business = (businesses ?? []).find((b) =>
    toList.some((t) => t.toLowerCase().includes(b.inbound_alias.toLowerCase()))
  );
  if (!business) return NextResponse.json({ error: "no matching business" }, { status: 404 });

  // Plan's monthly invoice cap applies to EVERY creation path — same rule as createInvoice()
  // in app/actions/invoices.ts. Checked before extraction so a capped business doesn't spend
  // a real Claude API call on an invoice that won't be created.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count: monthCount } = await db
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id)
    .gte("created_at", monthStart.toISOString());
  if ((monthCount ?? 0) >= invoiceLimitFor(business as unknown as Business)) {
    await db.from("events").insert({
      business_id: business.id,
      type: "inbound_invoice_cap_reached",
      data: { from: fromAddr, subject },
    });
    await sendEmail({
      to: fromAddr,
      subject: "This invoice wasn't added — you've hit this month's invoice limit",
      html: `<!doctype html><html><body style="margin:0;background-color:#f3eadb;padding:24px 0;">
<div style="max-width:520px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#211b13;">
  <div style="margin-bottom:16px;">${emailBrandHeaderHtml(24)}</div>
  <div style="background-color:#fffdf8;border:1px solid rgba(33,27,19,0.10);border-radius:16px;padding:28px;">
    <h2 style="margin:0 0 12px;font-size:19px;">You've hit this month's invoice limit</h2>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;">
      We read your forwarded email, but your plan's monthly invoice allowance is used up, so
      this invoice wasn't added. Upgrade your plan to keep adding invoices this month — or
      forward it again next month.
    </p>
    <p style="margin:18px 0 0;"><a href="${appUrl()}/settings#billing" style="display:inline-block;background-color:#e7a33c;color:#3c2a0c;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;">Review your plan</a></p>
  </div>
</div></body></html>`,
    });
    return NextResponse.json({ ok: false, reason: "monthly invoice limit reached" });
  }

  if (!extractionAvailable()) {
    await db.from("events").insert({
      business_id: business.id,
      type: "inbound_extraction_unavailable",
      data: { from: fromAddr, subject },
    });
    return NextResponse.json({ error: "extraction not configured" }, { status: 503 });
  }

  const extracted = await extractInvoice({ kind: "text", text: `Subject: ${subject}\n\n${text}` });
  if (!extracted.customer_name || !extracted.amount) {
    await db.from("events").insert({
      business_id: business.id,
      type: "inbound_extraction_failed",
      data: { from: fromAddr, subject, extracted },
    });
    return NextResponse.json({ ok: false, reason: "could not extract required fields" });
  }

  // find-or-create customer
  let customerId: string;
  const { data: existing } = await db
    .from("customers")
    .select("id")
    .eq("business_id", business.id)
    .ilike("name", extracted.customer_name)
    .maybeSingle();
  if (existing) customerId = existing.id;
  else {
    const { data: created, error } = await db
      .from("customers")
      .insert({
        business_id: business.id,
        name: extracted.customer_name,
        email: extracted.email,
        phone: extracted.phone,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    customerId = created.id;
  }

  const amountCents = Math.round(extracted.amount * 100);
  const dueAt =
    extracted.due_date ?? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  // fair-use: exceeding the trial's free-invoice cap ends the trial early and charges now —
  // closes the loophole where forwarded invoices would otherwise never hit the check
  await endTrialIfFairUseExceeded(db, business);

  const { data: invoice, error: invErr } = await db
    .from("invoices")
    .insert({
      business_id: business.id,
      customer_id: customerId,
      number: extracted.invoice_no ?? `INV-${Date.now().toString(36).toUpperCase().slice(-6)}`,
      amount_cents: amountCents,
      currency: extracted.currency ?? business.currency,
      issued_at: extracted.issue_date ?? new Date().toISOString().slice(0, 10),
      due_at: dueAt,
      status: "paused", // requires explicit confirmation before reminders arm
      source: "email",
      extraction: extracted as unknown as Record<string, unknown>,
    })
    .select()
    .single();
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });

  await db.from("events").insert({
    business_id: business.id,
    type: "invoice_ingested_email",
    entity: "invoice",
    entity_id: invoice.id,
    data: { from: fromAddr },
  });

  // confirmation card back to the forwarder
  const confirmUrl = `${appUrl()}/invoices/${invoice.id}`;
  await sendEmail({
    to: fromAddr,
    subject: `Got it — confirm invoice ${invoice.number} (${formatMoney(amountCents, invoice.currency)})`,
    html: `<!doctype html><html><body style="margin:0;background-color:#f3eadb;padding:24px 0;">
<div style="max-width:520px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#211b13;">
  <div style="margin-bottom:16px;">${emailBrandHeaderHtml(24)}</div>
  <div style="background-color:#fffdf8;border:1px solid rgba(33,27,19,0.10);border-radius:16px;padding:28px;">
    <h2 style="margin:0 0 12px;font-size:19px;">We read your invoice 📄</h2>
    <table style="font-size:15px;border-collapse:collapse;">
      <tr><td style="padding:4px 16px 4px 0;color:#7c7061;">Customer</td><td style="font-weight:600;">${extracted.customer_name}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#7c7061;">Amount</td><td style="font-weight:600;">${formatMoney(amountCents, invoice.currency)}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#7c7061;">Invoice #</td><td style="font-weight:600;">${invoice.number}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#7c7061;">Due</td><td style="font-weight:600;">${dueAt}</td></tr>
    </table>
    <p style="margin:18px 0 0;"><a href="${confirmUrl}" style="display:inline-block;background-color:#e7a33c;color:#3c2a0c;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;">Looks right — arm reminders ✓</a></p>
    <p style="color:#7c7061;font-size:13px;margin-top:14px;">Reminders stay off until you confirm. Tap through to fix any field.</p>
  </div>
</div></body></html>`,
  });

  return NextResponse.json({ ok: true, invoiceId: invoice.id });
}

/**
 * Customer replied to a reminder email. Log it on the invoice timeline and notify
 * the business owner (mirrors "SMS replies notify, not forward" — never silently swallowed).
 */
async function handleReply(
  db: ReturnType<typeof createAdminSupabase>,
  invoiceId: string,
  fromAddr: string,
  subject: string,
  text: string
) {
  if (!db) return NextResponse.json({ error: "service key not configured" }, { status: 503 });

  const { data: invoice } = await db
    .from("invoices")
    .select("*, customer:customers(*), business:businesses(*)")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return NextResponse.json({ error: "invoice not found" }, { status: 404 });

  const business = invoice.business as { id: string; name: string; reply_to_email: string | null; from_name: string | null };
  const customer = invoice.customer as { name: string } | null;

  await db.from("messages").insert({
    business_id: business.id,
    invoice_id: invoice.id,
    customer_id: invoice.customer_id,
    channel: "email",
    direction: "inbound",
    to_address: fromAddr,
    subject,
    body: text,
    status: "delivered",
    sent_at: new Date().toISOString(),
  });

  await db.from("events").insert({
    business_id: business.id,
    type: "reply_received",
    entity: "invoice",
    entity_id: invoice.id,
    data: { from: fromAddr },
  });

  const notifyTo = business.reply_to_email;
  if (notifyTo) {
    const viewUrl = `${appUrl()}/invoices/${invoice.id}`;
    await sendEmail({
      to: notifyTo,
      subject: `${customer?.name ?? "Your customer"} replied about invoice ${invoice.number}`,
      html: `<!doctype html><html><body style="margin:0;background-color:#f3eadb;padding:24px 0;">
<div style="max-width:520px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#211b13;">
  <div style="margin-bottom:16px;">${emailBrandHeaderHtml(24)}</div>
  <div style="background-color:#fffdf8;border:1px solid rgba(33,27,19,0.10);border-radius:16px;padding:28px;">
    <h2 style="margin:0 0 12px;font-size:19px;">💬 New reply on invoice ${invoice.number}</h2>
    <p style="margin:0 0 14px;color:#7c7061;font-size:13px;">From ${customer?.name ?? fromAddr}</p>
    <div style="background-color:#f7ead0;border-radius:10px;padding:16px;font-size:14px;line-height:1.6;color:#3c2a0c;white-space:pre-wrap;">${text}</div>
    <p style="margin:20px 0 0;"><a href="${viewUrl}" style="display:inline-block;background-color:#e7a33c;color:#3c2a0c;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;">View on PayPigeon</a></p>
  </div>
</div></body></html>`,
    });
  }

  return NextResponse.json({ ok: true, invoiceId: invoice.id });
}
