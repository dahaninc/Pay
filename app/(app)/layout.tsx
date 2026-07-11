import Link from "next/link";
import { requireBusiness } from "@/lib/supabase/server";
import { Sidebar, Topbar, BottomNav } from "@/components/Shell";
import { trialDaysLeft, isTrialExpired, PLANS } from "@/lib/plans";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { business } = await requireBusiness();
  const daysLeft = trialDaysLeft(business);
  const expired = isTrialExpired(business) || business.plan === "expired";

  const planLine =
    business.plan === "trial"
      ? expired
        ? "Trial ended"
        : `Free trial · ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`
      : business.plan === "expired"
        ? "Plan lapsed"
        : `${PLANS[business.plan as keyof typeof PLANS]?.name ?? business.plan} plan`;

  return (
    <div className="sm:flex min-h-screen">
      <Sidebar
        businessName={business.name}
        planLine={planLine}
        showPickPlan={business.plan === "trial" || business.plan === "expired"}
      />
      <div className="flex-1 min-w-0">
        <Topbar />

        {expired && (
          <div className="bg-danger-soft text-danger-ink text-sm font-semibold text-center py-2 px-4">
            Your trial has ended — reminders are paused.{" "}
            <Link href="/settings#billing" className="underline font-bold">
              Choose a plan to resume
            </Link>
          </div>
        )}
        {!expired && business.plan === "trial" && daysLeft <= 7 && (
          <div className="sm:hidden bg-amber-soft text-amber-ink text-sm font-semibold text-center py-2 px-4">
            {daysLeft} {daysLeft === 1 ? "day" : "days"} left in your trial —{" "}
            <Link href="/settings#billing" className="underline font-bold">
              pick a plan
            </Link>
          </div>
        )}

        <main className="max-w-[960px] mx-auto px-4 sm:px-8 pt-2 sm:pt-6 pb-32 sm:pb-16 anim-fade">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
