"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminChangePlan,
  adminSetAccessUntil,
  adminSetLifetimeTier,
} from "@/app/actions/adminSubscription";

type ActionResult = { error?: string; ok?: boolean } | undefined;

function useAdminAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function run(action: (fd: FormData) => Promise<ActionResult>, fd: FormData, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await action(fd);
      if (result?.error) setMessage({ text: result.error, ok: false });
      else {
        setMessage({ text: "Done.", ok: true });
        router.refresh();
      }
    });
  }
  return { pending, message, run };
}

function Feedback({ message }: { message: { text: string; ok: boolean } | null }) {
  if (!message) return null;
  return (
    <p className={`text-[12.5px] font-semibold mt-2 ${message.ok ? "text-accent-text" : "text-danger-ink"}`}>
      {message.text}
    </p>
  );
}

export function ChangePlanControl({
  businessId,
  businessName,
  currentPlan,
  hasStripeSubscription,
}: {
  businessId: string;
  businessName: string;
  currentPlan: string;
  hasStripeSubscription: boolean;
}) {
  const { pending, message, run } = useAdminAction();
  const [plan, setPlan] = useState(["solo", "crew", "pro"].includes(currentPlan) ? currentPlan : "crew");
  const [interval, setInterval] = useState("monthly");

  return (
    <div className="card p-4">
      <p className="font-bold text-[14.5px] text-ink mb-1">Change plan</p>
      <p className="text-[12.5px] font-medium text-muted mb-3">
        {hasStripeSubscription
          ? "Swaps their Stripe subscription price with proration — a real billing change on their card."
          : "No Stripe subscription on file — this grants plan access directly without charging them."}
      </p>
      <div className="flex flex-wrap gap-2">
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className="field !w-auto" disabled={pending}>
          <option value="solo">Solo</option>
          <option value="crew">Crew</option>
          <option value="pro">Pro</option>
        </select>
        <select value={interval} onChange={(e) => setInterval(e.target.value)} className="field !w-auto" disabled={pending}>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
        <button
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set("business_id", businessId);
            fd.set("plan", plan);
            fd.set("interval", interval);
            run(
              adminChangePlan,
              fd,
              `Change ${businessName} to ${plan} (${interval})?${hasStripeSubscription ? " Their card will be billed with proration." : " This grants access without billing."}`
            );
          }}
          className="btn-primary !min-h-0 !py-2.5 !px-4 text-sm"
        >
          {pending ? "Applying…" : "Apply"}
        </button>
      </div>
      <Feedback message={message} />
    </div>
  );
}

export function AccessUntilControl({
  businessId,
  businessName,
  hasStripeSubscription,
}: {
  businessId: string;
  businessName: string;
  hasStripeSubscription: boolean;
}) {
  const { pending, message, run } = useAdminAction();
  const [date, setDate] = useState("");

  return (
    <div className="card p-4">
      <p className="font-bold text-[14.5px] text-ink mb-1">Free access until…</p>
      <p className="text-[12.5px] font-medium text-muted mb-3">
        {hasStripeSubscription
          ? "Pauses billing until this date (subscription shows as trialing) — normal charges resume automatically afterward."
          : "Extends their trial access until this date."}
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="field !w-auto"
          disabled={pending}
        />
        <button
          disabled={pending || !date}
          onClick={() => {
            const fd = new FormData();
            fd.set("business_id", businessId);
            fd.set("access_until", date);
            run(adminSetAccessUntil, fd, `Give ${businessName} free access until ${date}? No charges until then.`);
          }}
          className="btn-primary !min-h-0 !py-2.5 !px-4 text-sm"
        >
          {pending ? "Applying…" : "Apply"}
        </button>
      </div>
      <Feedback message={message} />
    </div>
  );
}

export function LifetimeTierControl({
  businessId,
  businessName,
  currentTier,
  maxTier,
}: {
  businessId: string;
  businessName: string;
  currentTier: number;
  maxTier: number;
}) {
  const { pending, message, run } = useAdminAction();
  const [tier, setTier] = useState(String(currentTier));

  return (
    <div className="card p-4">
      <p className="font-bold text-[14.5px] text-ink mb-1">Lifetime (AppSumo) tier</p>
      <p className="text-[12.5px] font-medium text-muted mb-3">
        Tier 0 revokes lifetime access entirely (plan becomes expired).
      </p>
      <div className="flex flex-wrap gap-2">
        <select value={tier} onChange={(e) => setTier(e.target.value)} className="field !w-auto" disabled={pending}>
          {Array.from({ length: maxTier + 1 }, (_, i) => (
            <option key={i} value={i}>
              {i === 0 ? "0 — revoke" : `Tier ${i}`}
            </option>
          ))}
        </select>
        <button
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set("business_id", businessId);
            fd.set("tier", tier);
            run(adminSetLifetimeTier, fd, `Set ${businessName} to lifetime tier ${tier}?`);
          }}
          className="btn-primary !min-h-0 !py-2.5 !px-4 text-sm"
        >
          {pending ? "Applying…" : "Apply"}
        </button>
      </div>
      <Feedback message={message} />
    </div>
  );
}
