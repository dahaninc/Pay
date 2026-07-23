import { getAdminBusinesses, subscriptionsByBusinessId } from "@/lib/adminData";
import { formatMoney, formatDate } from "@/lib/money";

export default async function AdminPaymentsPage() {
  const [businesses, subs] = await Promise.all([getAdminBusinesses(), subscriptionsByBusinessId()]);
  const byId = new Map(businesses.map((b) => [b.id, b]));

  const now = Date.now();
  const in30Days = now + 30 * 86400000;

  const overdue = [...subs.entries()]
    .filter(([, s]) => ["past_due", "unpaid"].includes(s.status))
    .map(([businessId, s]) => ({ business: byId.get(businessId), sub: s }))
    .filter((r) => r.business);

  const upcoming = [...subs.entries()]
    .filter(([, s]) => s.status === "active" && s.currentPeriodEnd)
    .map(([businessId, s]) => ({ business: byId.get(businessId), sub: s }))
    .filter((r) => r.business && new Date(r.sub.currentPeriodEnd!).getTime() <= in30Days)
    .sort((a, b) => new Date(a.sub.currentPeriodEnd!).getTime() - new Date(b.sub.currentPeriodEnd!).getTime());

  return (
    <div>
      <h1 className="font-disp font-extrabold text-2xl text-ink mb-1">Payments</h1>
      <p className="text-[13px] font-medium text-muted mb-6">Live from Stripe subscription status.</p>

      <h2 className="font-bold text-base text-danger-ink mb-3">
        Failed / overdue ({overdue.length})
      </h2>
      <div className="card overflow-hidden mb-8">
        {overdue.length === 0 && (
          <p className="px-4 py-6 text-center text-muted text-sm">No failed or past-due subscriptions.</p>
        )}
        {overdue.map(({ business, sub }) => (
          <div
            key={business!.id}
            className="flex items-center justify-between px-4 py-3 border-b border-hair last:border-b-0 bg-danger-soft"
          >
            <div>
              <p className="font-semibold text-sm text-ink">{business!.name}</p>
              <p className="text-[12px] text-muted">{business!.owner_email}</p>
            </div>
            <span className="text-[12.5px] font-bold text-danger-ink capitalize">{sub.status}</span>
          </div>
        ))}
      </div>

      <h2 className="font-bold text-base text-ink mb-3">Due in the next 30 days ({upcoming.length})</h2>
      <div className="card overflow-hidden">
        {upcoming.length === 0 && (
          <p className="px-4 py-6 text-center text-muted text-sm">Nothing due in the next 30 days.</p>
        )}
        {upcoming.map(({ business, sub }) => (
          <div key={business!.id} className="flex items-center justify-between px-4 py-3 border-b border-hair last:border-b-0">
            <div>
              <p className="font-semibold text-sm text-ink">{business!.name}</p>
              <p className="text-[12px] text-muted">{business!.owner_email}</p>
            </div>
            <div className="text-right">
              <p className="font-disp font-bold text-sm text-ink tnum">
                {sub.amountCents !== null ? formatMoney(sub.amountCents, "USD") : "—"}
              </p>
              <p className="text-[12px] text-muted">{formatDate(sub.currentPeriodEnd!)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
