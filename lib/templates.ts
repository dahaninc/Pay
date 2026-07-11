import type { SequenceStep, Tone } from "@/lib/types";

/**
 * Default 5-step reminder sequence, per tone.
 * Merge tags: {first_name} {amount} {invoice_no} {days_overdue} {due_date} {pay_link} {business_name}
 * SMS steps in US/CA carry "Reply STOP to opt out"; UK/AU get an opt-out link appended at send time.
 */
export function defaultSteps(tone: Tone): SequenceStep[] {
  const t = COPY[tone];
  return [
    { offset_days: -3, channel: "email", label: "Heads-up", subject: t.headsUpSubject, body: t.headsUp },
    { offset_days: 1, channel: "sms", label: "Overdue nudge", body: t.day1Sms },
    { offset_days: 5, channel: "sms", label: "Second nudge", body: t.day5Sms },
    { offset_days: 10, channel: "email", label: "Firm follow-up", subject: t.day10Subject, body: t.day10 },
    { offset_days: 21, channel: "email", label: "Final notice", subject: t.day21Subject, body: t.day21 },
  ];
}

const COPY: Record<Tone, {
  headsUpSubject: string; headsUp: string;
  day1Sms: string; day5Sms: string;
  day10Subject: string; day10: string;
  day21Subject: string; day21: string;
}> = {
  friendly: {
    headsUpSubject: "Invoice {invoice_no} is due {due_date}",
    headsUp:
      "Hi {first_name},\n\nJust a friendly heads-up — invoice {invoice_no} for {amount} is due on {due_date}. You can pay online in about 30 seconds here: {pay_link}\n\nThanks so much!\n{business_name}",
    day1Sms:
      "Hi {first_name}! Quick note from {business_name} — invoice {invoice_no} ({amount}) was due yesterday. Easy pay link: {pay_link}",
    day5Sms:
      "Hi {first_name}, {business_name} here — invoice {invoice_no} ({amount}) is {days_overdue} days overdue now. Would love to get it squared away: {pay_link}",
    day10Subject: "Can we get invoice {invoice_no} sorted?",
    day10:
      "Hi {first_name},\n\nHope all's well! Invoice {invoice_no} for {amount} is now {days_overdue} days overdue. If anything's holding it up, just reply and let me know — happy to help. Otherwise you can pay here: {pay_link}\n\nCheers,\n{business_name}",
    day21Subject: "Final reminder — invoice {invoice_no}",
    day21:
      "Hi {first_name},\n\nThis is my last automatic reminder about invoice {invoice_no} for {amount}, now {days_overdue} days overdue. I'd really like to sort this out without any fuss — you can pay here: {pay_link}, or reply and we'll figure something out.\n\nThanks,\n{business_name}",
  },
  professional: {
    headsUpSubject: "Invoice {invoice_no} due {due_date}",
    headsUp:
      "Hi {first_name},\n\nA quick heads-up that invoice {invoice_no} for {amount} is due on {due_date}. You can pay online here: {pay_link}\n\nThanks,\n{business_name}",
    day1Sms:
      "Hi {first_name}, invoice {invoice_no} ({amount}) from {business_name} was due yesterday. Pay in 30 seconds: {pay_link}",
    day5Sms:
      "Hi {first_name}, just a nudge — invoice {invoice_no} ({amount}) is now {days_overdue} days overdue. {pay_link} — {business_name}",
    day10Subject: "Invoice {invoice_no} — {days_overdue} days overdue",
    day10:
      "Hi {first_name},\n\nInvoice {invoice_no} for {amount} is now {days_overdue} days overdue. Please arrange payment at your earliest convenience: {pay_link}\n\nIf there's an issue with this invoice, reply to this email and we'll resolve it.\n\nRegards,\n{business_name}",
    day21Subject: "Final notice — invoice {invoice_no}",
    day21:
      "Hi {first_name},\n\nDespite previous reminders, invoice {invoice_no} for {amount} remains unpaid ({days_overdue} days overdue). Please settle it within 7 days: {pay_link}\n\nIf payment has already been made, please disregard this notice and accept our thanks.\n\nRegards,\n{business_name}",
  },
  firm: {
    headsUpSubject: "Payment due {due_date} — invoice {invoice_no}",
    headsUp:
      "Hi {first_name},\n\nInvoice {invoice_no} for {amount} is due on {due_date}. Please pay by the due date: {pay_link}\n\n{business_name}",
    day1Sms:
      "{first_name}, invoice {invoice_no} ({amount}) from {business_name} is now overdue. Please pay today: {pay_link}",
    day5Sms:
      "{first_name}, invoice {invoice_no} ({amount}) is {days_overdue} days overdue. Immediate payment required: {pay_link} — {business_name}",
    day10Subject: "Overdue account — invoice {invoice_no}",
    day10:
      "Hi {first_name},\n\nInvoice {invoice_no} for {amount} is {days_overdue} days overdue. Payment is required within 5 business days: {pay_link}\n\nIf you are unable to pay in full, reply to this email to discuss options.\n\n{business_name}",
    day21Subject: "FINAL NOTICE — invoice {invoice_no}",
    day21:
      "Hi {first_name},\n\nFinal notice: invoice {invoice_no} for {amount} is {days_overdue} days overdue. If payment is not received within 7 days we will have to review how we handle future work and may apply late fees where agreed.\n\nPay now: {pay_link}\n\n{business_name}",
  },
};

export interface MergeContext {
  first_name: string;
  amount: string;
  invoice_no: string;
  days_overdue: string;
  due_date: string;
  pay_link: string;
  business_name: string;
}

export function renderTemplate(template: string, ctx: MergeContext): string {
  return template.replace(/\{(\w+)\}/g, (m, key) =>
    key in ctx ? ctx[key as keyof MergeContext] : m
  );
}

export function emailHtml(body: string, businessName: string): string {
  const paragraphs = body
    .split("\n\n")
    .map((p) => `<p style="margin:0 0 16px 0;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f7f9;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#1a1d21;">
    <div style="background:#ffffff;border-radius:12px;padding:28px;border:1px solid #e5e8eb;">${paragraphs}</div>
    <p style="text-align:center;color:#9aa1a9;font-size:12px;margin-top:16px;">Sent on behalf of ${businessName}</p>
  </div></body></html>`;
}

/** Auto-link pay links and bold amounts in email bodies. */
export function linkifyPayLink(html: string, payLink: string): string {
  if (!payLink) return html;
  return html.replaceAll(
    payLink,
    `<a href="${payLink}" style="display:inline-block;background:#1f7a4d;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Pay now</a>`
  );
}
