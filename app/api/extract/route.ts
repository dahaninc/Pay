import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { extractInvoice, extractionAvailable } from "@/lib/extraction";
import { aiExtractionCapReached } from "@/lib/extractionCap";

export const maxDuration = 60;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
/** Each call costs a real Anthropic API charge — cap per business per hour to prevent cost abuse. */
const EXTRACT_RATE_LIMIT_PER_HOUR = 30;

/** Photo/PDF → structured invoice fields. Auth required; result always confirmed by the user. */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!extractionAvailable()) {
    return NextResponse.json(
      { error: "AI extraction isn't configured yet (ANTHROPIC_API_KEY). Add the invoice manually instead." },
      { status: 503 }
    );
  }

  const { data: membership } = await supabase
    .from("business_members")
    .select("business_id, business:businesses(plan)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const businessId = membership?.business_id;
  const plan = (membership?.business as { plan?: string } | null)?.plan;
  if (businessId) {
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("type", "extraction_used")
      .gte("created_at", hourAgo);
    if ((count ?? 0) >= EXTRACT_RATE_LIMIT_PER_HOUR) {
      return NextResponse.json(
        { error: "Too many scans this hour — try again shortly, or add the invoice manually." },
        { status: 429 }
      );
    }

    // Hidden monthly attempt cap (lib/extractionCap.ts) — soft fallback, not an error.
    // No numbers in the response: the client only learns "switch to CSV/manual", never
    // that a cap or counter exists. The scan page normally checks this server-side and
    // never calls here; this is defense for a stale tab.
    if (plan && (await aiExtractionCapReached(supabase, { id: businessId, plan }))) {
      return NextResponse.json({ capReached: true }, { status: 429 });
    }
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024)
    return NextResponse.json({ error: "file too large (max 15MB)" }, { status: 400 });

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  const isPdf = file.type === "application/pdf";
  const isImage = IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number]);
  if (!isPdf && !isImage)
    return NextResponse.json({ error: `unsupported file type: ${file.type}` }, { status: 400 });

  // Logged at ATTEMPT time, before the Claude call — a failed or retried extraction spent
  // real Anthropic money too, so it counts against both the hourly and monthly caps.
  if (businessId) {
    await supabase.from("events").insert({ business_id: businessId, type: "extraction_used" });
  }

  try {
    const extracted = isPdf
      ? await extractInvoice({ kind: "pdf", base64 })
      : await extractInvoice({
          kind: "image",
          mediaType: file.type as (typeof IMAGE_TYPES)[number],
          base64,
        });
    return NextResponse.json({ extracted });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "extraction failed" },
      { status: 500 }
    );
  }
}
