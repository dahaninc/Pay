import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { extractInvoice, extractionAvailable } from "@/lib/extraction";
import { sendEmail } from "@/lib/senders";
import { appUrl } from "@/lib/scheduler";
import { formatMoney } from "@/lib/money";

/**
 * Email-forward ingestion: user forwards an invoice to bills+<alias>@ their inbound domain
 * (Resend inbound webhook or Cloudflare Email Worker → POST here).
 * Creates a PAUSED invoice + emails back a one-tap confirm link. Never arms silently.
 */
export async function POST(request: NextRequest) {
  const db = createAdminSupabase();
  if (!db) return NextResponse.json({ error: "service key not configured" }, { status: 503 });

  const payload = await request.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: "bad payload" }, { status: 400 });

  // Resend inbound shape: { data: { to: [], from, subject, text, html } } — accept flat too
  const data = payload.data ?? payload;
  const toList: string[] = Array.isArray(data.to)
    ? data.to.map((t: string | { address?: string }) => (typeof t === "string" ? t : t.address ?? ""))
    : [String(data.to ?? "")];
  const fromAddr: string = typeof data.from === "string" ? data.from : (data.from?.address ?? "");
  const subject: string = data.subject ?? "";
  const text: string = data.text ?? data.html ?? "";

  // match business by inbound alias appearing in the local part of any recipient
  const { data: businesses } = await db.from("businesses").select("id, name, inbound_alias, currency, timezone");
  const business = (businesses ?? []).find((b) =>
    toList.some((t) => t.toLowerCase().includes(b.inbound_alias.toLowerCase()))
  );
  if (!business) return NextResponse.json({ error: "no matching business" }, { status: 404 });

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
    html: `<!doctype html><html><body style="margin:0;background:#f6f7f9;padding:24px 0;">
<div style="max-width:520px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1d21;">
  <div style="background:#fff;border:1px solid #e5e8eb;border-radius:12px;padding:28px;">
    <h2 style="margin:0 0 12px;">We read your invoice 📄</h2>
    <table style="font-size:15px;border-collapse:collapse;">
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Customer</td><td style="font-weight:600;">${extracted.customer_name}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Amount</td><td style="font-weight:600;">${formatMoney(amountCents, invoice.currency)}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Invoice #</td><td style="font-weight:600;">${invoice.number}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Due</td><td style="font-weight:600;">${dueAt}</td></tr>
    </table>
    <p style="margin:18px 0 0;"><a href="${confirmUrl}" style="display:inline-block;background:#1f7a4d;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">Looks right — arm reminders ✓</a></p>
    <p style="color:#6b7280;font-size:13px;margin-top:14px;">Reminders stay off until you confirm. Tap through to fix any field.</p>
  </div>
</div></body></html>`,
  });

  return NextResponse.json({ ok: true, invoiceId: invoice.id });
}
