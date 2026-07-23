import { Resend } from "resend";
import { SENDER_EMAIL } from "@/lib/brand";

export interface SendResult {
  status: "sent" | "simulated" | "failed";
  providerId?: string;
  error?: string;
}

/**
 * Providers degrade gracefully: with no API keys configured, messages are
 * recorded as "simulated" so the whole product loop works in demo mode.
 */

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string | null;
  fromName?: string | null;
  bcc?: string | null;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { status: "simulated" };

  try {
    const resend = new Resend(apiKey);
    const from = process.env.PAYPIGEON_FROM_EMAIL || `PayPigeon <${SENDER_EMAIL}>`;
    const { data, error } = await resend.emails.send({
      from: opts.fromName ? from.replace(/^[^<]*</, `${opts.fromName} <`) : from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      replyTo: opts.replyTo || undefined,
      bcc: opts.bcc || undefined,
    });
    if (error) return { status: "failed", error: error.message };
    return { status: "sent", providerId: data?.id };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

/** True for US/CA E.164 numbers (+1...) — the only countries our domestic long code can send to. */
export function isDomesticSms(phone: string): boolean {
  return phone.startsWith("+1");
}

/**
 * Normalizes a customer-entered phone number toward E.164 (the only format Telnyx accepts).
 * Handles the "00" international-dialing prefix (e.g. "0044...") some customers use instead
 * of "+", and strips spaces/dashes/parens. Numbers already starting with "+" pass through
 * with only whitespace stripped. Not a full E.164 validator — just clears the most common
 * cause of outright rejected sends.
 */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/[\s\-()]/g, "");
  const digitsOnly = trimmed.replace(/[\s\-()]/g, "");
  if (digitsOnly.startsWith("00")) return "+" + digitsOnly.slice(2);
  return trimmed;
}

/**
 * Reads a phone field from form input: trims, normalizes, and treats a bare "+"
 * (left over from the input's pre-filled placeholder when a user submits without
 * typing a number) the same as empty. Returns null for "no phone given."
 */
export function cleanPhoneInput(raw: FormDataEntryValue | null): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed || trimmed === "+") return null;
  return normalizePhone(trimmed);
}

/**
 * SMS via Telnyx (https://developers.telnyx.com/docs/messaging/messages/send-a-message).
 * Domestic (+1) sends use the long-code number + domestic messaging profile. International
 * sends use the Alphanumeric Sender ID + international messaging profile instead — alpha
 * senders can't receive replies at all, so this only ever applies to outbound.
 */
export async function sendSms(opts: { to: string; body: string }): Promise<SendResult> {
  const apiKey = process.env.TELNYX_API_KEY;
  const domestic = isDomesticSms(opts.to);
  const from = domestic
    ? process.env.TELNYX_FROM_NUMBER
    : process.env.TELNYX_ALPHA_SENDER || process.env.TELNYX_FROM_NUMBER;
  const messagingProfileId = domestic
    ? process.env.TELNYX_MESSAGING_PROFILE_ID
    : process.env.TELNYX_INTL_MESSAGING_PROFILE_ID || process.env.TELNYX_MESSAGING_PROFILE_ID;
  if (!apiKey || !from) return { status: "simulated" };

  try {
    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        text: opts.body,
        ...(messagingProfileId ? { messaging_profile_id: messagingProfileId } : {}),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      const message = json?.errors?.[0]?.detail || json?.errors?.[0]?.title || `HTTP ${res.status}`;
      return { status: "failed", error: message };
    }
    return { status: "sent", providerId: json?.data?.id };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}
