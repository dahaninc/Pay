import { createAdminSupabase } from "@/lib/supabase/server";
import { getAdminBusinesses, subscriptionsByBusinessId } from "@/lib/adminData";
import { monthlyRevenueLastNMonths } from "@/lib/adminStripe";
import { formatMoney } from "@/lib/money";
import { StatCard } from "@/components/admin/StatCard";
import { CostForm } from "@/components/admin/CostForm";

export default async function AdminRevenuePage() {
  const admin = createAdminSupabase();
  const [businesses, subs, monthly] = await Promise.all([
    getAdminBusinesses(),
    subscriptionsByBusinessId(),
    monthlyRevenueLastNMonths(12),
  ]);

  const activeBusinesses = businesses.filter((b) => {
    const s = subs.get(b.id);
    return s?.status === "active";
  });

  const mrrCents = activeBusinesses.reduce((sum, b) => {
    const s = subs.get(b.id)!;
    const amount = s.amountCents ?? 0;
    return sum + (s.interval === "year" ? Math.round(amount / 12) : amount);
  }, 0);
  const arrCents = mrrCents * 12;
  const arpuCents = activeBusinesses.length ? Math.round(mrrCents / activeBusinesses.length) : 0;

  const revenueByPlan = activeBusinesses.reduce<Record<string, number>>((acc, b) => {
    const s = subs.get(b.id)!;
    const amount = s.amountCents ?? 0;
    const monthly = s.interval === "year" ? Math.round(amount / 12) : amount;
    acc[b.plan] = (acc[b.plan] ?? 0) + monthly;
    return acc;
  }, {});

  const now = new Date();
  const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { count: churnedThisMonth } = admin
    ? await admin
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("type", "subscription_canceled")
        .gte("created_at", monthStartIso)
    : { count: null };

  const { data: costRows } = admin
    ? await admin.from("costs").select("*").order("month", { ascending: false }).limit(24)
    : { data: [] };
  const costs = costRows ?? [];
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const costsThisMonthCents = costs
    .filter((c) => c.month.slice(0, 7) === thisMonthKey)
    .reduce((s, c) => s + c.amount_cents, 0);
  const profitCents = mrrCents - costsThisMonthCents;

  const maxMonthly = Math.max(...monthly.map((m) => m.cents), 1);

  return (
    <div>
      <h1 className="font-disp font-extrabold text-2xl text-ink mb-1">Revenue</h1>
      <p className="text-[13px] font-medium text-muted mb-6">
        MRR/ARR from live Stripe subscription data · {activeBusinesses.length} active paying businesses.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="MRR" value={formatMoney(mrrCents, "USD")} />
        <StatCard label="ARR" value={formatMoney(arrCents, "USD")} />
        <StatCard label="ARPU" value={formatMoney(arpuCents, "USD")} sub="per active business/mo" />
        <StatCard
          label="Churned this month"
          value={churnedThisMonth !== null && churnedThisMonth !== undefined ? String(churnedThisMonth) : "—"}
          sub="Only tracked from today forward"
        />
      </div>

      <h2 className="font-bold text-base text-ink mb-3">Revenue by plan (MRR)</h2>
      <div className="card overflow-hidden mb-8">
        {Object.entries(revenueByPlan).length === 0 && (
          <p className="px-4 py-6 text-center text-muted text-sm">No active paying subscriptions yet.</p>
        )}
        {Object.entries(revenueByPlan).map(([plan, cents]) => (
          <div key={plan} className="flex items-center justify-between px-4 py-3 border-b border-hair last:border-b-0">
            <span className="font-semibold text-sm text-ink capitalize">{plan}</span>
            <span className="font-disp font-bold text-sm text-ink tnum">{formatMoney(cents, "USD")}</span>
          </div>
        ))}
      </div>

      <h2 className="font-bold text-base text-ink mb-3">Monthly revenue — last 12 months (real paid invoices)</h2>
      <div className="card p-4 flex items-end gap-2 h-40 mb-8">
        {monthly.map((m) => (
          <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full bg-accent rounded-t min-h-[3px]"
              style={{ height: `${Math.max(3, (m.cents / maxMonthly) * 100)}px`, maxHeight: 120 }}
              title={`${m.month}: ${formatMoney(m.cents, "USD")}`}
            />
            <span className="text-[10px] font-semibold text-muted">{m.month.slice(5)}</span>
          </div>
        ))}
      </div>

      <h2 className="font-bold text-base text-ink mb-3">Profitability — this month</h2>
      <div className="card p-4 mb-3">
        <div className="flex items-center justify-between text-sm py-1.5">
          <span className="font-semibold text-muted">MRR</span>
          <span className="font-disp font-bold text-ink tnum">{formatMoney(mrrCents, "USD")}</span>
        </div>
        <div className="flex items-center justify-between text-sm py-1.5">
          <span className="font-semibold text-muted">Costs entered this month</span>
          <span className="font-disp font-bold text-danger-ink tnum">
            -{formatMoney(costsThisMonthCents, "USD")}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm py-1.5 border-t border-hair mt-1 pt-2.5">
          <span className="font-bold text-ink">Profit</span>
          <span className={`font-disp font-bold tnum ${profitCents >= 0 ? "text-ink" : "text-danger-ink"}`}>
            {formatMoney(profitCents, "USD")}
          </span>
        </div>
      </div>
      <p className="text-[12px] font-medium text-muted mb-3">
        Costs are manually entered (no automated source exists for Vercel/Supabase/Telnyx/Resend/
        Anthropic spend) — add this month&rsquo;s costs below.
      </p>
      <CostForm />
      {costs.length > 0 && (
        <div className="card overflow-hidden mt-4">
          {costs.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-2.5 border-b border-hair last:border-b-0 text-sm">
              <span className="font-semibold text-ink">{c.category}</span>
              <span className="text-muted">{c.month.slice(0, 7)}</span>
              <span className="font-disp font-bold text-ink tnum">{formatMoney(c.amount_cents, "USD")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
