import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import { formatMoney, formatDate } from "@/lib/money";
import { PayButton } from "@/components/PayButton";

interface PayInvoice {
  invoice_id: string;
  number: string;
  amount_cents: number;
  currency: string;
  due_at: string;
  status: string;
  business_name: string;
  business_email: string | null;
  business_phone: string | null;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
}

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ success?: string; optout?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data } = await supabase.rpc("get_invoice_by_token", { token });
  const invoice = (data?.[0] ?? null) as PayInvoice | null;

  if (sp.optout === "sms" && invoice) {
    await supabase.rpc("optout_sms_by_token", { token });
  }

  if (!invoice) {
    return (
      <Shell>
        <div className="card p-8 text-center">
          <p className="text-3xl mb-3">🤔</p>
          <h1 className="font-bold text-lg">Invoice not found</h1>
          <p className="text-ink-600 text-sm mt-1">
            This payment link doesn&rsquo;t look right — check the link in your message.
          </p>
        </div>
      </Shell>
    );
  }

  const canPayOnline =
    !!process.env.STRIPE_SECRET_KEY &&
    !!invoice.stripe_account_id &&
    invoice.stripe_charges_enabled;

  return (
    <Shell>
      {sp.optout === "sms" && (
        <div className="card p-4 mb-4 text-sm text-ink-600 text-center">
          ✓ You won&rsquo;t receive any more text reminders about invoices from{" "}
          {invoice.business_name}.
        </div>
      )}

      <div className="card p-6 sm:p-8">
        <p className="text-sm text-ink-400 text-center">Invoice from</p>
        <h1 className="text-xl font-bold text-center">{invoice.business_name}</h1>

        <div className="my-6 text-center">
          <p className="text-4xl font-bold tnum">
            {formatMoney(Number(invoice.amount_cents), invoice.currency)}
          </p>
          <p className="text-sm text-ink-400 mt-1">
            Invoice {invoice.number} · due {formatDate(invoice.due_at)}
          </p>
        </div>

        {invoice.status === "paid" || sp.success ? (
          <div className="text-center bg-brand-50 text-brand-700 rounded-xl p-5">
            <p className="text-3xl mb-1.5">🎉</p>
            <p className="font-bold">
              {sp.success ? "Payment received — thank you!" : "This invoice is already paid"}
            </p>
            <p className="text-sm mt-1 opacity-80">
              {invoice.business_name} has been notified.
            </p>
          </div>
        ) : canPayOnline ? (
          <PayButton token={token} />
        ) : (
          <div className="bg-gray-50 rounded-xl p-5 text-sm text-ink-600">
            <p className="font-semibold text-ink-900 mb-1.5">How to pay</p>
            <p>
              Contact {invoice.business_name} to settle this invoice
              {invoice.business_phone ? ` — ${invoice.business_phone}` : ""}
              {invoice.business_email ? ` · ${invoice.business_email}` : ""}.
            </p>
            <p className="mt-2 text-ink-400">Already paid? They&rsquo;ll mark it settled shortly.</p>
          </div>
        )}
      </div>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-400 mt-5">
        <Image src="/logo-mark.png" alt="" width={14} height={14} aria-hidden />
        <span>
          Reminders powered by{" "}
          <a
            href="https://paypigeon.io/?utm_source=paypigeon&utm_medium=pay_page&utm_campaign=powered_by"
            className="font-semibold underline hover:text-ink-600"
            target="_blank"
            rel="noopener"
          >
            PayPigeon
          </a>{" "}
          — get your invoices paid on autopilot · payments go directly to {invoice.business_name}
        </span>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center px-5 py-10">
      <div className="w-full max-w-md mx-auto">{children}</div>
    </div>
  );
}
