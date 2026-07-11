import { requireBusiness } from "@/lib/supabase/server";
import { ScanUpload } from "@/components/ScanUpload";

const SYMBOLS: Record<string, string> = { USD: "$", GBP: "£", CAD: "$", AUD: "$" };

export default async function ScanPage() {
  const { business } = await requireBusiness();
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-5">Scan an invoice</h1>
      <ScanUpload currencySymbol={SYMBOLS[business.currency] ?? "$"} />
    </div>
  );
}
