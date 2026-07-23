"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { InvoiceIcon, ChartIcon, PlusIcon, SettingsIcon, CardIcon } from "@/components/icons";

const NAV = [
  { href: "/invoices", label: "Invoices", icon: InvoiceIcon },
  { href: "/dashboard", label: "Your money", icon: ChartIcon },
  { href: "/invoices/new", label: "Add invoice", icon: PlusIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/invoices")
    return pathname === "/invoices" || (/^\/invoices\/(?!new|scan|import)/.test(pathname));
  if (href === "/invoices/new")
    return ["/invoices/new", "/invoices/scan", "/invoices/import"].some((p) =>
      pathname.startsWith(p)
    );
  return pathname.startsWith(href);
}

const PAGE_TITLES: [RegExp, string][] = [
  [/^\/invoices\/new|^\/invoices\/scan|^\/invoices\/import/, "Add invoice"],
  [/^\/invoices\/[^/]+\/edit/, "Edit invoice"],
  [/^\/invoices\/[^/]+/, "Invoice details"],
  [/^\/invoices/, "Invoices"],
  [/^\/dashboard/, "Your money"],
  [/^\/settings\/templates/, "Message templates"],
  [/^\/settings/, "Settings"],
];

export function Sidebar({
  businessName,
  planLine,
  showPickPlan,
  stripeConnected,
}: {
  businessName: string;
  planLine: string;
  showPickPlan: boolean;
  stripeConnected: boolean;
}) {
  const pathname = usePathname();
  return (
    <aside className="hidden sm:flex flex-col w-[250px] shrink-0 px-4 py-6 border-r border-hair bg-surface sticky top-0 h-screen">
      <div className="px-2 pb-6">
        <Link href="/invoices">
          <Logo />
        </Link>
      </div>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        if (href === "/settings") {
          return (
            <span key="settings-group">
              <Link
                href="/settings#payments"
                className="flex items-center gap-3 w-full rounded-xl px-3.5 py-[11px] mb-1 text-sm font-bold transition-colors text-muted hover:bg-surface2"
              >
                <CardIcon size={20} />
                {stripeConnected ? "Stripe account" : "Connect Stripe account"}
              </Link>
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 w-full rounded-xl px-3.5 py-[11px] mb-1 text-sm font-bold transition-colors ${
                  active ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-surface2"
                }`}
              >
                <Icon size={20} />
                {label}
              </Link>
            </span>
          );
        }
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 w-full rounded-xl px-3.5 py-[11px] mb-1 text-sm font-bold transition-colors ${
              active ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-surface2"
            }`}
          >
            <Icon size={20} />
            {label}
          </Link>
        );
      })}
      <div className="mt-auto flex flex-col gap-3">
        <div className="bg-surface2 border border-hair rounded-[14px] p-3.5">
          <p className="text-[13px] font-bold text-ink">{businessName}</p>
          <p className="text-[11.5px] font-semibold text-muted mt-0.5">{planLine}</p>
          {showPickPlan && (
            <Link
              href="/settings#billing"
              className="mt-2.5 block w-full text-center text-xs font-bold text-accent-ink bg-accent rounded-[9px] px-3 py-2"
            >
              Pick a plan
            </Link>
          )}
        </div>
        <ThemeToggle withLabel />
      </div>
    </aside>
  );
}

export function Topbar() {
  const pathname = usePathname();
  const title = PAGE_TITLES.find(([re]) => re.test(pathname))?.[1] ?? "";
  return (
    <div className="hidden sm:flex sticky top-0 z-20 bg-bg border-b border-hair items-center py-4">
      <div className="max-w-[960px] w-full mx-auto px-8 flex items-center justify-between gap-4">
        <h1 className="font-disp font-extrabold text-2xl tracking-[-0.02em] text-ink">{title}</h1>
        <Link href="/invoices/new" className="btn-primary !min-h-11 !px-4 text-sm">
          <PlusIcon size={18} strokeWidth={2.4} />
          New invoice
        </Link>
      </div>
    </div>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-hair pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-end justify-around px-4 pt-2 pb-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          const isAdd = href === "/invoices/new";
          if (isAdd)
            return (
              <Link key={href} href={href} className="flex flex-col items-center gap-1">
                <span
                  className="w-[52px] h-[52px] -mt-6 rounded-full bg-accent text-accent-ink flex items-center justify-center"
                  style={{ boxShadow: "0 10px 22px -6px var(--shadow)" }}
                >
                  <PlusIcon size={24} strokeWidth={2.6} />
                </span>
                <span className={`text-[10.5px] font-bold ${active ? "text-accent-text" : "text-muted"}`}>
                  Add
                </span>
              </Link>
            );
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-[3px] py-1 min-w-16 ${
                active ? "text-amber-ink" : "text-muted"
              }`}
            >
              <Icon size={23} />
              <span className="text-[10.5px] font-bold">
                {label === "Your money" ? "Money" : label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
