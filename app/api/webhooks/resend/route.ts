import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

/** Resend delivery events → message status for the invoice timeline (delivered/opened/clicked). */
export async function POST(request: NextRequest) {
  const db = createAdminSupabase();
  if (!db) return NextResponse.json({ error: "service key not configured" }, { status: 503 });

  const payload = await request.json().catch(() => null);
  const type: string | undefined = payload?.type;
  const emailId: string | undefined = payload?.data?.email_id;
  if (!type || !emailId) return NextResponse.json({ ok: true });

  const statusMap: Record<string, string> = {
    "email.delivered": "delivered",
    "email.opened": "opened",
    "email.clicked": "clicked",
    "email.bounced": "failed",
  };
  const newStatus = statusMap[type];
  if (!newStatus) return NextResponse.json({ ok: true });

  // never downgrade: clicked > opened > delivered > sent
  const rank: Record<string, number> = { sent: 0, delivered: 1, opened: 2, clicked: 3, failed: 4 };
  const { data: msg } = await db
    .from("messages")
    .select("id, status")
    .eq("provider_id", emailId)
    .maybeSingle();
  if (msg && (rank[newStatus] ?? 0) > (rank[msg.status] ?? 0)) {
    await db.from("messages").update({ status: newStatus }).eq("id", msg.id);
  }

  return NextResponse.json({ ok: true });
}
