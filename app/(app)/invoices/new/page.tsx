import Link from "next/link";
import { requireBusiness } from "@/lib/supabase/server";
import { NewInvoiceForm } from "@/components/NewInvoiceForm";

const SYMBOLS: Record<string, string> = { USD: "$", GBP: "£", CAD: "$", AUD: "$" };

export default async function NewInvoicePage() {
  const { business } = await requireBusiness();

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-1">Add an unpaid invoice</h1>
      <p className="text-ink-600 text-sm mb-5">Four fields. Twenty seconds.</p>

      <div className="flex gap-2 mb-6">
        <Link href="/invoices/scan" className="btn-secondary flex-1 text-sm !min-h-11">
          📸 Snap a photo
        </Link>
        <Link href="/invoices/import" className="btn-secondary flex-1 text-sm !min-h-11">
          📊 Import CSV
        </Link>
      </div>

      <div className="card p-5 sm:p-6">
        <NewInvoiceForm currencySymbol={SYMBOLS[business.currency] ?? "$"} />
      </div>

      <p className="text-xs text-ink-400 text-center mt-4">
        Tip: forward invoice emails to{" "}
        <span className="font-mono text-ink-600">bills+{business.inbound_alias}@paidup.app</span>{" "}
        and we&rsquo;ll read them for you.
      </p>
    </div>
  );
}
