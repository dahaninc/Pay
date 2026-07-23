import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Business } from "@/lib/types";
import { includedSmsFor, smsOverageRateCentsFor, smsOverageRateDisplay } from "@/lib/plans";
import { isDomesticSms, sendEmail } from "@/lib/senders";
import { emailBrandHeaderHtml } from "@/lib/brand";

/**
 * SMS pack metering. Called once per SUCCESSFUL real SMS send (scheduler + manual
 * "Remind now") — never for simulated or failed sends, so demo mode and dead numbers
 * can't bill anyone.
 *
 * - Usage is DERIVED from the messages table (the send log itself), never a stored
 *   counter — it can't drift, and it resets naturally at the billing-period boundary.
 * - Period boundary: the Stripe subscription's current_period_start (cached on the
 *   business row by the subscription webhook), falling back to calendar month for
 *   businesses without one.
 * - Past the included pack, each SMS creates a pending Stripe invoice item (idempotent
 *   per message), which Stripe sweeps into the subscription's next period-end invoice —
 *   no meter/price dashboard setup needed. Rate is region-keyed off the CUSTOMER's
 *   number via isDomesticSms(), same rule the sender itself routes by.
 * - Owner gets a heads-up at 80% and 100% of the pack, deduped to once per threshold
 *   per billing period via an events marker written BEFORE the email (a failing email
 *   can't retry-spam).
 * - Never throws: metering/notification problems must never break a send.
 *
 * Lifetime (AppSumo) businesses are deliberately excluded: they have no Stripe
 * subscription to bill overage to, and the LTD path is out of scope here.
 */
export async function recordSmsUsage(opts: {
  db: SupabaseClient;
  business: Business;
  customerPhone: string;
  /** The message's idempotency key — reused so a scheduler retry can't double-bill. */
  messageIdempotencyKey: string;
}): Promise<void> {
  const { db, business, customerPhone, messageIdempotencyKey } = opts;
  try {
    if (business.plan === "lifetime" || business.plan === "free" || business.plan === "expired") return;
    const included = includedSmsFor(business);
    if (included <= 0) return;

    const periodStart = billingPeriodStart(business);

    // Count real sends this period, including the one just made (its row is already
    // status 'sent' by the time this runs). 'delivered' covers rows later upgraded by DLR.
    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("channel", "sms")
      .eq("direction", "outbound")
      .in("status", ["sent", "delivered"])
      .gte("sent_at", periodStart.toISOString());
    const used = count ?? 0;

    if (used > included) {
      await billOverageSms(db, business, customerPhone, messageIdempotencyKey, periodStart);
    }

    if (used >= included) {
      await notifySmsThreshold(db, business, 100, used, included, periodStart);
    } else if (used >= Math.ceil(included * 0.8)) {
      await notifySmsThreshold(db, business, 80, used, included, periodStart);
    }
  } catch {
    // metering must never break a send
  }
}

/** Stripe subscription period start when we have it, else start of the calendar month (UTC). */
function billingPeriodStart(business: Business): Date {
  if (business.stripe_current_period_start) {
    const d = new Date(business.stripe_current_period_start);
    if (!isNaN(d.getTime())) return d;
  }
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  return monthStart;
}

/**
 * One pending invoice item per overage SMS. Degrades silently without a Stripe key or
 * customer (matches the provider degradation rule) — the send itself already happened.
 */
async function billOverageSms(
  db: SupabaseClient,
  business: Business,
  customerPhone: string,
  messageIdempotencyKey: string,
  periodStart: Date
) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !business.stripe_customer_id || !business.stripe_subscription_id) return;

  const domestic = isDomesticSms(customerPhone);
  const rateCents = smsOverageRateCentsFor(domestic);
  try {
    const stripe = new Stripe(key);
    await stripe.invoiceItems.create(
      {
        customer: business.stripe_customer_id,
        amount: rateCents,
        currency: "usd",
        description: `SMS overage — 1 ${domestic ? "US/Canada" : "international"} text beyond your included pack`,
      },
      // Stripe-side dedupe: a scheduler retry reusing the same message key can't double-bill
      { idempotencyKey: `sms-overage:${messageIdempotencyKey}` }
    );
    await db.from("events").insert({
      business_id: business.id,
      type: "sms_overage_billed",
      data: {
        rate_cents: rateCents,
        domestic,
        message_key: messageIdempotencyKey,
        period_start: periodStart.toISOString(),
      },
    });
  } catch {
    // billing hiccup must never break a send; the messages log remains the usage source of truth
  }
}

async function notifySmsThreshold(
  db: SupabaseClient,
  business: Business,
  threshold: 80 | 100,
  used: number,
  included: number,
  periodStart: Date
) {
  if (!business.reply_to_email) return;

  const marker = {
    business_id: business.id,
    type: "owner_notified_sms_usage",
    data: { threshold, period_start: periodStart.toISOString() },
  };
  const { data: already } = await db
    .from("events")
    .select("id")
    .eq("business_id", business.id)
    .eq("type", "owner_notified_sms_usage")
    .eq("data->>threshold", String(threshold))
    .eq("data->>period_start", periodStart.toISOString())
    .limit(1);
  if (already?.length) return;

  // marker before send — same pattern as notifyOwnerFailedSend (lib/notify.ts)
  await db.from("events").insert(marker);

  const rate = smsOverageRateDisplay();
  const subject =
    threshold === 80
      ? `Heads-up: you've used ${used} of ${included} texts this month`
      : `You've hit your included texts for this month`;
  const bodyLine =
    threshold === 80
      ? `You've used <strong>${used} of ${included}</strong> included texts this billing period. Nothing changes yet — this is just a heads-up.`
      : `You've used all <strong>${included}</strong> included texts this billing period. Further text reminders keep sending, billed at <strong>${rate} each</strong> (international texts rated higher) on your next invoice.`;

  await sendEmail({
    to: business.reply_to_email,
    subject,
    html: `<!doctype html><html><body style="margin:0;background-color:#f3eadb;padding:24px 0;">
<div style="max-width:520px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#211b13;">
  <div style="margin-bottom:16px;">${emailBrandHeaderHtml(24)}</div>
  <div style="background-color:#fffdf8;border:1px solid rgba(33,27,19,0.10);border-radius:16px;padding:28px;">
    <h2 style="margin:0 0 12px;font-size:19px;">${threshold === 80 ? "📱 Text usage heads-up" : "📱 Included texts used up"}</h2>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;">${bodyLine}</p>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#7c7061;">
      Your reminders never stop mid-chase — email reminders are always included, and your
      pack resets at the start of your next billing period.
    </p>
  </div>
  <p style="text-align:center;color:#9aa1a9;font-size:12px;margin-top:14px;">PayPigeon — send the invoice, we'll chase it.</p>
</div></body></html>`,
  });
}
