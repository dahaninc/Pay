import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/scheduler";

/** Public: create a Stripe Checkout session on the business's connected account for a pay link. */
export async function POST(request: NextRequest) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ error: "payments not configured" }, { status: 503 });

  const { token } = await request.json().catch(() => ({}));
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });

  // anon client — RPC is security-definer and token-scoped
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data, error } = await supabase.rpc("get_invoice_by_token", { token });
  if (error || !data?.length)
    return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  const invoice = data[0];

  if (invoice.status === "paid")
    return NextResponse.json({ error: "already paid" }, { status: 409 });
  if (!invoice.stripe_account_id || !invoice.stripe_charges_enabled)
    return NextResponse.json({ error: "online payments not enabled" }, { status: 409 });

  const stripe = new Stripe(key);
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: invoice.currency.toLowerCase(),
            product_data: { name: `Invoice ${invoice.number} — ${invoice.business_name}` },
            unit_amount: Number(invoice.amount_cents),
          },
          quantity: 1,
        },
      ],
      metadata: { invoice_id: invoice.invoice_id },
      success_url: `${appUrl()}/pay/${token}?success=1`,
      cancel_url: `${appUrl()}/pay/${token}`,
    },
    { stripeAccount: invoice.stripe_account_id }
  );

  return NextResponse.json({ url: session.url });
}
