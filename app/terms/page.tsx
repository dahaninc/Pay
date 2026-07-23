import Link from "next/link";
import { BRAND, BRAND_URL, CONTACT_EMAIL } from "@/lib/brand";

export const metadata = { title: `Terms of Service — ${BRAND}` };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-app">
      <div className="max-w-[68ch] mx-auto px-5 py-12">
        <Link href="/" className="text-xs font-semibold text-muted hover:text-ink">
          ← Back to {BRAND}
        </Link>
        <h1 className="font-disp font-extrabold text-2xl text-ink mt-6 mb-1">Terms of Service</h1>
        <p className="text-xs font-medium text-muted mb-8">Revised July 2026</p>

        <div className="space-y-6 text-[14.5px] leading-relaxed text-ink">
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern access to and use of {BRAND}, a
            software service that sends automated invoice reminders on behalf of a business to
            that business&rsquo;s own customers (the &ldquo;Service&rdquo;), operated at{" "}
            {BRAND_URL}. By creating an account you agree to these Terms.
          </p>

          <section>
            <h2 className="font-bold text-[15.5px] mb-1.5">1. What the Service does</h2>
            <p>
              {BRAND} lets a business (&ldquo;you,&rdquo; &ldquo;Customer&rdquo;) upload or forward
              invoices, and automatically sends email and/or SMS reminders to the Customer&rsquo;s
              own end customers (&ldquo;Recipients&rdquo;) on a schedule you configure. {BRAND} is a
              messaging and scheduling tool acting on your instructions — it is not a collection
              agency, does not take assignment of debts, and does not make collection decisions on
              your behalf.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[15.5px] mb-1.5">2. Your account and responsibilities</h2>
            <p>You are responsible for:</p>
            <ul className="list-disc pl-5 space-y-1 mt-1.5">
              <li>The accuracy of invoice, customer, and contact data you upload, import, or forward.</li>
              <li>
                Having a lawful basis and, where required by law, consent to contact each Recipient
                by email or SMS, and for complying with applicable consumer-protection, debt-collection,
                and telemarketing/messaging laws (e.g. TCPA, CAN-SPAM, CASL, and equivalents) for your
                own business and jurisdiction.
              </li>
              <li>Keeping your login credentials confidential and your billing information current.</li>
              <li>
                Content of custom message templates you write or edit — {BRAND} does not review
                template content before it is sent.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-[15.5px] mb-1.5">3. Acceptable use</h2>
            <p>You may not use the Service to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-1.5">
              <li>Send messages to anyone who has not done business with you or who has opted out.</li>
              <li>Send unlawful, harassing, threatening, or deceptive communications.</li>
              <li>
                Attempt to collect amounts you know are not owed, or misrepresent your identity or
                the nature of the amount owed.
              </li>
              <li>Interfere with or attempt to circumvent the Service&rsquo;s security, rate limits, or opt-out mechanisms.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-[15.5px] mb-1.5">4. Payments processed through the Service</h2>
            <p>
              Where enabled, {BRAND} lets Recipients pay an invoice online via Stripe. Payments are
              processed directly by Stripe, Inc. and (where applicable) routed to your own connected
              Stripe account under Stripe&rsquo;s own terms — {BRAND} does not hold or take custody of
              Recipient funds.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[15.5px] mb-1.5">5. Subscriptions, trial, and billing</h2>
            <p>
              Paid plans are billed in advance on a monthly or yearly basis through Stripe. A card is
              required to start a trial; unless cancelled before the trial ends, your card will be
              charged automatically at the end of the trial period and each renewal thereafter. You
              can cancel at any time from Settings — cancellation takes effect at the end of the
              current billing period and stops future charges; it does not retroactively refund the
              current period unless otherwise required by law.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[15.5px] mb-1.5">6. Service availability and changes</h2>
            <p>
              The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. We
              may modify, suspend, or discontinue features of the Service, and may suspend or
              terminate accounts that violate these Terms or applicable law.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[15.5px] mb-1.5">7. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, {BRAND} and its operators are not liable for
              indirect, incidental, or consequential damages, or for amounts you fail to collect from
              Recipients. Our aggregate liability for any claim relating to the Service is limited to
              the amount you paid us in the three months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[15.5px] mb-1.5">8. Changes to these Terms</h2>
            <p>
              We may update these Terms from time to time. Continued use of the Service after an
              update constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[15.5px] mb-1.5">9. Contact</h2>
            <p>
              Questions about these Terms:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-ink">
                {CONTACT_EMAIL}
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
