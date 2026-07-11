import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/supabase/server";
import { updateInvoice } from "@/app/actions/invoices";
import { EmailListInput } from "@/components/EmailListInput";
import { BackIcon } from "@/components/icons";
import type { Customer, Invoice } from "@/lib/types";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireBusiness();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, customer:customers(*)")
    .eq("id", id)
    .maybeSingle();
  if (!invoice) notFound();
  const inv = invoice as Invoice & { customer: Customer };

  async function saveCustomer(formData: FormData) {
    "use server";
    const { supabase } = await requireBusiness();
    const customerId = String(formData.get("customer_id"));
    const email = String(formData.get("customer_email") || "").trim() || null;
    const extraEmails = [
      ...new Set(
        formData
          .getAll("extra_email")
          .map((e) => String(e).trim())
          .filter((e) => e.includes("@") && e !== email)
      ),
    ].slice(0, 4);
    await supabase
      .from("customers")
      .update({
        phone: String(formData.get("phone") || "").trim() || null,
        email,
        extra_emails: extraEmails,
      })
      .eq("id", customerId);
    await updateInvoice(formData);
  }

  return (
    <div className="max-w-[520px] mx-auto pt-3">
      <Link
        href={`/invoices/${id}`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
      >
        <BackIcon />
        Back to invoice
      </Link>
      <h1 className="font-disp font-extrabold text-2xl tracking-[-0.02em] text-ink mt-3 mb-5 px-0.5">
        Edit invoice
      </h1>
      <form action={saveCustomer} className="card p-5 sm:p-6 space-y-5">
        <input type="hidden" name="invoice_id" value={inv.id} />
        <input type="hidden" name="customer_id" value={inv.customer_id} />
        <div>
          <label className="label">Invoice number</label>
          <input name="number" defaultValue={inv.number} required className="field" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Amount</label>
            <input
              name="amount"
              defaultValue={(inv.amount_cents / 100).toFixed(2)}
              required
              inputMode="decimal"
              className="field tnum"
            />
          </div>
          <div>
            <label className="label">Due date</label>
            <input name="due_at" type="date" defaultValue={inv.due_at} required className="field" />
          </div>
        </div>
        <div>
          <label className="label">Customer mobile</label>
          <input name="phone" type="tel" defaultValue={inv.customer?.phone ?? ""} className="field" />
        </div>
        <div>
          <label className="label">
            Customer email <span className="text-muted font-normal">(＋ to add up to 5)</span>
          </label>
          <EmailListInput
            defaultPrimary={inv.customer?.email ?? ""}
            defaultExtras={inv.customer?.extra_emails ?? []}
          />
        </div>
        <button type="submit" className="btn-primary w-full">
          Save changes
        </button>
        <p className="text-xs text-muted text-center">
          Changing the due date re-plans the reminder schedule automatically.
        </p>
      </form>
    </div>
  );
}
