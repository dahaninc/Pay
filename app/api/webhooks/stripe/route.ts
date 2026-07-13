import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminSupabase } from "@/lib/supabase/server";
import { stopSequence } from "@/lib/scheduler";

export async function POST(request: NextRequest) {
  const key = process.env.STRIPE_SECRET_KEY;
  // Two separate Stripe destinations point at this one URL: "Your account" scope
  // (subscription billing) and "Connected accounts" scope (Pay Now checkouts +
  // Connect onboarding) — each has its own signing secret, so try both.
  const whSecrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(
    (s): s is string => !!s
  );
  if (!key || whSecrets.length === 0) {
    return NextResponse.json({ error: "stripe not configured" }, { status: 503 });
  }
  const db = createAdminSupabase();
  if (!db) {
    return NextResponse.json({ error: "SUPABASE_SECRET_KEY not configured" }, { status: 503 });
  }

  const stripe = new Stripe(key);
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  let event: Stripe.Event | null = null;
  for (const secret of whSecrets) {
    try {
      event = stripe.webhooks.constructEvent(body, sig!, secret);
      break;
    } catch {
      // try the next secret
    }
  }
  if (!event) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    // Pay Now checkout completed on a connected account
    case "checkout.session.completed": {
      const session = event.data.object;
      const invoiceId = session.metadata?.invoice_id;
      if (invoiceId && session.payment_status === "paid") {
        const { data: invoice } = await db
          .from("invoices")
          .select("*")
          .eq("id", invoiceId)
          .single();
        if (invoice && invoice.status !== "paid") {
          const now = new Date().toISOString();
          await db.from("invoices").update({ status: "paid", paid_at: now }).eq("id", invoiceId);
          await db.from("payments").insert({
            business_id: invoice.business_id,
            invoice_id: invoiceId,
            amount_cents: session.amount_total ?? invoice.amount_cents,
            currency: invoice.currency,
            method: "stripe",
            stripe_payment_intent:
              typeof session.payment_intent === "string" ? session.payment_intent : null,
            paid_at: now,
          });
          await stopSequence(db, invoiceId);
          await db.from("events").insert({
            business_id: invoice.business_id,
            type: "invoice_paid",
            entity: "invoice",
            entity_id: invoiceId,
            data: { method: "stripe" },
          });
        }
      }
      break;
    }

    // Connect onboarding progress
    case "account.updated": {
      const account = event.data.object;
      await db
        .from("businesses")
        .update({ stripe_charges_enabled: !!account.charges_enabled })
        .eq("stripe_account_id", account.id);
      break;
    }

    // Our subscription billing
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const businessId = sub.metadata?.business_id;
      if (businessId) {
        const active = ["active", "trialing"].includes(sub.status);
        const plan = (sub.metadata?.plan as string) || "solo";
        await db
          .from("businesses")
          .update({
            plan: active ? plan : "expired",
            stripe_subscription_id: sub.id,
          })
          .eq("id", businessId);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const businessId = sub.metadata?.business_id;
      if (businessId) {
        await db.from("businesses").update({ plan: "expired" }).eq("id", businessId);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
