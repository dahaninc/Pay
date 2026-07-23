import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Business } from "@/lib/types";

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component — middleware refreshes sessions
          }
        },
      },
    }
  );
}

/** Service-role client for cron jobs and webhooks. Null when key not configured. */
export function createAdminSupabase(): SupabaseClient | null {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}

/**
 * Platform-staff check by verified session email (admin_users is service-role-only, so this
 * uses the admin client). Lives here rather than lib/admin.ts to avoid an import cycle —
 * lib/admin.ts imports from this file.
 */
export async function isAdminUser(email: string | undefined): Promise<boolean> {
  if (!email) return false;
  const admin = createAdminSupabase();
  if (!admin) return false;
  const { data } = await admin.from("admin_users").select("id").ilike("email", email).maybeSingle();
  return !!data;
}

/** Current user + their business, redirecting to /login or /onboarding as needed. */
export async function requireBusiness() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: owned } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);
  const business = owned?.[0] ?? null;

  if (!business) {
    // maybe a team member rather than owner
    const { data: memberships } = await supabase
      .from("business_members")
      .select("business_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1);
    const membership = memberships?.[0];
    if (membership) {
      const { data: b } = await supabase
        .from("businesses")
        .select("*")
        .eq("id", membership.business_id)
        .single();
      if (b) return { supabase, user, business: b as Business };
    }
    // Platform staff aren't customers: an admin with no business belongs on the admin
    // dashboard, not in client onboarding (where they'd accidentally start a real trial).
    if (await isAdminUser(user.email)) redirect("/admin");
    redirect("/onboarding");
  }

  return { supabase, user, business: business as Business };
}
