import { createAdminSupabase } from "@/lib/supabase/server";
import type { Business } from "@/lib/types";
import { subscriptionsByBusinessId, type StripeSubInfo } from "@/lib/adminStripe";

export interface AdminBusinessRow extends Business {
  owner_email: string | null;
  owner_last_sign_in_at: string | null;
}

/** All businesses joined with their owner's email + last sign-in, from the real Supabase data. */
export async function getAdminBusinesses(): Promise<AdminBusinessRow[]> {
  const admin = createAdminSupabase();
  if (!admin) return [];

  const { data: businesses } = await admin
    .from("businesses")
    .select("*")
    .order("created_at", { ascending: false });
  const rows = (businesses ?? []) as Business[];

  const userMap = new Map<string, { email: string | null; last_sign_in_at: string | null }>();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) break;
    for (const u of data.users) {
      userMap.set(u.id, { email: u.email ?? null, last_sign_in_at: u.last_sign_in_at ?? null });
    }
    if (data.users.length < 1000) break;
  }

  return rows.map((b) => ({
    ...b,
    owner_email: userMap.get(b.owner_id)?.email ?? null,
    owner_last_sign_in_at: userMap.get(b.owner_id)?.last_sign_in_at ?? null,
  }));
}

/** Where a business came from: utm_source, else the referrer's hostname, else "direct". */
export function sourceFor(b: Pick<Business, "signup_source">): string {
  const s = b.signup_source;
  if (!s) return "direct";
  if (s.utm_source) return s.utm_source;
  if (s.referrer) {
    try {
      return new URL(s.referrer).hostname.replace(/^www\./, "");
    } catch {
      return s.referrer;
    }
  }
  return "direct";
}

/**
 * Source + touchpoint, e.g. "paypigeon / email" (reminder-footer link), "paypigeon / pay_page",
 * "google_ads / cpc", "reddit.com" (organic referral), "direct". The medium is what tells you
 * WHICH sale point converted, not just the channel.
 */
export function sourceDetailFor(b: Pick<Business, "signup_source">): string {
  const base = sourceFor(b);
  const medium = b.signup_source?.utm_medium;
  return medium ? `${base} / ${medium}` : base;
}

/** Full attribution line for tooltips/CSV: campaign, landing page, first-touch date. */
export function sourceTooltipFor(b: Pick<Business, "signup_source">): string {
  const s = b.signup_source;
  if (!s) return "No attribution captured — signed up direct or before tracking shipped";
  return [
    s.utm_campaign ? `campaign: ${s.utm_campaign}` : null,
    s.referrer ? `referrer: ${s.referrer}` : null,
    s.landing ? `landed on: ${s.landing}` : null,
    s.at ? `first touch: ${s.at.slice(0, 10)}` : null,
  ]
    .filter(Boolean)
    .join(" · ") || "UTM-tagged visit, no further detail";
}

/**
 * AppSumo code counts per business (redeemed = their "promo", refunded = pulled access
 * during AppSumo's 60-day window). Lifetime businesses have no Stripe money trail, so
 * this is their real promo/refund story.
 */
export async function appsumoCountsByBusiness(): Promise<
  Map<string, { redeemed: number; refunded: number }>
> {
  const admin = createAdminSupabase();
  const map = new Map<string, { redeemed: number; refunded: number }>();
  if (!admin) return map;
  const { data } = await admin
    .from("appsumo_codes")
    .select("redeemed_by_business_id, status")
    .not("redeemed_by_business_id", "is", null);
  for (const row of data ?? []) {
    const id = row.redeemed_by_business_id as string;
    const entry = map.get(id) ?? { redeemed: 0, refunded: 0 };
    if (row.status === "redeemed") entry.redeemed++;
    if (row.status === "refunded") entry.refunded++;
    map.set(id, entry);
  }
  return map;
}

/** Human status label combining local plan state with live Stripe subscription status. */
export function statusFor(b: AdminBusinessRow, sub: StripeSubInfo | undefined): string {
  if (b.plan === "lifetime") return "lifetime";
  if (b.plan === "trial") return "trialing";
  if (b.plan === "expired") return "expired";
  return sub?.status ?? b.plan;
}

export interface UsersFilter {
  q?: string;
  plan?: string;
  status?: string;
  sort?: string;
  dir?: "asc" | "desc";
}

export function filterAndSortBusinesses(
  rows: AdminBusinessRow[],
  subs: Map<string, StripeSubInfo>,
  filter: UsersFilter
): AdminBusinessRow[] {
  let out = rows;
  if (filter.q) {
    const q = filter.q.toLowerCase();
    out = out.filter(
      (b) => b.name.toLowerCase().includes(q) || (b.owner_email ?? "").toLowerCase().includes(q)
    );
  }
  if (filter.plan) out = out.filter((b) => b.plan === filter.plan);
  if (filter.status) out = out.filter((b) => statusFor(b, subs.get(b.id)) === filter.status);

  const sortKey = filter.sort ?? "created_at";
  const dir = filter.dir === "asc" ? 1 : -1;
  out = [...out].sort((a, b) => {
    if (sortKey === "name") return dir * a.name.localeCompare(b.name);
    if (sortKey === "plan") return dir * a.plan.localeCompare(b.plan);
    if (sortKey === "status")
      return dir * statusFor(a, subs.get(a.id)).localeCompare(statusFor(b, subs.get(b.id)));
    // default: created_at
    return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  });
  return out;
}

export { subscriptionsByBusinessId };
