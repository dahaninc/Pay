"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

function LoginInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [phase, setPhase] = useState<"email" | "sent">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "link" ? "That sign-in link didn't work — request a fresh one." : null
  );

  const supabase = createBrowserSupabase();

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setPhase("sent");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
    setBusy(false);
    if (error) setError("That code didn't match — check the email and try again.");
    else router.push("/invoices");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 bg-bg">
      <Link href="/" className="mb-8">
        <Logo />
      </Link>
      <div className="card w-full max-w-sm p-7">
        {phase === "email" ? (
          <>
            <h1 className="text-xl font-bold">Log in or sign up</h1>
            <p className="text-ink-600 text-sm mt-1 mb-5">
              We&rsquo;ll email you a magic link — no password to remember.
            </p>
            <form onSubmit={sendLink} className="space-y-4">
              <div>
                <label className="label" htmlFor="email">
                  Work email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  className="field"
                  placeholder="dave@daveplumbing.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <button type="submit" disabled={busy || !email} className="btn-primary w-full">
                {busy ? "Sending…" : "Email me a link"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">Check your email 📬</h1>
            <p className="text-ink-600 text-sm mt-1 mb-5">
              We sent a sign-in link to <span className="font-semibold">{email}</span>. Tap it on
              this device — or paste the 6-digit code below.
            </p>
            <form onSubmit={verifyCode} className="space-y-4">
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                className="field text-center text-2xl tracking-[0.4em] font-mono"
                placeholder="••••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              />
              <button
                type="submit"
                disabled={busy || otp.length !== 6}
                className="btn-primary w-full"
              >
                {busy ? "Checking…" : "Sign in with code"}
              </button>
              <button
                type="button"
                className="w-full text-sm text-ink-600 underline"
                onClick={() => setPhase("email")}
              >
                Use a different email
              </button>
            </form>
          </>
        )}
        {error && <p className="mt-4 text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
