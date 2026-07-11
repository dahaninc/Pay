import Link from "next/link";
import { requireBusiness } from "@/lib/supabase/server";
import { TemplatesEditor } from "@/components/TemplatesEditor";
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
    <div className="max-w-lg mx-auto">
      <Link href="/settings" className="text-sm text-ink-600 hover:underline">
        ← Settings
      </Link>
      <h1 className="text-2xl font-bold mt-3 mb-1">Reminder messages</h1>
      <p className="text-ink-600 text-sm mb-5">
        Five messages, sent around each invoice&rsquo;s due date. Sound like you — never like a
        debt collector.
      </p>
      {sequence ? (
        <TemplatesEditor sequence={sequence as Sequence} tone={business.tone} />
      ) : (
        <p className="card p-5 text-sm text-ink-600">No sequence found.</p>
      )}
    </div>
  );
}
