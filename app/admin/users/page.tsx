import Link from "next/link";
import {
  getAdminBusinesses,
  filterAndSortBusinesses,
  statusFor,
  sourceDetailFor,
  sourceTooltipFor,
  subscriptionsByBusinessId,
  appsumoCountsByBusiness,
} from "@/lib/adminData";
import { totalPaidCentsForCustomer, refundedCentsForCustomer } from "@/lib/adminStripe";
import { formatMoney, formatDate } from "@/lib/money";

const PAGE_SIZE = 25;

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const [businesses, subs, appsumo] = await Promise.all([
    getAdminBusinesses(),
    subscriptionsByBusinessId(),
    appsumoCountsByBusiness(),
  ]);
  const filtered = filterAndSortBusinesses(businesses, subs, {
    q: sp.q,
    plan: sp.plan,
    status: sp.status,
    sort: sp.sort,
    dir: sp.dir === "asc" ? "asc" : "desc",
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // total paid + refunds — only fetched for businesses with a Stripe customer
  const totalPaidMap = new Map<string, number | null>();
  const refundedMap = new Map<string, number | null>();
  await Promise.all(
    pageRows
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

  const plans = [...new Set(businesses.map((b) => b.plan))].sort();
  const statuses = [...new Set(businesses.map((b) => statusFor(b, subs.get(b.id))))].sort();

  const sortLink = (key: string) => {
    const nextDir = sp.sort === key && sp.dir !== "asc" ? "asc" : "desc";
    return qs({ ...sp, sort: key, dir: nextDir, page: undefined });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-disp font-extrabold text-2xl text-ink">Businesses</h1>
        <a
          href={`/api/admin/users/export${qs({ q: sp.q, plan: sp.plan, status: sp.status })}`}
          className="text-sm font-bold text-accent-text bg-accent-soft px-3.5 py-2 rounded-lg hover:opacity-80"
        >
          Export CSV
        </a>
      </div>
      <p className="text-[13px] font-medium text-muted mb-5">
        {filtered.length} of {businesses.length} businesses
      </p>

      <form className="flex flex-wrap gap-2 mb-4" method="get">
        <input
          type="text"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search name or email…"
          className="field !w-56"
        />
        <select name="plan" defaultValue={sp.plan ?? ""} className="field !w-auto">
          <option value="">All plans</option>
          {plans.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className="field !w-auto">
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary !min-h-0 !py-2 !px-4 text-sm">
          Filter
        </button>
        {(sp.q || sp.plan || sp.status) && (
          <Link href="/admin/users" className="text-sm font-semibold text-muted underline self-center">
            Clear
          </Link>
        )}
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hair text-left">
              <th className="px-4 py-3">
                <Link href={sortLink("name")} className="font-bold text-ink">
                  Business
                </Link>
              </th>
              <th className="px-4 py-3 font-bold text-ink">Email</th>
              <th className="px-4 py-3">
                <Link href={sortLink("created_at")} className="font-bold text-ink">
                  Signed up
                </Link>
              </th>
              <th className="px-4 py-3">
                <Link href={sortLink("plan")} className="font-bold text-ink">
                  Plan
                </Link>
              </th>
              <th className="px-4 py-3">
                <Link href={sortLink("status")} className="font-bold text-ink">
                  Status
                </Link>
              </th>
              <th className="px-4 py-3 font-bold text-ink">Source</th>
              <th className="px-4 py-3 font-bold text-ink">Promo</th>
              <th className="px-4 py-3 font-bold text-ink">Next payment</th>
              <th className="px-4 py-3 font-bold text-ink">Total paid</th>
              <th className="px-4 py-3 font-bold text-ink">Refunded</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((b) => {
              const sub = subs.get(b.id);
              const status = statusFor(b, sub);
              const totalPaid = totalPaidMap.get(b.id);
              const refunded = refundedMap.get(b.id);
              const codes = appsumo.get(b.id);
              const promo =
                b.plan === "lifetime"
                  ? `AppSumo ×${codes?.redeemed ?? b.lifetime_tier}`
                  : sub?.promo ?? "—";
              const refundedLabel =
                b.plan === "lifetime"
                  ? codes?.refunded
                    ? `${codes.refunded} code${codes.refunded === 1 ? "" : "s"} refunded`
                    : "—"
                  : refunded != null && refunded > 0
                    ? formatMoney(refunded, b.currency)
                    : "—";
              return (
                <tr key={b.id} className="border-b border-hair last:border-b-0">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link href={`/admin/users/${b.id}`} className="group block">
                      <span className="font-semibold text-ink block">{b.name}</span>
                      <span className="text-[11.5px] font-bold text-accent-text group-hover:underline">
                        Manage →
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{b.owner_email ?? "—"}</td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{formatDate(b.created_at)}</td>
                  <td className="px-4 py-3 capitalize whitespace-nowrap">
                    {b.plan === "lifetime" ? `lifetime (tier ${b.lifetime_tier})` : b.plan}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="capitalize">{status}</span>
                  </td>
                  <td
                    className="px-4 py-3 text-muted whitespace-nowrap cursor-default"
                    title={sourceTooltipFor(b)}
                  >
                    {sourceDetailFor(b)}
                  </td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{promo}</td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {b.plan === "lifetime"
                      ? "N/A (AppSumo)"
                      : totalPaid != null
                        ? formatMoney(totalPaid, b.currency)
                        : "—"}
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap ${refundedLabel !== "—" ? "text-danger-ink font-semibold" : "text-muted"}`}>
                    {refundedLabel}
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-muted">
                  No businesses match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-[12.5px] font-semibold text-muted">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={qs({ ...sp, page: page - 1 })} className="btn-secondary !min-h-0 !py-2 !px-4 text-sm">
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={qs({ ...sp, page: page + 1 })} className="btn-secondary !min-h-0 !py-2 !px-4 text-sm">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
