import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function GET() {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });

  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data } = await admin.from("costs").select("*").order("month", { ascending: false });
  return NextResponse.json({ costs: data ?? [] });
}

export async function POST(request: NextRequest) {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });

  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const body = await request.json().catch(() => null);
  const month = body?.month;
  const category = String(body?.category || "").trim();
  const amountCents = Math.round(Number(body?.amount_cents));
  const note = body?.note ? String(body.note) : null;

  if (!month || !/^\d{4}-\d{2}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }
  if (!category) return NextResponse.json({ error: "Category is required" }, { status: 400 });
  if (!Number.isFinite(amountCents) || amountCents < 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const { error } = await admin.from("costs").insert({ month, category, amount_cents: amountCents, note });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
