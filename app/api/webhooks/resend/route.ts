import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { verifySvixSignature } from "@/lib/svix";
import { notifyOwnerFailedSend } from "@/lib/notify";
import { appUrl } from "@/lib/scheduler";

/**
 * Resend delivery events → message status for the invoice timeline (delivered/opened/clicked),
 * plus real bounce handling: a hard bounce flags the customer and notifies the owner — the
 * address is dead, and silently "sending" future reminders into it would break the product's
 * core promise.
 *
 * Signature: Resend signs this webhook via Svix like the inbound one, but it's a separate
 * endpoint in their dashboard with its own whsec_ secret — set RESEND_EVENTS_WEBHOOK_SECRET
 * in Vercel to enforce verification (fails closed once set; accepted with a logged warning
 * until then, matching the codebase's degrade-without-keys pattern).
 */
export async function POST(request: NextRequest) {
  const db = createAdminSupabase();
  if (!db) return NextResponse.json({ error: "service key not configured" }, { status: 503 });

  const rawBody = await request.text();
  if (!verifySvixSignature(rawBody, request.headers, process.env.RESEND_EVENTS_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  if (!process.env.RESEND_EVENTS_WEBHOOK_SECRET) {
    console.warn("[resend-events] RESEND_EVENTS_WEBHOOK_SECRET not set — accepting unverified webhook request");
  }

  let payload: { type?: string; data?: { email_id?: string } } | null = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }
  const type = payload?.type;
  const emailId = payload?.data?.email_id;
  if (!type || !emailId) return NextResponse.json({ ok: true });

  const statusMap: Record<string, string> = {
    "email.delivered": "delivered",
    "email.opened": "opened",
    "email.clicked": "clicked",
    "email.bounced": "failed",
    "email.failed": "failed", // rejected before delivery was even attempted
  };
  const newStatus = statusMap[type];
  if (!newStatus) return NextResponse.json({ ok: true });
  const failureReason = type === "email.bounced" ? "email bounced" : "email failed to send";

  // never downgrade: clicked > opened > delivered > sent
  const rank: Record<string, number> = { sent: 0, delivered: 1, opened: 2, clicked: 3, failed: 4 };
  const { data: msg } = await db
    .from("messages")
    .select("id, status, business_id, invoice_id, customer_id")
    .eq("provider_id", emailId)
    .maybeSingle();
  if (!msg || (rank[newStatus] ?? 0) <= (rank[msg.status] ?? 0)) {
    return NextResponse.json({ ok: true });
  }

  await db
    .from("messages")
    .update({ status: newStatus, ...(newStatus === "failed" ? { error: failureReason } : {}) })
    .eq("id", msg.id);

  if (newStatus === "failed" && msg.invoice_id) {
    if (msg.customer_id) {
      await db.from("customers").update({ flagged: true }).eq("id", msg.customer_id);
    }
    const [{ data: business }, { data: invoice }, { data: customer }] = await Promise.all([
      db.from("businesses").select("id, name, reply_to_email").eq("id", msg.business_id).single(),
      db.from("invoices").select("id, number").eq("id", msg.invoice_id).single(),
      msg.customer_id
        ? db.from("customers").select("name").eq("id", msg.customer_id).single()
        : Promise.resolve({ data: null }),
    ]);
    if (business && invoice) {
      await notifyOwnerFailedSend({
        db,
        business,
        invoice,
        customer,
        channel: "email",
        reason: failureReason,
        invoiceUrl: `${appUrl()}/invoices/${invoice.id}`,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
