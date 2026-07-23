import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { getAdminBusinesses, filterAndSortBusinesses, statusFor, sourceFor, subscriptionsByBusinessId, appsumoCountsByBusiness } from "@/lib/adminData";
import { totalPaidCentsForCustomer, refundedCentsForCustomer } from "@/lib/adminStripe";
import { formatMoney, formatDate } from "@/lib/money";

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export async function GET(request: NextRequest) {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });

  const sp = request.nextUrl.searchParams;
  const [businesses, subs, appsumo] = await Promise.all([
    getAdminBusinesses(),
    subscriptionsByBusinessId(),
    appsumoCountsByBusiness(),
  ]);
  const filtered = filterAndSortBusinesses(businesses, subs, {
    q: sp.get("q") ?? undefined,
    plan: sp.get("plan") ?? undefined,
    status: sp.get("status") ?? undefined,
  });

  const totalPaidMap = new Map<string, number | null>();
  const refundedMap = new Map<string, number | null>();
  await Promise.all(
    filtered
      .filter((b) => b.stripe_customer_id)
      .map(async (b) => {
        const [paid, refunded] = await Promise.all([
          totalPaidCentsForCustomer(b.stripe_customer_id!),
          refundedCentsForCustomer(b.stripe_customer_id!),
        ]);
        totalPaidMap.set(b.id, paid);
        refundedMap.set(b.id, refunded);
      })
  );

  const header = [
    "Business", "Email", "Signed up", "Plan", "Status",
    "Source", "Medium", "Campaign", "Referrer", "Landing page",
    "Promo", "Next payment", "Total paid", "Refunded",
  ];
  const rows = filtered.map((b) => {
    const sub = subs.get(b.id);
    const totalPaid = totalPaidMap.get(b.id);
    const refunded = refundedMap.get(b.id);
    const codes = appsumo.get(b.id);
    const attr = b.signup_source;
    return [
      b.name,
      b.owner_email ?? "",
      formatDate(b.created_at),
      b.plan === "lifetime" ? `lifetime (tier ${b.lifetime_tier})` : b.plan,
      statusFor(b, sub),
      sourceFor(b),
      attr?.utm_medium ?? "",
      attr?.utm_campaign ?? "",
      attr?.referrer ?? "",
      attr?.landing ?? "",
      b.plan === "lifetime" ? `AppSumo x${codes?.redeemed ?? b.lifetime_tier}` : sub?.promo ?? "",
      sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : "",
      b.plan === "lifetime" ? "N/A (AppSumo)" : totalPaid != null ? formatMoney(totalPaid, b.currency) : "",
      b.plan === "lifetime"
        ? codes?.refunded
          ? `${codes.refunded} code(s) refunded`
          : ""
        : refunded != null && refunded > 0
          ? formatMoney(refunded, b.currency)
          : "",
    ];
  });

  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="paypigeon-businesses-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
