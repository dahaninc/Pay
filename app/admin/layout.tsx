import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Businesses" },
  { href: "/admin/revenue", label: "Revenue" },
  { href: "/admin/payments", label: "Payments" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();

  // "Back to app" only makes sense for an admin who is also a customer — for pure staff
  // accounts (the CEO) the admin dashboard IS the app, and the link would just bounce back.
  let hasBusiness = false;
  const db = createAdminSupabase();
  if (db) {
    const [{ count: owned }, { count: member }] = await Promise.all([
      db.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
      db.from("business_members").select("user_id", { count: "exact", head: true }).eq("user_id", user.id),
    ]);
    hasBusiness = (owned ?? 0) > 0 || (member ?? 0) > 0;
  }

  return (
    <div className="min-h-screen bg-app">
      <div className="border-b border-hair bg-surface">
        <div className="max-w-[1100px] mx-auto px-6 py-4 flex items-center gap-6">
          <span className="font-disp font-extrabold text-lg text-ink">PayPigeon Admin</span>
          <nav className="flex gap-1">
            {ADMIN_NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="px-3 py-1.5 rounded-lg text-sm font-bold text-muted hover:bg-surface2 hover:text-ink transition-colors"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            {hasBusiness ? (
              <Link href="/invoices" className="text-sm font-semibold text-muted hover:text-ink">
                ← Back to app
              </Link>
            ) : (
              <span className="text-sm font-semibold text-muted">{user.email}</span>
            )}
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm font-bold text-danger-ink bg-danger-soft rounded-lg px-3 py-1.5 hover:opacity-80"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
      <main className="max-w-[1100px] mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
