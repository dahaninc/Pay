import { getAdminBusinesses, sourceFor } from "@/lib/adminData";
import { StatCard } from "@/components/admin/StatCard";

export default async function AdminOverviewPage() {
  const businesses = await getAdminBusinesses();
  const now = Date.now();
  const day = 86400000;

  const active7d = businesses.filter(
    (b) => b.owner_last_sign_in_at && now - new Date(b.owner_last_sign_in_at).getTime() < 7 * day
  ).length;
  const active30d = businesses.filter(
    (b) => b.owner_last_sign_in_at && now - new Date(b.owner_last_sign_in_at).getTime() < 30 * day
  ).length;

  const days = Array.from({ length: 30 }, (_, i) =>
    new Date(now - (29 - i) * day).toISOString().slice(0, 10)
  );
  const signupsByDay = new Map<string, number>(days.map((d) => [d, 0]));
  for (const b of businesses) {
    const d = b.created_at.slice(0, 10);
    if (signupsByDay.has(d)) signupsByDay.set(d, (signupsByDay.get(d) ?? 0) + 1);
  }
  const maxSignups = Math.max(...signupsByDay.values(), 1);

  const byPlan = businesses.reduce<Record<string, number>>((acc, b) => {
    acc[b.plan] = (acc[b.plan] ?? 0) + 1;
    return acc;
  }, {});

  const bySource = businesses.reduce<Record<string, number>>((acc, b) => {
    const src = sourceFor(b);
    acc[src] = (acc[src] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <h1 className="font-disp font-extrabold text-2xl text-ink mb-1">
        Welcome back — here&rsquo;s how PayPigeon is doing.
      </h1>
      <p className="text-[13px] font-medium text-muted mb-6">
        Live data · {businesses.length} {businesses.length === 1 ? "business" : "businesses"} on the
        platform.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Total businesses" value={String(businesses.length)} />
        <StatCard
          label="Active (7d)"
          value={String(active7d)}
          sub="Owner signed in within 7 days"
        />
        <StatCard
          label="Active (30d)"
          value={String(active30d)}
          sub="Owner signed in within 30 days"
        />
      </div>

      <h2 className="font-bold text-base text-ink mb-3">Signups — last 30 days</h2>
      <div className="card p-4 flex items-end gap-[3px] h-40 mb-8">
        {[...signupsByDay.entries()].map(([d, count]) => (
          <div
            key={d}
            className="flex-1 bg-accent rounded-t min-h-[3px]"
            style={{ height: `${Math.max(3, (count / maxSignups) * 100)}%` }}
            title={`${d}: ${count} signup${count === 1 ? "" : "s"}`}
          />
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <div>
          <h2 className="font-bold text-base text-ink mb-3">By plan</h2>
          <div className="card overflow-hidden">
            {Object.entries(byPlan).map(([plan, count]) => (
              <div
                key={plan}
                className="flex items-center justify-between px-4 py-3 border-b border-hair last:border-b-0"
              >
                <span className="font-semibold text-sm text-ink capitalize">{plan}</span>
                <span className="font-disp font-bold text-sm text-ink tnum">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="font-bold text-base text-ink mb-3">By source</h2>
          <div className="card overflow-hidden">
            {Object.entries(bySource)
              .sort((a, b) => b[1] - a[1])
              .map(([src, count]) => (
                <div
                  key={src}
                  className="flex items-center justify-between px-4 py-3 border-b border-hair last:border-b-0"
                >
                  <span className="font-semibold text-sm text-ink">{src}</span>
                  <span className="font-disp font-bold text-sm text-ink tnum">{count}</span>
                </div>
              ))}
          </div>
          <p className="text-[12px] font-medium text-muted mt-2">
            First-touch UTM/referrer, captured at signup. Businesses from before this shipped
            show as &ldquo;direct&rdquo;.
          </p>
        </div>
      </div>
    </div>
  );
}
