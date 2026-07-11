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
