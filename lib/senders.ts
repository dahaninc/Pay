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
    });
    if (error) return { status: "failed", error: error.message };
    return { status: "sent", providerId: data?.id };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

/** SMS via Telnyx (https://developers.telnyx.com/docs/messaging/messages/send-a-message). */
export async function sendSms(opts: { to: string; body: string }): Promise<SendResult> {
  const apiKey = process.env.TELNYX_API_KEY;
  const from = process.env.TELNYX_FROM_NUMBER;
  const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;
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
