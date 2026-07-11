export function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}

export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const value = parseFloat(cleaned);
  if (isNaN(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + (dateStr.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }
  );
}

export const CURRENCY_FOR_COUNTRY: Record<string, string> = {
  US: "USD",
  UK: "GBP",
  CA: "CAD",
  AU: "AUD",
};

export const TIMEZONE_FOR_COUNTRY: Record<string, string> = {
  US: "America/New_York",
  UK: "Europe/London",
  CA: "America/Toronto",
  AU: "Australia/Sydney",
};

/** Currencies selectable in the app (dropdowns in onboarding + settings). */
export const CURRENCIES: { code: string; label: string; symbol: string }[] = [
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "AED", label: "UAE Dirham", symbol: "د.إ" },
  { code: "CAD", label: "Canadian Dollar", symbol: "$" },
  { code: "AUD", label: "Australian Dollar", symbol: "$" },
  { code: "NZD", label: "New Zealand Dollar", symbol: "$" },
  { code: "CHF", label: "Swiss Franc", symbol: "CHF" },
  { code: "SEK", label: "Swedish Krona", symbol: "kr" },
  { code: "NOK", label: "Norwegian Krone", symbol: "kr" },
  { code: "DKK", label: "Danish Krone", symbol: "kr" },
  { code: "ZAR", label: "South African Rand", symbol: "R" },
  { code: "SAR", label: "Saudi Riyal", symbol: "﷼" },
  { code: "QAR", label: "Qatari Riyal", symbol: "﷼" },
  { code: "INR", label: "Indian Rupee", symbol: "₹" },
  { code: "SGD", label: "Singapore Dollar", symbol: "$" },
];

export function isSupportedCurrency(code: string): boolean {
  return CURRENCIES.some((c) => c.code === code);
}

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}
