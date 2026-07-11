"use client";

import { useState } from "react";
import { NewInvoiceForm } from "@/components/NewInvoiceForm";
import type { ExtractedInvoice } from "@/lib/extraction";

export function ScanUpload({ currencySymbol }: { currencySymbol: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedInvoice | null>(null);

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
      if (!res.ok) setError(json.error ?? "Extraction failed");
      else setExtracted(json.extracted);
    } catch {
      setError("Upload failed — check your connection and try again.");
    }
    setBusy(false);
  }

  if (extracted) {
    return (
      <div>
        <div className="card p-4 mb-5 bg-brand-50 border-brand-100 text-sm text-brand-700">
          We read your invoice — <span className="font-semibold">check the 4 fields below</span>.
          Anything highlighted amber we weren&rsquo;t sure about.
        </div>
        <div className="card p-5 sm:p-6">
          <NewInvoiceForm currencySymbol={currencySymbol} prefill={extracted} source="photo" />
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
