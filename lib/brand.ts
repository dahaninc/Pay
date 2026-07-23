/** Product brand — single place to change the name. */
export const BRAND = "PayPigeon";
export const BRAND_TLD = "paypigeon.io";
export const BRAND_URL = "https://www.paypigeon.io";
/** Hosted logo mark (transparent PNG) — used in emails, which can't reference local assets. */
export const LOGO_MARK_URL = `https://${BRAND_TLD}/logo-mark.png`;

/**
 * Branded header row for HTML emails: icon + wordmark. Emails render in isolated clients
 * that can't use next/image or the Logo component, so this is a standalone HTML snippet —
 * keep it in sync with components/Logo.tsx's lockup if the brand mark changes.
 */
export function emailBrandHeaderHtml(size = 28): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle;"><img src="${LOGO_MARK_URL}" width="${size}" height="${size}" alt="${BRAND}" style="display:block;border:0;"></td>
    <td style="padding-left:9px;font-size:17px;font-weight:800;color:#211b13;letter-spacing:-0.02em;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;vertical-align:middle;">${BRAND}</td>
  </tr></table>`;
}

/** Support/contact address — shown to users (landing footer, etc). */
export const CONTACT_EMAIL = "info@paypigeon.io";

/** Reminder emails are sent from this address (distinct from the contact address). */
export const SENDER_EMAIL = "reminder@paypigeon.io";

/**
 * Per-invoice Reply-To address. Routes customer replies to the inbound webhook
 * (matched by the "reply+<invoiceId>" local part) instead of the owner's personal
 * inbox, so replies show up on the invoice timeline. See app/api/inbound/route.ts.
 * Lives on a subdomain (not BRAND_TLD) so its receiving MX doesn't touch the root
 * domain's existing Spacemail mailboxes (e.g. info@paypigeon.io).
 */
export function replyToFor(invoiceId: string): string {
  return `reply+${invoiceId}@reply.${BRAND_TLD}`;
}
