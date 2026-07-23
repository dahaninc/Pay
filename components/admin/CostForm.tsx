"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CostForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 7); // YYYY-MM

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/costs", {
        method: "POST",
        body: JSON.stringify({
          month: `${formData.get("month")}-01`,
          category: formData.get("category"),
          amount_cents: Math.round(parseFloat(String(formData.get("amount"))) * 100),
          note: formData.get("note") || null,
        }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Couldn't save that cost");
        return;
      }
      router.refresh();
    });
  }

  return (
    <form action={submit} className="card p-4 flex flex-wrap gap-2 items-end">
      <div>
        <label className="text-[11px] font-bold text-muted block mb-1">Month</label>
        <input type="month" name="month" defaultValue={today} required className="field !w-36" />
      </div>
      <div>
        <label className="text-[11px] font-bold text-muted block mb-1">Category</label>
        <input type="text" name="category" placeholder="Vercel, Supabase…" required className="field !w-40" />
      </div>
      <div>
        <label className="text-[11px] font-bold text-muted block mb-1">Amount (USD)</label>
        <input type="number" name="amount" step="0.01" min="0" placeholder="20.00" required className="field !w-28" />
      </div>
      <div className="flex-1 min-w-[140px]">
        <label className="text-[11px] font-bold text-muted block mb-1">Note (optional)</label>
        <input type="text" name="note" className="field" />
      </div>
      <button type="submit" disabled={pending} className="btn-primary !min-h-0 !py-2.5 !px-4 text-sm">
        Add cost
      </button>
      {error && <p className="text-[12.5px] font-semibold text-danger-ink w-full">{error}</p>}
    </form>
  );
}
