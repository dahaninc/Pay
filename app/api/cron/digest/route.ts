import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getHeaderStats } from "@/lib/stats";
import { formatMoney } from "@/lib/money";
import { sendEmail } from "@/lib/senders";
import { appUrl } from "@/lib/scheduler";
import type { Business, InvoiceRow } from "@/lib/types";

export const maxDuration = 300;

/** Money Monday digest — the dashboard comes to the user's inbox. */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createAdminSupabase();
  if (!db) {
    return NextResponse.json({ error: "SUPABASE_SECRET_KEY not configured" }, { status: 503 });
  }

  const { data: businesses } = await db.from("businesses").select("*");
  let sent = 0;
  for (const biz of (businesses ?? []) as Business[]) {
    const stats = await getHeaderStats(db, biz.id, biz.currency);
    if (stats.outstandingCents === 0 && stats.recoveredCents === 0) continue;

    const { data: owner } = await db.auth.admin.getUserById(biz.owner_id);
    const to = owner?.user?.email || biz.reply_to_email;
    if (!to) continue;

    const { data: lateRows } = await db
      .from("invoices_view")
      .select("*, customer:customers(name)")
      .eq("business_id", biz.id)
      .eq("display_status", "late")
      .order("amount_cents", { ascending: false })
      .limit(5);

    const lateList = ((lateRows ?? []) as (InvoiceRow & { customer: { name: string } })[])
      .map(
        (r) =>
          `<tr><td style="padding:6px 12px 6px 0;">${r.customer?.name ?? "—"}</td><td style="padding:6px 12px 6px 0;font-variant-numeric:tabular-nums;font-weight:600;">${formatMoney(r.amount_cents, r.currency)}</td><td style="padding:6px 0;color:#b42318;">${r.days_overdue}d overdue</td></tr>`
      )
      .join("");

    const html = `<!doctype html><html><body style="margin:0;background:#f6f7f9;padding:24px 0;">
<div style="max-width:560px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1d21;">
  <div style="background:#fff;border:1px solid #e5e8eb;border-radius:12px;padding:28px;">
    <p style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;margin:0 0 6px;">Money Monday · ${biz.name}</p>
    ${
      stats.recoveredCents > 0
        ? `<h1 style="font-size:24px;margin:0 0 4px;">PayPigeon has recovered ${formatMoney(stats.recoveredCents, biz.currency)} for you 🎉</h1>`
        : `<h1 style="font-size:24px;margin:0 0 4px;">Your week in money</h1>`
    }
    <table style="width:100%;margin:18px 0;border-collapse:collapse;">
      <tr>
        <td style="padding:10px 12px;background:#f8fafc;border-radius:8px;"><div style="font-size:12px;color:#6b7280;">You're owed</div><div style="font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;">${formatMoney(stats.outstandingCents, biz.currency)}</div></td>
        <td style="width:10px;"></td>
        <td style="padding:10px 12px;background:#fef3f2;border-radius:8px;"><div style="font-size:12px;color:#b42318;">Overdue</div><div style="font-size:20px;font-weight:700;color:#b42318;font-variant-numeric:tabular-nums;">${formatMoney(stats.overdueCents, biz.currency)}</div></td>
      </tr>
    </table>
    ${lateList ? `<p style="font-weight:600;margin:16px 0 4px;">Biggest overdue invoices</p><table style="border-collapse:collapse;font-size:14px;">${lateList}</table>` : `<p>No overdue invoices right now. Nice one.</p>`}
    <p style="margin-top:22px;"><a href="${appUrl()}/dashboard" style="display:inline-block;background:#1f7a4d;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Open your dashboard</a></p>
  </div>
  <p style="text-align:center;color:#9aa1a9;font-size:12px;margin-top:14px;">PayPigeon — send the invoice, we'll chase it.</p>
</div></body></html>`;

    const result = await sendEmail({
      to,
      subject: `Money Monday: ${formatMoney(stats.outstandingCents, biz.currency)} outstanding${stats.overdueCents ? `, ${formatMoney(stats.overdueCents, biz.currency)} overdue` : ""}`,
      html,
    });
    if (result.status === "sent") sent++;
  }

  return NextResponse.json({ businesses: businesses?.length ?? 0, sent });
}
