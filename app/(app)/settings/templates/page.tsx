import Link from "next/link";
import { requireBusiness } from "@/lib/supabase/server";
import { TemplatesEditor } from "@/components/TemplatesEditor";
import { BackIcon } from "@/components/icons";
import type { Sequence } from "@/lib/types";

export default async function TemplatesPage() {
  const { supabase, business } = await requireBusiness();
  const { data: sequence } = await supabase
    .from("sequences")
    .select("*")
    .eq("business_id", business.id)
    .eq("is_default", true)
    .single();

  return (
    <div className="max-w-[600px] mx-auto pt-3">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
      >
        <BackIcon />
        Settings
      </Link>
      <h1 className="sm:hidden font-disp font-extrabold text-2xl tracking-[-0.02em] text-ink mt-3 px-0.5">
        Message templates
      </h1>
      <p className="text-[13px] font-semibold text-muted px-0.5 mt-1 mb-[18px]">
        Set the tone once. Every reminder sounds like you, never a debt collector.
      </p>
      {sequence ? (
        <TemplatesEditor sequence={sequence as Sequence} tone={business.tone} />
      ) : (
        <p className="card p-5 text-sm text-muted">No sequence found.</p>
      )}
    </div>
  );
}
