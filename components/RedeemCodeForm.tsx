"use client";

import { useState, useTransition } from "react";
import { redeemAppsumoCode } from "@/app/actions/appsumo";

export function RedeemCodeForm({ lifetimeTier, maxStack }: { lifetimeTier: number; maxStack: number }) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  if (lifetimeTier >= maxStack) return null;

  function submit() {
    if (!code.trim()) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("code", code);
      const result = await redeemAppsumoCode(fd);
      if (result?.error) {
        setMessage({ text: result.error, ok: false });
      } else {
        setMessage({ text: `Code applied — you're now at Tier ${result?.tier}.`, ok: true });
        setCode("");
      }
    });
  }

  return (
    <div className="card p-4 mt-3" style={{ borderRadius: 16 }}>
      <p className="text-[13.5px] font-bold text-ink mb-2">Have an AppSumo code?</p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="APPSUMO-XXXX-XXXX"
          className="field flex-1"
          disabled={pending}
        />
        <button
          onClick={submit}
          disabled={pending || !code.trim()}
          className="btn-primary !min-h-11 !px-4 text-sm shrink-0"
        >
          Redeem
        </button>
      </div>
      {message && (
        <p className={`text-[12.5px] font-semibold mt-2 ${message.ok ? "text-accent-text" : "text-danger-ink"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
