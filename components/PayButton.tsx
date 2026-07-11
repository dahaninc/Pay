"use client";

import { useState } from "react";

export function PayButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pay/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Couldn't start payment");
      else window.location.href = json.url;
    } catch {
      setError("Couldn't start payment — try again.");
    }
    setBusy(false);
  }

  return (
    <div>
      <button onClick={pay} disabled={busy} className="btn-primary w-full text-lg">
        {busy ? "Opening secure checkout…" : "Pay now"}
      </button>
      <p className="text-xs text-ink-400 text-center mt-2">
        Card, Apple Pay or Google Pay · secure checkout by Stripe
      </p>
      {error && <p className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
    </div>
  );
}
