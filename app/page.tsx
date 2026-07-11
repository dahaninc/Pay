import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { PLANS } from "@/lib/plans";
import { Logo } from "@/components/Logo";
import { CheckIcon } from "@/components/icons";
import { BRAND } from "@/lib/brand";

const HOW_STEPS = [
  {
    n: "1",
    title: "Get invoices in",
    body: "Forward the email, snap a photo, import a CSV, or type 4 fields. 20 seconds.",
  },
  {
    n: "2",
    title: "Reminders run themselves",
    body: "A polite sequence of texts and emails, in your voice, with a Pay Now link every time.",
  },
  {
    n: "3",
    title: "You get paid",
    body: "They pay online, reminders stop instantly, and your Recovered counter ticks up.",
  },
];

const DIFFS = [
  ["Sounds like you, not a bank", "Friendly, professional or firm — you pick. Every message reads like a helpful office manager."],
  ["Your customers never see us", "Texts come from your business name. Replies go to your phone. Relationships stay intact."],
  ["Built-in guardrails", "Only 9am–8pm local, never Sundays. STOP halts texts instantly. Compliance handled per market."],
  ["Money straight to you", "Pay Now links run on your own Stripe account. We never touch your money."],
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
      <div className="max-w-[960px] mx-auto px-5">
        {/* nav */}
        <header className="flex items-center justify-between pt-5 pb-1.5">
          <Logo size={32} />
          <Link href="/login" className="btn-secondary !min-h-10 !px-4 text-[13px]">
            Log in
          </Link>
        </header>

        {/* hero */}
        <section className="text-center pt-9 pb-2.5">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface border border-hair text-xs font-bold text-muted">
            <span
              className="w-[7px] h-[7px] rounded-full bg-win"
              style={{ boxShadow: "0 0 0 3px var(--win-soft)" }}
            />
            Chasing late invoices for trades businesses right now
          </span>
          <h1 className="font-disp font-extrabold text-[clamp(38px,8.5vw,72px)] leading-[1.02] tracking-[-0.03em] text-ink mt-5 mx-auto max-w-[12ch]">
            Send the invoice. <span className="text-accent">We&rsquo;ll chase it.</span>
          </h1>
          <p className="text-[clamp(16px,2.2vw,19px)] leading-normal font-medium text-muted max-w-[34ch] mx-auto mt-[18px]">
            {BRAND} follows up your unpaid invoices by text and email — politely, automatically —
            until they&rsquo;re paid. You stay on the tools.
          </p>
          <div className="flex flex-col items-center gap-2.5 mt-[26px]">
            <Link
              href="/login"
              className="btn-primary !px-8 !min-h-14 text-[17px] !font-extrabold !rounded-[15px]"
              style={{ boxShadow: "0 14px 30px -10px var(--shadow)" }}
            >
              Start free — no card needed
            </Link>
            <span className="text-[13px] font-semibold text-muted">
              14-day trial · set up in 5 minutes
            </span>
          </div>
        </section>

        {/* social-proof notification card */}
        <div
          className="max-w-[380px] mx-auto mt-8 card p-4"
          style={{ borderRadius: 22, boxShadow: "0 20px 40px -22px var(--shadow)" }}
        >
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-[13px] bg-win-soft text-win-ink flex items-center justify-center shrink-0">
              <CheckIcon size={24} strokeWidth={2.4} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-bold text-[15px] text-ink">Sarah Miller paid $840</span>
              <span className="block text-[12.5px] font-semibold text-muted mt-0.5">
                Invoice #142 · via Pay Now link · just now
              </span>
            </span>
          </div>
          <div className="h-px bg-hair my-3.5" />
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-muted">Recovered this quarter</span>
            <span className="font-disp font-extrabold text-xl text-ink tnum">$11,480</span>
          </div>
        </div>

        {/* stat banner */}
        <div className="bg-surface2 border border-hair rounded-[20px] p-[22px] text-center mt-9">
          <p className="font-disp font-extrabold text-[clamp(20px,3vw,26px)] text-ink">
            Tradespeople wait 30–60 days to get paid.
          </p>
          <p className="text-[15px] font-medium text-muted mt-1.5">
            Not because customers refuse — because nobody reminds them. {BRAND} does.
          </p>
        </div>

        {/* how it works */}
        <section className="mt-11">
          <h2 className="font-disp font-extrabold text-[22px] text-ink text-center mb-5">
            How it works
          </h2>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))" }}>
            {HOW_STEPS.map((f) => (
              <div key={f.n} className="card p-5">
                <span className="w-[34px] h-[34px] rounded-[10px] bg-accent text-accent-ink font-disp font-extrabold text-base flex items-center justify-center mb-[13px]">
                  {f.n}
                </span>
                <p className="font-bold text-base text-ink">{f.title}</p>
                <p className="text-sm leading-normal font-medium text-muted mt-1.5">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* differentiators */}
        <section
          className="mt-10 grid gap-x-7 gap-y-[18px]"
          style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}
        >
          {DIFFS.map(([title, body]) => (
            <div key={title}>
              <span className="inline-flex w-[26px] h-[26px] rounded-lg bg-accent-soft text-accent-ink items-center justify-center mb-2">
                <CheckIcon size={15} strokeWidth={3} />
              </span>
              <p className="font-bold text-base text-ink">{title}</p>
              <p className="text-sm leading-normal font-medium text-muted mt-[5px]">{body}</p>
            </div>
          ))}
        </section>

        {/* pricing */}
        <section className="mt-12">
          <h2 className="font-disp font-extrabold text-[22px] text-ink text-center">
            Simple pricing
          </h2>
          <p className="text-sm font-medium text-muted text-center mt-1.5">
            Every plan starts with 14 days free. No card up front.
          </p>
          <div
            className="grid gap-4 mt-[22px]"
            style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}
          >
            {(
              [
                ["solo", "For one-person outfits", false],
                ["crew", "For small crews", true],
                ["pro", "For established firms", false],
              ] as const
            ).map(([key, blurb, popular]) => {
              const plan = PLANS[key];
              const features = [
                plan.invoicesPerMonth === Infinity
                  ? "Unlimited invoices"
                  : `${plan.invoicesPerMonth} active invoices / mo`,
                `${plan.sms} SMS included`,
                `${plan.users} ${plan.users === 1 ? "user" : "users"}${key === "pro" ? " · priority support + API" : ""}`,
              ];
              return (
                <div
                  key={key}
                  className="bg-surface rounded-[18px] p-5 flex flex-col"
                  style={{ border: popular ? "2px solid var(--accent)" : "1px solid var(--hair)" }}
                >
                  {popular && (
                    <span className="self-start px-2.5 py-1 rounded-full bg-accent text-accent-ink text-[11px] font-extrabold mb-2.5">
                      Most popular
                    </span>
                  )}
                  <p className="font-bold text-[17px] text-ink">{plan.name}</p>
                  <p className="text-[13px] font-medium text-muted">{blurb}</p>
                  <p className="mt-3.5 mb-1">
                    <span className="font-disp font-extrabold text-[38px] text-ink tnum">
                      ${plan.price}
                    </span>
                    <span className="text-muted font-semibold">/mo</span>
                  </p>
                  <div className="flex flex-col gap-2 my-3.5 mb-[18px]">
                    {features.map((f) => (
                      <span key={f} className="flex items-center gap-2 text-[13.5px] font-medium text-muted">
                        <span className="text-win">
                          <CheckIcon size={15} strokeWidth={3} />
                        </span>
                        {f}
                      </span>
                    ))}
                  </div>
                  <Link href="/login" className={`${popular ? "btn-primary" : "btn-secondary !bg-surface2"} mt-auto text-sm`}>
                    Start free trial
                  </Link>
                </div>
              );
            })}
          </div>
        </section>

        <footer className="border-t border-hair mt-11 py-6 pb-8 text-center">
          <p className="text-[13px] font-semibold text-muted">
            {BRAND} — automated invoice reminders for trades businesses.
          </p>
          <p className="text-xs font-medium text-muted opacity-80 mt-1">
            A reminder tool acting on your behalf, not a debt collector.
          </p>
        </footer>
      </div>
    </div>
  );
}
