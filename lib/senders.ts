import { Resend } from "resend";

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
    const from = process.env.PAIDUP_FROM_EMAIL || "PayPigeon <onboarding@resend.dev>";
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

export async function sendSms(opts: { to: string; body: string }): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { status: "simulated" };

  try {
    const twilio = (await import("twilio")).default;
    const client = twilio(sid, token);
    const msg = await client.messages.create({ to: opts.to, from, body: opts.body });
    return { status: "sent", providerId: msg.sid };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}
