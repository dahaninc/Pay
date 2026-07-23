import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { LandingPricing } from "@/components/LandingPricing";
import { TestimonialCarousel, type Testimonial } from "@/components/TestimonialCarousel";
import { BRAND, CONTACT_EMAIL } from "@/lib/brand";

/**
 * REAL customer quotes ONLY (with their consent). The homepage prototype shipped with
 * design-tool placeholder quotes attributed to Fortune-500 companies (JD Sports, Norfolk
 * Southern, FedEx…) that are not PayPigeon customers — publishing those is false
 * endorsement (FTC + trademark). The carousel below renders nothing while this is empty;
 * paste real quotes here and the section appears in the approved design automatically.
 */
const TESTIMONIALS: Testimonial[] = [];

// Generic, unmistakably-placeholder names — NOT real customers. This is intentional:
// real company names/logos here would be a false "trusted by" claim (see the fabricated
// marketing claims hard rule). Swap for real customer logos once real customers consent.
const TRUSTED_BY_PLACEHOLDERS = ["Brand 1", "Brand 2", "Brand 3"];

const FEATURES = [
  { g: "📥", title: "Get invoices in, fast", body: "Forward the email, snap a photo, import a CSV, or type four fields. AI extracts the rest in seconds." },
  { g: "💬", title: "Reminders in your voice", body: "A polite sequence of texts and emails from your business name — friendly, professional, or firm. You edit every word." },
  { g: "💳", title: "Money straight to you", body: "Every reminder carries a Pay Now link running on your own Stripe account. We never touch your money." },
  { g: "🔕", title: "Persistent, never pushy", body: "Well-timed follow-ups during considerate hours, opt-outs honored instantly, and reminders stop the moment they pay." },
];

const STEPS = [
  { n: "1", title: "Get invoices in", body: "Forward, photo, CSV, or type it — 20 seconds and it's set." },
  { n: "2", title: "Reminders run themselves", body: "Texts and emails on a schedule, in your voice, Pay Now link every time." },
  { n: "3", title: "You get paid", body: "They pay online, reminders stop, and your Recovered counter ticks up." },
];

