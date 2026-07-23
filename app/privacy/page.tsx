import Link from "next/link";
import { BRAND, BRAND_URL, CONTACT_EMAIL } from "@/lib/brand";

export const metadata = { title: `Privacy Policy — ${BRAND}` };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-app">
      <div className="max-w-[68ch] mx-auto px-5 py-12">
        <Link href="/" className="text-xs font-semibold text-muted hover:text-ink">
          ← Back to {BRAND}
        </Link>
        <h1 className="font-disp font-extrabold text-2xl text-ink mt-6 mb-1">Privacy Policy</h1>
        <p className="text-xs font-medium text-muted mb-8">Revised July 2026</p>

        <div className="space-y-6 text-[14.5px] leading-relaxed text-ink">
          <p>
            This Privacy Policy explains what data {BRAND} (operated at {BRAND_URL}) collects,
            why, and how it&rsquo;s handled — both for businesses that use {BRAND} (&ldquo;Customers&rdquo;)
            and for the end customers those businesses invoice (&ldquo;Recipients&rdquo;).
          </p>

          <section>
            <h2 className="font-bold text-[15.5px] mb-1.5">1. Data we collect</h2>
            <p className="font-semibold mt-2">From Customers (business accounts):</p>
            <ul className="list-disc pl-5 space-y-1 mt-1.5">
              <li>Account info: name, email, business name, phone, country, timezone.</li>
              <li>Billing info: handled directly by Stripe — we store a Stripe customer/subscription ID, not card numbers.</li>
              <li>Content you upload or forward: invoices, customer lists, message template edits.</li>
              <li>Usage data: login events, feature usage, and support communications.</li>
            </ul>
            <p className="font-semibold mt-3">From Recipients (a Customer&rsquo;s own customers):</p>
            <ul className="list-disc pl-5 space-y-1 mt-1.5">
              <li>Contact details a Customer provides about them: name, email, phone.</li>
              <li>Invoice and payment details relevant to reminders sent to them.</li>
              <li>Delivery and engagement metadata for messages (sent/delivered/opened/replied), and any reply content they send back.</li>
            </ul>
            <p className="mt-2">
              Recipient data is provided to us by our Customers, who are responsible for having a
              lawful basis to share and contact that data — see our{" "}
              <Link href="/terms" className="underline hover:text-ink">Terms of Service</Link>.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[15.5px] mb-1.5">2. How we use data</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To operate the Service: scheduling and sending reminders, processing payments, and rendering the dashboard.</li>
              <li>To detect and prevent abuse, fraud, and violations of our Terms.</li>
              <li>To communicate with Customers about their account, billing, and support requests.</li>
              <li>To improve the Service (aggregated/anonymized usage analysis only — never sold).</li>
            </ul>
            <p className="mt-2">We do not sell personal data, and we do not use Recipient data for advertising.</p>
          </section>

          <section>
            <h2 className="font-bold text-[15.5px] mb-1.5">3. Sub-processors we use</h2>
            <p>Data is shared with the following processors, solely to operate the Service:</p>
            <ul className="list-disc pl-5 space-y-1 mt-1.5">
              <li><strong>Supabase</strong> — database, authentication.</li>
              <li><strong>Stripe</strong> — subscription billing and, where enabled, invoice payment processing.</li>
              <li><strong>Telnyx</strong> — SMS delivery.</li>
              <li><strong>Resend</strong> — transactional and reminder email delivery.</li>
              <li><strong>Anthropic (Claude API)</strong> — extracting invoice fields from forwarded emails, photos, or PDFs a Customer submits.</li>
              <li><strong>Vercel</strong> — application hosting.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-[15.5px] mb-1.5">4. SMS &amp; email consent</h2>
            <p>
              Reminder SMS include opt-out instructions, and opt-out requests are honored
              immediately and permanently for that phone number. Reminder emails include a
              functional reply channel; Recipients may also contact the Customer directly to
              request their data not be used for reminders.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[15.5px] mb-1.5">5. Data retention</h2>
            <p>
              We retain account and invoice data for as long as an account is active, and for a
              limited period after closure as needed for legal, tax, and dispute-resolution
              purposes. Customers can request deletion of their business data by contacting us.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[15.5px] mb-1.5">6. Your rights</h2>
            <p>
              Depending on your jurisdiction, you may have rights to access, correct, export, or
              delete personal data we hold about you, or to object to certain processing. To
              exercise these rights, contact us at the address below — Recipients should also
              feel free to contact the business that invoiced them directly.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[15.5px] mb-1.5">7. Security</h2>
            <p>
              Data is encrypted in transit (TLS) and at rest. Access to business data is enforced
              by row-level security scoped to each business&rsquo;s own members. Inbound webhooks are
              signature-verified.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-[15.5px] mb-1.5">8. Changes to this policy</h2>
            <p>We may update this policy from time to time; material changes will be reflected by updating the date above.</p>
          </section>

          <section>
            <h2 className="font-bold text-[15.5px] mb-1.5">9. Contact</h2>
            <p>
              Privacy questions or data requests:{" "}
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
