import type { SupabaseClient } from "@supabase/supabase-js";
import type { Business, Channel, Customer, Invoice } from "@/lib/types";
import { sendEmail } from "@/lib/senders";
import { emailBrandHeaderHtml } from "@/lib/brand";

/** Provider error strings → plain English the owner can act on. */
function humanReason(channel: Channel, raw: string | null | undefined): string {
  if (raw && /valid number|invalid.*(number|phone)/i.test(raw))
    return "the phone number doesn't look valid";
  if (raw && /bounce/i.test(raw)) return "the email address bounced — it may no longer exist";
  if (raw) return raw;
  return channel === "sms" ? "the text message couldn't be delivered" : "the email couldn't be delivered";
}

/**
 * Tells the business owner a reminder couldn't be delivered — the app's whole promise is
 * "we chase this for you," so a delivery failure the owner never hears about is the worst
 * failure mode we have. Deduped to one notification per invoice per channel (via an
 * owner_notified_failed_send event), so a dead phone number doesn't email the owner once
 * per sequence step. Never throws: a notification problem must never break the scheduler
 * or a webhook handler.
 */
export async function notifyOwnerFailedSend(opts: {
  db: SupabaseClient;
  business: Pick<Business, "id" | "name" | "reply_to_email">;
  invoice: Pick<Invoice, "id" | "number">;
  customer: Pick<Customer, "name"> | null;
  channel: Channel;
  reason: string | null | undefined;
  invoiceUrl: string;
}): Promise<void> {
  const { db, business, invoice, customer, channel, reason, invoiceUrl } = opts;
  try {
    if (!business.reply_to_email) return;

    const { data: already } = await db
      .from("events")
      .select("id")
      .eq("business_id", business.id)
      .eq("type", "owner_notified_failed_send")
      .eq("entity_id", invoice.id)
      .eq("data->>channel", channel)
      .limit(1);
    if (already?.length) return;

    // Record the dedup marker before sending — if the notify email itself fails we still
    // don't want to retry-spam on every scheduler run; the failed message row remains the
    // source of truth either way.
    await db.from("events").insert({
      business_id: business.id,
      type: "owner_notified_failed_send",
      entity: "invoice",
      entity_id: invoice.id,
      data: { channel, reason: reason ?? null },
    });

    const who = customer?.name ?? "your customer";
    const channelLabel = channel === "sms" ? "text reminder" : "email reminder";
    await sendEmail({
      to: business.reply_to_email,
      subject: `A reminder for invoice ${invoice.number} couldn't be delivered`,
      html: `<!doctype html><html><body style="margin:0;background-color:#f3eadb;padding:24px 0;">
<div style="max-width:520px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#211b13;">
  <div style="margin-bottom:16px;">${emailBrandHeaderHtml(24)}</div>
  <div style="background-color:#fffdf8;border:1px solid rgba(33,27,19,0.10);border-radius:16px;padding:28px;">
    <h2 style="margin:0 0 12px;font-size:19px;">⚠️ A ${channelLabel} didn't reach ${who}</h2>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;">
      We tried to send the ${channelLabel} for invoice <strong>${invoice.number}</strong>, but
      ${humanReason(channel, reason)}.
    </p>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#7c7061;">
      Until it's fixed, ${who} isn't hearing about this invoice. Update their contact details
      and reminders pick up again automatically — nothing to re-arm.
    </p>
    <p style="margin:20px 0 0;"><a href="${invoiceUrl}/edit" style="display:inline-block;background-color:#e7a33c;color:#3c2a0c;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;">Fix contact details</a></p>
  </div>
  <p style="text-align:center;color:#9aa1a9;font-size:12px;margin-top:14px;">PayPigeon — send the invoice, we'll chase it.</p>
</div></body></html>`,
    });
  } catch {
    // never let a notification failure break the caller
  }
}
