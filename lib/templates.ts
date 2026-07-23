import type { SequenceStep, Tone } from "@/lib/types";
import { emailBrandHeaderHtml, BRAND } from "@/lib/brand";
import { isDomesticSms } from "@/lib/senders";

/**
 * Brand-level SMS finish: every outbound SMS ends with the on-behalf-of signature and the
 * legally-required opt-out, each on its own line. Applied at send time (scheduler + manual
 * "Remind now"), NOT stored in templates — so user-edited template copy can never lose the
 * signature or the opt-out. Opt-out language keys off the CUSTOMER's number, not the
 * business country: international sends go out via an Alphanumeric Sender ID which can't
 * receive replies, so "Reply STOP" would be a broken promise there (see lib/senders.ts).
 */
export function finalizeSms(
  body: string,
  opts: { businessName: string; customerPhone: string; optOutUrl: string }
): string {
  const signature = `Sent on behalf of ${opts.businessName} by ${BRAND}`;
  const optOut = isDomesticSms(opts.customerPhone)
    ? /reply stop/i.test(body)
      ? "" // user's own template already carries STOP wording — don't repeat it
      : "Reply STOP to opt out."
    : `Opt out: ${opts.optOutUrl}`;
  return `${body.trimEnd()}\n\n${signature}${optOut ? `\n${optOut}` : ""}`;
}

/** The three written presets. "custom" isn't one — see PresetTone below. */
export type PresetTone = Exclude<Tone, "custom">;

/**
 * Default 5-step reminder sequence, per tone preset. Only called when a business picks (or
 * switches to) one of the three written tones — "custom" is deliberately never reseeded from
 * here (see updateTone in app/actions/business.ts), so a business's own edited wording is
 * never silently overwritten by picking "Custom".
 * Merge tags: {first_name} {amount} {invoice_no} {days_overdue} {due_date} {pay_link} {business_name}
 * SMS steps in US/CA carry "Reply STOP to opt out"; UK/AU get an opt-out link appended at send time.
 */
export function defaultSteps(tone: PresetTone): SequenceStep[] {
  const t = COPY[tone];
  return [
    { offset_days: -3, channel: "email", label: "Heads-up", subject: t.headsUpSubject, body: t.headsUp },
    { offset_days: 1, channel: "sms", label: "Overdue nudge", body: t.day1Sms },
    { offset_days: 5, channel: "sms", label: "Second nudge", body: t.day5Sms },
    { offset_days: 10, channel: "email", label: "Firm follow-up", subject: t.day10Subject, body: t.day10 },
    { offset_days: 21, channel: "email", label: "Final notice", subject: t.day21Subject, body: t.day21 },
  ];
}

const COPY: Record<PresetTone, {
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
      "Hi {first_name}!\n\nQuick note — invoice {invoice_no} for {amount} was due yesterday.\n\nPay now: {pay_link}",
    day5Sms:
      "Hi {first_name},\n\nInvoice {invoice_no} for {amount} is {days_overdue} days overdue now — would love to get it squared away.\n\nPay now: {pay_link}",
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
      "Hi {first_name},\n\nInvoice {invoice_no} for {amount} was due yesterday.\n\nPay now: {pay_link}",
    day5Sms:
      "Hi {first_name},\n\nJust a nudge — invoice {invoice_no} for {amount} is now {days_overdue} days overdue.\n\nPay now: {pay_link}",
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
      "{first_name},\n\nInvoice {invoice_no} for {amount} is now overdue. Please pay today.\n\nPay now: {pay_link}",
    day5Sms:
      "{first_name},\n\nInvoice {invoice_no} for {amount} is {days_overdue} days overdue. Immediate payment required.\n\nPay now: {pay_link}",
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

export function emailHtml(body: string, businessName: string, phone?: string | null): string {
  const paragraphs = body
    .split("\n\n")
    .map((p) => `<p style="margin:0 0 16px 0;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  const contactLine = phone
    ? `<tr>
            <td style="padding:0 0 18px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7ead0;border-radius:10px;">
                <tr>
                  <td style="padding:12px 16px;font-size:13px;color:#3c2a0c;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                    Questions about this invoice? Call or text ${businessName} at <strong>${phone}</strong> — or just reply to this email.
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background-color:#f3eadb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3eadb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="padding-bottom:20px;">
              ${emailBrandHeaderHtml()}
            </td>
          </tr>
          <tr>
            <td style="background-color:#fffdf8;border-radius:16px;padding:28px;border:1px solid rgba(33,27,19,0.10);font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#211b13;">
              ${paragraphs}
            </td>
          </tr>
          <tr>
            <td style="padding-top:14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${contactLine}
              </table>
            </td>
          </tr>
          <tr>
            <td style="text-align:center;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0;color:#7c7061;font-size:12px;">Sent on behalf of ${businessName} by <a href="https://paypigeon.io/?utm_source=paypigeon&utm_medium=email&utm_campaign=reminder_footer" style="color:#7c7061;font-weight:700;text-decoration:underline;">PayPigeon</a></p>
              <p style="margin:4px 0 0;font-size:12px;"><a href="https://paypigeon.io/?utm_source=paypigeon&utm_medium=email&utm_campaign=reminder_footer" style="color:#b98a2f;text-decoration:underline;">Get your invoices paid on autopilot →</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  </body></html>`;
}

/** Auto-link pay links and bold amounts in email bodies. */
export function linkifyPayLink(html: string, payLink: string): string {
  if (!payLink) return html;
  return html.replaceAll(
    payLink,
    `<a href="${payLink}" style="display:inline-block;background-color:#e7a33c;color:#3c2a0c;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:700;">Pay now</a>`
  );
}
