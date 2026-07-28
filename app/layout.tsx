import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: `${BRAND} — Send the invoice. We'll chase it.`,
  description:
    "Automated invoice reminders for solopreneurs, growing teams, and institutional accounts receivable. SMS + email follow-ups with a Pay Now link, until you're paid.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang="en" data-theme={theme}>
      <body className={`${bricolage.variable} ${hanken.variable} antialiased`}>{children}</body>
    </html>
  );
}
