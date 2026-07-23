import { notFound } from "next/navigation";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * Platform-staff admin check, separate from per-business owner/member roles.
 * Matches the session's own verified email (never a client-supplied value) against
 * admin_users. 404s rather than 403s for non-admins — deliberately doesn't reveal
 * that /admin exists as a distinguishable "forbidden" route to a logged-in customer.
 * Every /admin page and every /api/admin/* route calls this directly — there is no
 * shared middleware gate, so each one independently fails closed.
 */
export async function requireAdmin(): Promise<{ user: User }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) notFound();

  const admin = createAdminSupabase();
  if (!admin) notFound();

  const { data: row } = await admin
    .from("admin_users")
    .select("id, user_id")
    .ilike("email", user.email)
    .maybeSingle();
  if (!row) notFound();

  if (!row.user_id) {
    await admin.from("admin_users").update({ user_id: user.id }).eq("id", row.id);
  }

  return { user };
}

/** Same check for Route Handlers, which can't call next/navigation's notFound(). */
export async function requireAdminApi(): Promise<User | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const admin = createAdminSupabase();
  if (!admin) return null;

  const { data: row } = await admin
    .from("admin_users")
    .select("id")
    .ilike("email", user.email)
    .maybeSingle();
  return row ? user : null;
}
