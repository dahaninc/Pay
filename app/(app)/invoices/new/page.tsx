import Link from "next/link";
import { requireBusiness } from "@/lib/supabase/server";
import { NewInvoiceForm } from "@/components/NewInvoiceForm";
import { ScanUpload } from "@/components/ScanUpload";
import { CsvImport } from "@/components/CsvImport";
import { CopyButton } from "@/components/CopyButton";
import { BRAND, BRAND_TLD } from "@/lib/brand";

const SYMBOLS: Record<string, string> = { USD: "$", GBP: "£", CAD: "$", AUD: "$" };

const TABS = [
  { key: "type", label: "Type it" },
  { key: "snap", label: "Snap a photo" },
  { key: "forward", label: "Forward email" },
  { key: "csv", label: "CSV" },
] as const;

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { business } = await requireBusiness();
  const tab = (await searchParams).tab ?? "type";
  const symbol = SYMBOLS[business.currency] ?? "$";
  const forwardAddr = `bills+${business.inbound_alias}@${BRAND_TLD}`;

  return (
    <div className="max-w-[520px] mx-auto pt-3">
      <h1 className="sm:hidden font-disp font-extrabold text-[26px] tracking-[-0.02em] text-ink px-0.5">
        Add an invoice
      </h1>
      <p className="text-[13px] font-semibold text-muted px-0.5 mt-1 sm:mt-0 mb-[18px]">
        Four ways in — pick whatever&rsquo;s fastest.
      </p>

      <div className="flex gap-2 overflow-x-auto mb-[18px] -mx-4 px-4 [scrollbar-width:none]">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/invoices/new?tab=${t.key}`}
            className={tab === t.key ? "pill-tab-on" : "pill-tab-off"}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "type" && (
        <div>
          <div className="card p-5 sm:p-6">
            <NewInvoiceForm currencySymbol={symbol} />
          </div>
          <p className="text-[12.5px] font-medium text-muted text-center mt-3.5">
            Reminders send only 9am–8pm local · never Sundays.
          </p>
        </div>
      )}

      {tab === "snap" && <ScanUpload currencySymbol={symbol} />}

      {tab === "forward" && (
        <div className="card p-[22px] text-center">
          <p className="font-bold text-base text-ink">Forward the invoice email</p>
          <p className="text-[13.5px] leading-relaxed font-medium text-muted mt-1.5">
            Send any invoice to your private {BRAND} address. We&rsquo;ll read it and send you a
            one-tap confirm card. Reminders stay off until you confirm.
          </p>
          <p className="mt-4 bg-surface2 border border-hair rounded-xl px-3.5 py-[13px] font-disp font-bold text-sm text-accent-ink break-all select-all">
            {forwardAddr}
          </p>
          <CopyButton text={forwardAddr} label="Copy address" />
        </div>
      )}

      {tab === "csv" && <CsvImport />}
    </div>
  );
}
