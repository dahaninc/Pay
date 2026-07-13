import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

const STOP_WORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit"];

// fixed 12-byte DER prefix that turns a raw 32-byte Ed25519 public key into a valid SPKI DER blob
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function verifySignature(rawBody: string, signatureB64: string | null, timestamp: string | null): boolean {
  const publicKeyB64 = process.env.TELNYX_PUBLIC_KEY;
  if (!publicKeyB64 || !signatureB64 || !timestamp) return false;
  try {
    const spki = Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyB64, "base64")]);
    const keyObject = crypto.createPublicKey({ key: spki, format: "der", type: "spki" });
    const message = Buffer.from(`${timestamp}|${rawBody}`);
    return crypto.verify(null, message, keyObject, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

/**
 * Telnyx messaging webhook: inbound SMS (STOP handling + reply logging) and
 * outbound delivery status (message.finalized → delivered/failed on the timeline).
 * Signature verified with Ed25519 per https://developers.telnyx.com/docs/messaging/webhooks.
 */
export async function POST(request: NextRequest) {
  const db = createAdminSupabase();
  if (!db) return NextResponse.json({ error: "service key not configured" }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get("telnyx-signature-ed25519");
  const timestamp = request.headers.get("telnyx-timestamp");
  if (!verifySignature(rawBody, signature, timestamp)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const eventType: string | undefined = payload?.data?.event_type;
  const msg = payload?.data?.payload;
  if (!eventType || !msg) return NextResponse.json({ ok: true });

  if (eventType === "message.received") {
    const from: string = msg.from?.phone_number ?? "";
    const body: string = String(msg.text ?? "").trim();
    if (!from) return NextResponse.json({ ok: true });

    const { data: customers } = await db.from("customers").select("id, business_id").eq("phone", from);
    const isStop = STOP_WORDS.includes(body.toLowerCase());

    for (const cust of customers ?? []) {
      if (isStop) {
        await db.from("customers").update({ sms_opted_out: true }).eq("id", cust.id);
        await db.from("events").insert({
          business_id: cust.business_id,
          type: "sms_optout",
          entity: "customer",
          entity_id: cust.id,
          data: { via: "sms_reply" },
        });
      }
      // attach the reply to their most recent open invoice for the timeline
      const { data: invoice } = await db
        .from("invoices")
        .select("id")
        .eq("customer_id", cust.id)
        .in("status", ["outstanding", "paused"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      await db.from("messages").insert({
        business_id: cust.business_id,
        invoice_id: invoice?.id ?? null,
        customer_id: cust.id,
        channel: "sms",
        direction: "inbound",
        to_address: from,
        body,
        status: "received",
        idempotency_key: `inbound:${from}:${Date.now()}`,
      });
    }
  } else if (eventType === "message.finalized") {
    // delivery outcome for a message we sent — mirror the Resend webhook's never-downgrade pattern
    const providerId: string | undefined = msg.id;
    const toStatus: string | undefined = msg.to?.[0]?.status;
    if (providerId && toStatus) {
      const newStatus = toStatus === "delivered" ? "delivered" : toStatus.includes("failed") ? "failed" : null;
      if (newStatus) {
        const rank: Record<string, number> = { queued: 0, sent: 1, delivered: 2, failed: 3 };
        const { data: existing } = await db
          .from("messages")
          .select("id, status")
          .eq("provider_id", providerId)
          .maybeSingle();
        if (existing && (rank[newStatus] ?? 0) > (rank[existing.status] ?? 0)) {
          await db.from("messages").update({ status: newStatus }).eq("id", existing.id);
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
