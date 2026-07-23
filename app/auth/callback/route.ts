import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  // preserves which pricing card was clicked (see app/login/page.tsx) so onboarding
  // enrolls the user in the plan they actually saw the price for; existing users just
  // bounce straight through onboarding to /invoices, so this is safe either way
  const plan = searchParams.get("plan");
  const interval = searchParams.get("interval");
  const onboardingQuery =
    plan || interval
      ? `?${new URLSearchParams({ ...(plan ? { plan } : {}), ...(interval ? { interval } : {}) }).toString()}`
      : "";

  const supabase = await createServerSupabase();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/onboarding${onboardingQuery}`);
    // shows up in Vercel function logs — the error param alone tells us nothing when
    // a user reports "sign-in didn't work"
    console.error("[auth/callback] code exchange failed:", error.message);
  }
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "magiclink" | "email",
    });
    if (!error) return NextResponse.redirect(`${origin}/onboarding${onboardingQuery}`);
    console.error("[auth/callback] otp verify failed:", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}
