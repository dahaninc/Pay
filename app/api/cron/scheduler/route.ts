import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { processDueReminders } from "@/lib/scheduler";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createAdminSupabase();
  if (!db) {
    return NextResponse.json(
      { error: "SUPABASE_SECRET_KEY not configured — cron scheduling requires the service key" },
      { status: 503 }
    );
  }

  const outcomes = await processDueReminders(db, { limit: 200 });
  return NextResponse.json({
    processed: outcomes.length,
    sent: outcomes.filter((o) => o.action === "sent" || o.action === "simulated").length,
    outcomes,
  });
}
