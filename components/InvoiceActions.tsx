"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  markPaid,
  pauseReminders,
  resumeReminders,
  remindNow,
  armReminders,
} from "@/app/actions/invoices";
import { CheckIcon } from "@/components/icons";

const CONFETTI = [
  { left: "8%", w: 9, h: 14, color: "var(--accent)", dur: 2.4, delay: 0, round: false },
  { left: "18%", w: 8, h: 8, color: "var(--win)", dur: 2.7, delay: 0.3, round: true },
  { left: "28%", w: 10, h: 10, color: "var(--danger)", dur: 2.2, delay: 0.15, round: false },
  { left: "38%", w: 8, h: 15, color: "var(--accent)", dur: 2.9, delay: 0.5, round: false },
  { left: "47%", w: 9, h: 9, color: "var(--win)", dur: 2.5, delay: 0.1, round: true },
  { left: "56%", w: 10, h: 14, color: "var(--amber-ink)", dur: 2.6, delay: 0.4, round: false },
  { left: "65%", w: 8, h: 8, color: "var(--accent)", dur: 2.3, delay: 0.25, round: true },
  { left: "74%", w: 9, h: 14, color: "var(--win)", dur: 2.8, delay: 0.05, round: false },
  { left: "83%", w: 10, h: 10, color: "var(--danger)", dur: 2.5, delay: 0.35, round: false },
  { left: "92%", w: 8, h: 13, color: "var(--accent)", dur: 2.6, delay: 0.2, round: false },
  { left: "13%", w: 8, h: 8, color: "var(--amber-ink)", dur: 3.0, delay: 0.6, round: true },
  { left: "61%", w: 9, h: 9, color: "var(--win)", dur: 2.4, delay: 0.55, round: true },
];

export function InvoiceActions({
  invoiceId,
  status,
  sequenceState,
  payLink,
  amountStr,
  customerName,
  ownerFirstName,
}: {
  invoiceId: string;
  status: string;
  sequenceState: string | null;
  payLink: string;
  amountStr: string;
  customerName: string;
  ownerFirstName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [confirmPaid, setConfirmPaid] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  function showToast(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 2600);
  }

  function run(fn: () => Promise<{ error?: string; ok?: boolean; simulated?: boolean }>, okText: string) {
    startTransition(async () => {
      const result = await fn();
      if (result?.error) showToast(result.error);
      else
        showToast(
          result && "simulated" in result && result.simulated
            ? `${okText} (simulated — no send keys yet)`
            : okText
        );
    });
  }

  function doMarkPaid() {
    setConfirmPaid(false);
    startTransition(async () => {
      const result = await markPaid(invoiceId);
      if (result?.error) showToast(result.error);
      else setCelebrate(true);
    });
  }

  const isOpen = status === "outstanding" || status === "paused";

  return (
    <div>
      {isOpen && (
        <div className="grid grid-cols-2 gap-2.5 mt-4">
          {!confirmPaid ? (
            <button
              disabled={pending}
              onClick={() => setConfirmPaid(true)}
              className="btn-primary col-span-2 !font-extrabold"
            >
              Mark as paid
            </button>
          ) : (
            <button
              disabled={pending}
              onClick={doMarkPaid}
              className="btn-primary col-span-2 !font-extrabold"
            >
              {pending ? "Saving…" : `Confirm — ${customerName} paid ${amountStr} ✓`}
            </button>
          )}
          <button
            disabled={pending}
            onClick={() => run(() => remindNow(invoiceId), `Reminder sent to ${customerName}`)}
            className="btn-secondary text-sm"
          >
            Remind now
          </button>
          {status === "outstanding" && sequenceState === "armed" ? (
            <button
              disabled={pending}
              onClick={() => run(() => pauseReminders(invoiceId), "Reminders paused")}
              className="btn-secondary text-sm"
            >
              Pause reminders
            </button>
          ) : status === "paused" ? (
            <button
              disabled={pending}
              onClick={() => run(() => resumeReminders(invoiceId), "Reminders resumed")}
              className="btn-secondary text-sm"
            >
              Resume reminders
            </button>
          ) : (
            <button
              disabled={pending}
              onClick={() => run(() => armReminders(invoiceId), "Reminders armed ✓")}
              className="btn-secondary text-sm"
            >
              Arm reminders
            </button>
          )}
          <Link href={`/invoices/${invoiceId}/edit`} className="btn-secondary text-sm">
            Edit
          </Link>
          <button
            onClick={() => {
              navigator.clipboard.writeText(payLink);
              showToast("Pay link copied");
            }}
            className="btn-secondary text-sm"
          >
            Copy pay link
          </button>
        </div>
      )}
      {!isOpen && (
        <div className="grid grid-cols-1 gap-2.5 mt-4">
          <button
            onClick={() => {
              navigator.clipboard.writeText(payLink);
              showToast("Pay link copied");
            }}
            className="btn-secondary text-sm"
          >
            Copy pay link
          </button>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div
          className="fixed left-1/2 bottom-[108px] sm:bottom-10 z-80 px-5 py-3 rounded-full text-[13px] font-bold max-w-[88vw] text-center"
          style={{
            background: "var(--ink)",
            color: "var(--bg)",
            boxShadow: "0 14px 34px -8px rgba(0,0,0,.5)",
            animation: "ppToast .26s ease",
            transform: "translateX(-50%)",
          }}
        >
          {toast}
        </div>
      )}

      {/* celebration */}
      {celebrate && (
        <div
          className="fixed inset-0 z-90 flex items-center justify-center p-6"
          style={{ background: "rgba(8,7,5,.55)", backdropFilter: "blur(3px)" }}
        >
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {CONFETTI.map((c, i) => (
              <span
                key={i}
                className="absolute"
                style={{
                  top: -20,
                  left: c.left,
                  width: c.w,
                  height: c.h,
                  background: c.color,
                  borderRadius: c.round ? "50%" : 2,
                  animation: `ppFall ${c.dur}s linear ${c.delay}s infinite`,
                }}
              />
            ))}
          </div>
          <div
            className="relative card max-w-[340px] w-full text-center p-8"
            style={{
              borderRadius: 26,
              boxShadow: "0 34px 70px -22px rgba(0,0,0,.6)",
              animation: "ppPop .42s cubic-bezier(.2,.9,.3,1.25)",
            }}
          >
            <div className="w-16 h-16 rounded-full bg-win-soft text-win-ink flex items-center justify-center mx-auto mb-4">
              <CheckIcon size={34} />
            </div>
            <p className="text-xs font-extrabold tracking-[0.09em] uppercase text-win-ink">
              You got paid
            </p>
            <p className="font-disp font-extrabold text-[34px] text-ink tnum mt-2">{amountStr}</p>
            <p className="text-[15px] font-bold text-muted">from {customerName}</p>
            <p className="text-[13px] text-muted mt-3 leading-relaxed">
              Reminders stopped automatically. Nice one{ownerFirstName ? `, ${ownerFirstName}` : ""}.
            </p>
            <button
              onClick={() => {
                setCelebrate(false);
                router.refresh();
              }}
              className="btn-primary w-full mt-5 !font-extrabold"
            >
              Brilliant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
