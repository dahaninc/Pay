import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { extractInvoice, extractionAvailable } from "@/lib/extraction";

export const maxDuration = 60;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

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

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024)
    return NextResponse.json({ error: "file too large (max 15MB)" }, { status: 400 });

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  try {
    const extracted =
      file.type === "application/pdf"
        ? await extractInvoice({ kind: "pdf", base64 })
        : IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])
          ? await extractInvoice({
              kind: "image",
              mediaType: file.type as (typeof IMAGE_TYPES)[number],
              base64,
            })
          : null;
    if (!extracted)
      return NextResponse.json({ error: `unsupported file type: ${file.type}` }, { status: 400 });

    return NextResponse.json({ extracted });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "extraction failed" },
      { status: 500 }
    );
  }
}