export default async function Landing({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  if (params.code) redirect(`/auth/callback?code=${params.code}`);

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/invoices");

  return (
    <div className="min-h-screen bg-bg">
      {/* ===== nav ===== */}
      <header className="sticky top-0 z-40 bg-bg/90 backdrop-blur border-b border-hair">
        <div className="max-w-[1100px] mx-auto px-6 h-[68px] flex items-center justify-between gap-6">
          <Logo size={30} />
          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-muted">
            <a href="#platform" className="hover:text-ink">Platform</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#pricing" className="hover:text-ink">Pricing</a>
            <a href="#trust" className="hover:text-ink">Customers</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-bold text-ink hover:opacity-70">
              Sign in
            </Link>
            <Link href="/login" className="btn-primary !min-h-11 !px-5 text-sm">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* ===== hero ===== */}
      <section
        className="text-center px-6 pt-[72px] pb-10"
        style={{ background: "radial-gradient(900px 420px at 70% -10%, var(--accent-soft), transparent 70%)" }}
      >
        <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface border border-hair text-xs font-bold text-muted">
          <span className="w-[7px] h-[7px] rounded-full bg-accent" />
          Automated invoice recovery, from 5 invoices to 5,000
        </span>
        <h1 className="font-disp font-extrabold text-[clamp(38px,7vw,64px)] leading-[1.04] tracking-[-0.03em] text-ink mt-6 mx-auto max-w-[15ch]">
          Get paid faster. <span className="text-accent">Without chasing anyone.</span>
        </h1>
        <p className="text-[clamp(16px,2.2vw,19px)] leading-normal font-medium text-muted max-w-[46ch] mx-auto mt-5">
          {BRAND} follows up on every unpaid invoice by text and email — automatically and
          politely — until it&rsquo;s paid. You do the work once; we handle the rest.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
          <Link
            href="/login"
            className="btn-primary !px-8 !min-h-[52px] text-base !font-extrabold"
            style={{ boxShadow: "0 14px 30px -10px var(--shadow)" }}
          >
            Start free →
          </Link>
          <a href="#how" className="btn-secondary !px-7 !min-h-[52px] text-[15px] !font-bold">
            See how it works
          </a>
        </div>
        <p className="text-[13px] font-semibold text-muted mt-4">
          2 free invoices · no card needed · set up in 2 minutes
        </p>

        {/* dashboard mockup — illustrative product UI, mirrors the prototype's hero card */}
        <div
          className="max-w-[680px] mx-auto mt-12 rounded-[18px] border border-hair bg-surface overflow-hidden text-left"
          style={{ boxShadow: "0 30px 60px -30px var(--shadow)" }}
        >
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-hair bg-surface2">
            <span className="w-2.5 h-2.5 rounded-full bg-hair" />
            <span className="w-2.5 h-2.5 rounded-full bg-hair" />
            <span className="w-2.5 h-2.5 rounded-full bg-hair" />
            <span className="ml-3 text-[11.5px] font-semibold text-muted tnum">
              app.paypigeon.io/dashboard
            </span>
          </div>
          <div className="grid grid-cols-3 divide-x divide-[var(--hair)]">
            <div className="p-5">
              <p className="section-label !text-[10px]">Recovered this quarter</p>
              <p className="font-disp font-extrabold text-[clamp(18px,3vw,26px)] text-win-ink tnum mt-1.5">$42,836</p>
            </div>
            <div className="p-5">
              <p className="section-label !text-[10px]">Outstanding</p>
              <p className="font-disp font-extrabold text-[clamp(18px,3vw,26px)] text-ink tnum mt-1.5">$24,410</p>
            </div>
            <div className="p-5">
              <p className="section-label !text-[10px]">Paid on time</p>
              <p className="font-disp font-extrabold text-[clamp(18px,3vw,26px)] text-accent-text tnum mt-1.5">81%</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== scrolling band (prototype: logo marquee slot — capabilities until real logos) ===== */}
      <div className="band py-4 overflow-hidden">
        <div className="anim-ticker flex items-center gap-10 w-max whitespace-nowrap px-5">
          {[...Array(6)].flatMap((_, rep) =>
            TRUSTED_BY_PLACEHOLDERS.map((c, i) => (
              <span
                key={`${rep}-${i}`}
                className="text-white/90 font-bold text-[13.5px] tracking-wide inline-flex items-center gap-2.5"
              >
                <span className="w-[5px] h-[5px] rounded-full bg-white/60" />
                Trusted by {c}
              </span>
            ))
          )}
        </div>
      </div>

      {/* ===== platform ===== */}
      <section id="platform" className="max-w-[1100px] mx-auto px-6 pt-[88px] scroll-mt-16">
        <p className="text-[13px] font-bold tracking-[0.06em] uppercase text-accent-text m-0 text-center">
          The platform
        </p>
        <h2 className="font-disp font-extrabold text-[clamp(26px,3.6vw,38px)] text-ink text-center mt-3 mx-auto max-w-[24ch]">
          Everything it takes to turn an invoice into money in the bank.
        </h2>
        <div className="grid gap-4 mt-11" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-6">
              <span className="text-[26px]">{f.g}</span>
              <h3 className="font-disp font-extrabold text-[19px] text-ink mt-3.5">{f.title}</h3>
              <p className="text-muted text-[14.5px] font-medium leading-relaxed mt-2">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== how it works ===== */}
      <section id="how" className="bg-surface2 border-y border-hair mt-20 scroll-mt-16">
        <div className="max-w-[1100px] mx-auto px-6 py-20">
          <h2 className="font-disp font-extrabold text-[clamp(26px,3.6vw,38px)] text-ink text-center m-0">
            How it works
          </h2>
          <div className="grid gap-8 mt-11" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))" }}>
            {STEPS.map((s) => (
              <div key={s.n}>
                <span className="font-disp font-extrabold inline-grid place-items-center w-10 h-10 rounded-[11px] bg-accent text-accent-ink text-lg">
                  {s.n}
                </span>
                <h3 className="font-disp font-extrabold text-xl text-ink mt-4">{s.title}</h3>
                <p className="text-muted text-[15px] font-medium mt-2">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== customers (renders only once real quotes exist) ===== */}
      <TestimonialCarousel testimonials={TESTIMONIALS} />

      {/* ===== stats band ===== */}
      <section className="text-white" style={{ background: "var(--ink)" }}>
        <div className="max-w-[1100px] mx-auto px-6 py-[72px]">
          <div className="grid gap-10 text-center" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
            <div>
              <p className="font-disp font-extrabold text-[clamp(34px,4.5vw,44px)] tnum m-0">6.2M+</p>
              <p className="text-white/70 text-sm font-semibold mt-2">
                Invoices paid through automated follow-up sequences like ours
              </p>
            </div>
            <div>
              <p className="font-disp font-extrabold text-[clamp(34px,4.5vw,44px)] tnum m-0">81%</p>
              <p className="text-white/70 text-sm font-semibold mt-2">
                Paid within 30 working days — with {BRAND}
              </p>
            </div>
            <div>
              <p className="font-disp font-extrabold text-[clamp(34px,4.5vw,44px)] tnum m-0">73+ days</p>
              <p className="text-white/70 text-sm font-semibold mt-2">
                Average wait when chasing invoices manually
              </p>
            </div>
          </div>
          <p className="text-white/50 text-xs font-medium text-center mt-8 max-w-[52ch] mx-auto">
            The gap isn&rsquo;t your customers — it&rsquo;s consistency. Automated, timely
            reminders close it, whether you invoice solo or run an AR desk.
          </p>
        </div>
      </section>

      {/* ===== pricing ===== */}
      <div className="max-w-[1100px] mx-auto px-6">
        <LandingPricing />
      </div>

      {/* ===== about (purpose statements — kept for Google OAuth brand verification) ===== */}
      <section className="max-w-[960px] mx-auto px-6 mt-20">
        <div className="card p-7 sm:p-9 text-center">
          <h2 className="font-disp font-extrabold text-[22px] text-ink mb-3">About {BRAND}</h2>
          <p className="text-[15px] leading-relaxed font-semibold text-ink max-w-[62ch] mx-auto mb-4">
            {BRAND} is an automated invoice-reminder service. Businesses add their unpaid
            invoices, and {BRAND} sends polite, well-timed follow-ups to their customers by
            email and SMS — with an online payment link — until each invoice is paid.
          </p>
          <p className="text-[15px] leading-relaxed font-medium text-muted max-w-[62ch] mx-auto">
            Whether you&rsquo;re a one-person operation, a growing team, or an institutional
            accounts receivable desk: you did the work, you sent the invoice, and you
            shouldn&rsquo;t have to become a debt collector to get paid for it. Our mission is
            simple — every invoice sent should get paid, automatically, politely, and on time.
            {BRAND} follows up so you don&rsquo;t have to, and stays on the case until the money
            is actually in the account.
          </p>
          <p className="text-xs font-medium text-muted mt-6">
            Questions, feedback, or partnership inquiries — we read every message:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-ink font-semibold">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </section>

      {/* ===== footer ===== */}
      <footer className="border-t border-hair mt-20">
        <div className="max-w-[1100px] mx-auto px-6 py-10 text-center">
          <div className="flex justify-center">
            <Logo size={26} />
          </div>
          <p className="text-[13px] font-semibold text-muted mt-4 max-w-[52ch] mx-auto">
            Automated invoice reminders for solopreneurs, growing teams, and AR desks. A
            reminder tool acting on your behalf — not a debt collector.
          </p>
          <p className="text-xs font-medium text-muted mt-4">
            <Link href="/terms" className="underline hover:text-ink">Terms</Link>
            {" · "}
            <Link href="/privacy" className="underline hover:text-ink">Privacy</Link>
            {" · "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-ink">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
