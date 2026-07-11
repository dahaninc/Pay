"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInvoice } from "@/app/actions/invoices";
import type { ExtractedInvoice } from "@/lib/extraction";

export function NewInvoiceForm({
  currencySymbol,
  prefill,
  source = "manual",
}: {
  currencySymbol: string;
  prefill?: Partial<ExtractedInvoice>;
  source?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultDue = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const lowConfidence = (field: string) =>
    prefill?.confidence && (prefill.confidence[field] ?? 1) < 0.7;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("source", source);
    if (prefill) fd.set("extraction", JSON.stringify(prefill));
    const result = await createInvoice(fd);
    if (result.error) {
      setError(result.error);
      setBusy(false);
    } else {
      router.push(`/invoices/${result.invoiceId}?created=1`);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="label" htmlFor="customer_name">
          Who owes you?
        </label>
        <input
          id="customer_name"
          name="customer_name"
          required
          autoFocus={!prefill}
          className={`field ${lowConfidence("customer_name") ? "border-amber-400 bg-amber-50" : ""}`}
          placeholder="Sarah Miller"
          defaultValue={prefill?.customer_name ?? ""}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="amount">
            Amount
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400">
              {currencySymbol}
            </span>
            <input
              id="amount"
              name="amount"
              required
              inputMode="decimal"
              className={`field !pl-9 tnum ${lowConfidence("amount") ? "border-amber-400 bg-amber-50" : ""}`}
              placeholder="840.00"
              defaultValue={prefill?.amount ?? ""}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="due_at">
            Due date
          </label>
          <input
            id="due_at"
            name="due_at"
            type="date"
            required
            className={`field ${lowConfidence("due_date") ? "border-amber-400 bg-amber-50" : ""}`}
            defaultValue={prefill?.due_date ?? defaultDue}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="customer_phone">
            Mobile <span className="text-ink-400 font-normal">(for SMS)</span>
          </label>
          <input
            id="customer_phone"
            name="customer_phone"
            type="tel"
            className={`field ${lowConfidence("phone") ? "border-amber-400 bg-amber-50" : ""}`}
            placeholder="+1 555 000 1234"
            defaultValue={prefill?.phone ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor="customer_email">
            Email
          </label>
          <input
            id="customer_email"
            name="customer_email"
            type="email"
            className={`field ${lowConfidence("email") ? "border-amber-400 bg-amber-50" : ""}`}
            placeholder="sarah@email.com"
            defaultValue={prefill?.email ?? ""}
          />
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-ink-600 font-medium">More options</summary>
        <div className="mt-4 space-y-4">
          <div>
            <label className="label" htmlFor="number">
              Invoice number <span className="text-ink-400 font-normal">(auto if blank)</span>
            </label>
            <input
              id="number"
              name="number"
              className={`field ${lowConfidence("invoice_no") ? "border-amber-400 bg-amber-50" : ""}`}
              placeholder="INV-142"
              defaultValue={prefill?.invoice_no ?? ""}
            />
          </div>
          <div>
            <label className="label" htmlFor="notes">
              Notes (private)
            </label>
            <textarea id="notes" name="notes" className="field" rows={2} />
          </div>
        </div>
      </details>

      <label className="flex items-center gap-3 card p-4 cursor-pointer">
        <input type="checkbox" name="arm" defaultChecked className="w-5 h-5 accent-[var(--accent)]" />
        <span>
          <span className="font-semibold block">Arm reminders</span>
          <span className="text-sm text-ink-600">
            We&rsquo;ll follow up by text + email until it&rsquo;s paid
          </span>
        </span>
      </label>

      {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}

      <button type="submit" disabled={busy} className="btn-primary w-full text-lg">
        {busy ? "Saving…" : prefill ? "Looks right ✓" : "Save invoice"}
      </button>
    </form>
  );
}
