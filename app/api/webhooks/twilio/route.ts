import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

const STOP_WORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit"];

/** Inbound SMS: STOP handling (instant, per-contact) + reply logging for the timeline. */
export async function POST(request: NextRequest) {
  const db = createAdminSupabase();
  if (!db) return new NextResponse("service key not configured", { status: 503 });

  const form = await request.formData();
  const from = String(form.get("From") || "");
  const body = String(form.get("Body") || "").trim();
  if (!from) return twiml();

  const { data: customers } = await db
    .from("customers")
    .select("id, business_id")
    .eq("phone", from);

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

  return twiml();
}

function twiml() {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}
