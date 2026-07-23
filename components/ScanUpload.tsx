"use client";

import { useState } from "react";
import Link from "next/link";
import { NewInvoiceForm } from "@/components/NewInvoiceForm";
import type { ExtractedInvoice } from "@/lib/extraction";

export function ScanUpload({
  defaultCurrency,
  scanUnavailable = false,
}: {
  defaultCurrency: string;
  /** Soft fallback: this month's photo scans are used up (checked server-side on the page —
   *  see lib/extractionCap.ts). Steers to CSV/manual, which stay unlimited. Never shows a
   *  number or an error — it's a gentle redirect, not a wall. */
  scanUnavailable?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedInvoice | null>(null);
  const [capReached, setCapReached] = useState(scanUnavailable);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    try {
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const json = await res.json();
      if (json.capReached) setCapReached(true); // stale tab defense — same soft fallback
      else if (!res.ok) setError(json.error ?? "Extraction failed");
      else setExtracted(json.extracted);
    } catch {
      setError("Upload failed — check your connection and try again.");
    }
    setBusy(false);
  }

  if (capReached && !extracted) {
    return (
      <div className="card p-8 text-center">
        <p className="text-4xl mb-3">📸</p>
        <h2 className="font-bold text-lg">You&rsquo;ve used this month&rsquo;s photo scans</h2>
        <p className="text-ink-600 text-sm mt-1 mb-5">
          Add invoices by CSV import or manual entry — both unlimited.
        </p>
        <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
          <Link href="/invoices/new?tab=csv" className="btn-primary">
            Import a CSV
          </Link>
          <Link href="/invoices/new?tab=type" className="btn-secondary">
            Type it in
          </Link>
        </div>
      </div>
    );
  }

  if (extracted) {
    return (
      <div>
        <div className="card p-4 mb-5 bg-brand-50 border-brand-100 text-sm text-brand-700">
          We read your invoice — <span className="font-semibold">check the 4 fields below</span>.
          Anything highlighted amber we weren&rsquo;t sure about.
        </div>
        <div className="card p-5 sm:p-6">
          <NewInvoiceForm defaultCurrency={defaultCurrency} prefill={extracted} source="photo" />
        </div>
        <button
          className="w-full text-sm text-ink-600 underline mt-4"
          onClick={() => setExtracted(null)}
        >
          Scan a different photo
        </button>
      </div>
    );
  }

  return (
    <div className="card p-8 text-center">
      {busy ? (
        <>
          <p className="text-4xl mb-3 animate-pulse">🔍</p>
          <p className="font-semibold">Reading your invoice…</p>
          <p className="text-sm text-ink-600 mt-1">Usually takes a few seconds</p>
        </>
      ) : (
        <>
          <p className="text-4xl mb-3">📸</p>
          <h2 className="font-bold text-lg">Snap or upload the invoice</h2>
          <p className="text-ink-600 text-sm mt-1 mb-5">
            Paper invoice, PDF, screenshot — we&rsquo;ll pull out the details and you confirm.
          </p>
          <label className="btn-primary cursor-pointer">
            Choose photo or PDF
            <input
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="hidden"
              onChange={onFile}
            />
          </label>
          {error && <p className="mt-4 text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
        </>
      )}
    </div>
  );
}
