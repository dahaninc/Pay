import Stripe from "stripe";

export interface StripeSubInfo {
  status: string;
  currentPeriodEnd: string | null; // ISO
  interval: "month" | "year" | null;
  amountCents: number | null;
  cancelAtPeriodEnd: boolean;
  /** Coupon/promotion applied to the subscription, e.g. "LAUNCH20 (20% off)" — null if none. */
  promo: string | null;
}

function client(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

/** Human label for a subscription's applied coupon/promotion, e.g. "LAUNCH20 (20% off)". */
function promoLabel(sub: Stripe.Subscription): string | null {
  const d = sub.discounts?.[0];
  if (!d || typeof d === "string") return null; // unexpanded id — treat as no detail
  const promoCode =
    d.promotion_code && typeof d.promotion_code === "object" ? d.promotion_code.code : null;
  const coupon = d.source?.coupon ?? null;
  if (coupon && typeof coupon === "object") {
    const name = promoCode || coupon.name || coupon.id;
    const value =
      coupon.percent_off != null
        ? `${coupon.percent_off}% off`
        : coupon.amount_off != null
          ? `${(coupon.amount_off / 100).toFixed(2)} ${coupon.currency?.toUpperCase() ?? ""} off`
          : null;
    return value ? `${name} (${value})` : name;
  }
  if (promoCode) return promoCode;
  if (typeof coupon === "string") return coupon; // bare coupon id, often human-readable
  return null;
}

/**
 * Live subscription data keyed by business_id (from subscription metadata — the same
 * metadata createBusiness() already sets on every checkout session). Not cached locally
 * anywhere, so this is always a live Stripe call: next billing date, billing interval, and
 * amount aren't stored in Supabase at all today.
 */
export async function subscriptionsByBusinessId(): Promise<Map<string, StripeSubInfo>> {
  const stripe = client();
  const map = new Map<string, StripeSubInfo>();
  if (!stripe) return map;

  const fetchAll = async (expandDiscounts: boolean) => {
    let startingAfter: string | undefined;
    for (let page = 0; page < 20; page++) {
      const res = await stripe.subscriptions.list({
        status: "all",
        limit: 100,
        starting_after: startingAfter,
        // 3-level expand so promoLabel() can read the coupon details; if Stripe ever
        // rejects the path we retry without it — promo detail is nice-to-have, the
        // core subscription data (status/next payment/MRR) is not.
        ...(expandDiscounts ? { expand: ["data.discounts.source.coupon"] } : {}),
      });
      for (const sub of res.data) {
        const businessId = sub.metadata?.business_id;
        if (!businessId) continue;
        const item = sub.items.data[0];
        map.set(businessId, {
          status: sub.status,
          currentPeriodEnd: item?.current_period_end
            ? new Date(item.current_period_end * 1000).toISOString()
            : null,
          interval: item?.price?.recurring?.interval === "year" ? "year" : item?.price?.recurring?.interval === "month" ? "month" : null,
          amountCents: item?.price?.unit_amount ?? null,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          promo: promoLabel(sub),
        });
      }
      if (!res.has_more || res.data.length === 0) break;
      startingAfter = res.data[res.data.length - 1].id;
    }
  };

  try {
    await fetchAll(true);
  } catch {
    try {
      map.clear();
      await fetchAll(false);
    } catch {
      // Stripe hiccup (network, rate limit, key/mode mismatch) — return whatever we have
      // rather than crash the whole admin page over live subscription data.
    }
  }
  return map;
}

/**
 * Real monthly revenue for the last N months, from actual paid invoices on the platform
 * account (not connected accounts, so this is purely PayPigeon's own subscription revenue,
 * not the Connect payments customers make to businesses). Grouped by invoice creation month.
 */
export async function monthlyRevenueLastNMonths(months = 12): Promise<{ month: string; cents: number }[]> {
  const stripe = client();
  const buckets = new Map<string, number>();
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
  }
  if (!stripe) return [...buckets.entries()].map(([month, cents]) => ({ month, cents }));

  try {
    const since = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    let startingAfter: string | undefined;
    for (let page = 0; page < 50; page++) {
      const res = await stripe.invoices.list({
        status: "paid",
        created: { gte: Math.floor(since.getTime() / 1000) },
        limit: 100,
        starting_after: startingAfter,
      });
      for (const inv of res.data) {
        const d = new Date(inv.created * 1000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + inv.amount_paid);
      }
      if (!res.has_more || res.data.length === 0) break;
      startingAfter = res.data[res.data.length - 1].id;
    }
  } catch {
    // Stripe hiccup — return the zeroed buckets rather than crash the revenue page.
  }
  return [...buckets.entries()].map(([month, cents]) => ({ month, cents }));
}

/**
 * Total refunded to one Stripe customer, summed from amount_refunded across their real
 * charges. Same null-on-failure convention as totalPaidCentsForCustomer: null means
 * "couldn't fetch", 0 means "genuinely no refunds".
 */
export async function refundedCentsForCustomer(customerId: string): Promise<number | null> {
  const stripe = client();
  if (!stripe) return null;

  let total = 0;
  try {
    let startingAfter: string | undefined;
    for (let page = 0; page < 20; page++) {
      const res = await stripe.charges.list({ customer: customerId, limit: 100, starting_after: startingAfter });
      for (const ch of res.data) total += ch.amount_refunded;
      if (!res.has_more || res.data.length === 0) break;
      startingAfter = res.data[res.data.length - 1].id;
    }
  } catch {
    return null;
  }
  return total;
}

/**
 * Lifetime total paid for one Stripe customer — summed from their paid invoices. Live call,
 * not cached. Returns null (not 0) on any failure — an unknown/deleted customer or a Stripe
 * hiccup is "we don't know," not "they paid nothing," and the UI should show that distinctly.
 */
export async function totalPaidCentsForCustomer(customerId: string): Promise<number | null> {
  const stripe = client();
  if (!stripe) return null;

  let total = 0;
  try {
    let startingAfter: string | undefined;
    for (let page = 0; page < 20; page++) {
      const res = await stripe.invoices.list({
        customer: customerId,
        status: "paid",
        limit: 100,
        starting_after: startingAfter,
      });
      for (const inv of res.data) total += inv.amount_paid;
      if (!res.has_more || res.data.length === 0) break;
      startingAfter = res.data[res.data.length - 1].id;
    }
  } catch {
    return null;
  }
  return total;
}
