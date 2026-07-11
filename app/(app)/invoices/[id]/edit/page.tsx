import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/supabase/server";
import { updateInvoice } from "@/app/actions/invoices";
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
    await supabase
      .from("customers")
      .update({
        phone: String(formData.get("phone") || "").trim() || null,
        email: String(formData.get("email") || "").trim() || null,
      })
      .eq("id", customerId);
    await updateInvoice(formData);
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link href={`/invoices/${id}`} className="text-sm text-ink-600 hover:underline">
        ← Back to invoice
      </Link>
      <h1 className="text-2xl font-bold mt-3 mb-5">Edit invoice</h1>
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Customer mobile</label>
            <input name="phone" type="tel" defaultValue={inv.customer?.phone ?? ""} className="field" />
          </div>
          <div>
            <label className="label">Customer email</label>
            <input name="email" type="email" defaultValue={inv.customer?.email ?? ""} className="field" />
          </div>
        </div>
        <button type="submit" className="btn-primary w-full">
          Save changes
        </button>
        <p className="text-xs text-ink-400 text-center">
          Changing the due date re-plans the reminder schedule automatically.
        </p>
      </form>
    </div>
  );
}
