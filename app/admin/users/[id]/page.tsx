import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminSupabase } from "@/lib/supabase/server";
import { subscriptionsByBusinessId, totalPaidCentsForCustomer } from "@/lib/adminStripe";
import { sourceDetailFor, sourceTooltipFor } from "@/lib/adminData";
import { formatMoney, formatDate } from "@/lib/money";
import { LTD_MAX_STACK } from "@/lib/plans";
import {
  ChangePlanControl,
  AccessUntilControl,
  LifetimeTierControl,
} from "@/components/admin/SubscriptionControls";
import type { Business } from "@/lib/types";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-hair last:border-b-0 text-sm">
      <span className="font-semibold text-muted">{label}</span>
      <span className="font-medium text-ink text-right">{value}</span>
    </div>
  );
}

export default async function AdminBusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createAdminSupabase();
  if (!db) notFound();

  const { data } = await db.from("businesses").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const business = data as Business;

  const [{ data: owner }, subs] = await Promise.all([
    db.auth.admin.getUserById(business.owner_id),
    subscriptionsByBusinessId(),
  ]);
  const sub = subs.get(business.id);
  const totalPaid = business.stripe_customer_id
    ? await totalPaidCentsForCustomer(business.stripe_customer_id)
    : null;

  const accessUntil =
    business.stripe_trial_end ??
    (business.plan === "trial" ? business.trial_ends_at : null);

  return (
    <div className="max-w-[640px]">
      <Link href="/admin/users" className="text-sm font-semibold text-muted hover:text-ink">
        ← All businesses
      </Link>
      <h1 className="font-disp font-extrabold text-2xl text-ink mt-3 mb-1">{business.name}</h1>
      <p className="text-[13px] font-medium text-muted mb-6">
        {owner?.user?.email ?? "unknown owner"} · signed up {formatDate(business.created_at)} ·{" "}
        <span title={sourceTooltipFor(business)}>source: {sourceDetailFor(business)}</span>
      </p>

      <h2 className="font-bold text-base text-ink mb-3">Subscription</h2>
      <div className="card overflow-hidden mb-6">
        <Row
          label="Plan"
          value={business.plan === "lifetime" ? `lifetime (tier ${business.lifetime_tier})` : business.plan}
        />
        <Row label="Stripe status" value={sub?.status ?? business.stripe_subscription_status ?? "no subscription"} />
        {sub?.interval && <Row label="Billing interval" value={sub.interval === "year" ? "yearly" : "monthly"} />}
        {sub?.amountCents != null && <Row label="Price" value={formatMoney(sub.amountCents, "USD")} />}
        {sub?.promo && <Row label="Promo" value={sub.promo} />}
        {sub?.currentPeriodEnd && <Row label="Next payment" value={formatDate(sub.currentPeriodEnd)} />}
        {accessUntil && <Row label="Access until" value={formatDate(accessUntil)} />}
        {sub?.cancelAtPeriodEnd && <Row label="Cancels at period end" value="yes" />}
        <Row
          label="Total paid"
          value={
            business.plan === "lifetime"
              ? "N/A (AppSumo)"
              : totalPaid != null
                ? formatMoney(totalPaid, business.currency)
                : "—"
          }
        />
      </div>

      <h2 className="font-bold text-base text-ink mb-3">Manage</h2>
      <div className="space-y-4">
        <ChangePlanControl
          businessId={business.id}
          businessName={business.name}
          currentPlan={business.plan}
          hasStripeSubscription={!!business.stripe_subscription_id}
        />
        <AccessUntilControl
          businessId={business.id}
          businessName={business.name}
          hasStripeSubscription={!!business.stripe_subscription_id}
        />
        <LifetimeTierControl
          businessId={business.id}
          businessName={business.name}
          currentTier={business.lifetime_tier}
          maxTier={LTD_MAX_STACK}
        />
      </div>
      <p className="text-[12px] font-medium text-muted mt-4">
        Every change here is written to the audit log (events table,
        type&nbsp;admin_subscription_change) with your admin email attached.
      </p>
    </div>
  );
}
