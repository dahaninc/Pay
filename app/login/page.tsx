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

  // carries which pricing card was clicked through the email round-trip so onboarding
  // enrolls the user in the plan they actually saw the price for
  const plan = params.get("plan");
  const interval = params.get("interval");
  const onboardingQuery =
    plan || interval
      ? `?${new URLSearchParams({ ...(plan ? { plan } : {}), ...(interval ? { interval } : {}) }).toString()}`
      : "";

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback${onboardingQuery}` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setPhase("sent");
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    // same callback as the magic link — it already exchanges the code and carries the
    // plan/interval the user picked on the pricing page through to onboarding
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback${onboardingQuery}` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
    // on success the browser navigates away to Google — no state to reset
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
    setBusy(false);
    if (error) setError("That code didn't match — check the email and try again.");
    else router.push(`/onboarding${onboardingQuery}`);
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
              One tap with Google — or we&rsquo;ll email you a magic link. No password either way.
            </p>
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2.5 bg-surface border border-hair rounded-xl px-4 py-3 font-bold text-sm text-ink hover:bg-surface2 transition-colors min-h-12"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              Continue with Google
            </button>
            <div className="flex items-center gap-3 my-4">
              <span className="flex-1 h-px bg-hair" />
              <span className="text-[11.5px] font-semibold text-muted">or</span>
              <span className="flex-1 h-px bg-hair" />
            </div>
            <form onSubmit={sendLink} className="space-y-4">
              <div>
                <label className="label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
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
            <p className="text-[11.5px] font-medium text-muted text-center mt-4">
              By continuing you agree to our{" "}
              <a href="/terms" className="underline hover:text-ink" target="_blank">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="/privacy" className="underline hover:text-ink" target="_blank">
                Privacy Policy
              </a>
              .
            </p>
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
