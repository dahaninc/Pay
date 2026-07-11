"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importInvoices } from "@/app/actions/invoices";

interface Row {
  customer_name: string;
  email?: string;
  phone?: string;
  amount: string;
  due_at: string;
  number?: string;
}

function parseCsv(text: string): { rows: Row[]; error?: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { rows: [], error: "Need a header row plus at least one invoice." };

  const header = lines[0].toLowerCase().split(",").map((h) => h.trim().replace(/['"]/g, ""));
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const nameI = idx(["customer", "customer_name", "name", "client"]);
  const amountI = idx(["amount", "total", "amount_due"]);
  const dueI = idx(["due", "due_date", "due_at"]);
  if (nameI < 0 || amountI < 0 || dueI < 0)
    return {
      rows: [],
      error: "Header must include customer, amount and due_date columns.",
    };
  const emailI = idx(["email"]);
  const phoneI = idx(["phone", "mobile"]);
  const numberI = idx(["number", "invoice", "invoice_no", "invoice_number"]);

  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
    if (!cols[nameI] || !cols[amountI]) continue;
    // normalize dates like 7/30/2026 → 2026-07-30
    let due = cols[dueI] ?? "";
    const m = due.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) due = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    rows.push({
      customer_name: cols[nameI],
      amount: cols[amountI],
      due_at: due,
      email: emailI >= 0 ? cols[emailI] : undefined,
      phone: phoneI >= 0 ? cols[phoneI] : undefined,
      number: numberI >= 0 ? cols[numberI] : undefined,
    });
  }
  return { rows };
}

export function CsvImport() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);

  function loadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((t) => {
      setText(t);
      const parsed = parseCsv(t);
      setError(parsed.error ?? null);
      setPreview(parsed.rows.length ? parsed.rows : null);
    });
  }

  function parsePasted() {
    const parsed = parseCsv(text);
    setError(parsed.error ?? null);
    setPreview(parsed.rows.length ? parsed.rows : null);
  }

  async function runImport() {
    if (!preview) return;
    setBusy(true);
    const res = await importInvoices(preview);
    setResult(res);
    setBusy(false);
    if (res.created > 0 && res.errors.length === 0) {
      setTimeout(() => router.push("/invoices"), 1200);
    }
  }

  if (result) {
    return (
      <div className="card p-6">
        <h2 className="font-bold text-lg">
          {result.created} {result.created === 1 ? "invoice" : "invoices"} imported ✓
        </h2>
        {result.errors.length > 0 && (
          <ul className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg p-3 space-y-1">
            {result.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        <button className="btn-primary mt-5" onClick={() => router.push("/invoices")}>
          Go to invoices
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <p className="text-sm text-ink-600 mb-3">
          Columns: <span className="font-mono">customer, amount, due_date</span> (+ optional{" "}
          <span className="font-mono">email, phone, invoice_no</span>)
        </p>
        <label className="btn-secondary cursor-pointer w-full mb-3">
          Choose CSV file
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={loadFile} />
        </label>
        <textarea
          className="field font-mono text-sm"
          rows={6}
          placeholder={"customer,amount,due_date,email,phone\nSarah Miller,840,2026-07-01,sarah@email.com,+15550001234"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-secondary w-full mt-3" onClick={parsePasted} disabled={!text.trim()}>
          Preview
        </button>
        {error && <p className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
      </div>

      {preview && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-400 border-b border-gray-100">
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Due</th>
                  <th className="px-4 py-2.5 font-medium">Contact</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="px-4 py-2.5 font-medium">{r.customer_name}</td>
                    <td className="px-4 py-2.5 tnum">{r.amount}</td>
                    <td className="px-4 py-2.5">{r.due_at}</td>
                    <td className="px-4 py-2.5 text-ink-400">{r.phone || r.email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-gray-100">
            <button className="btn-primary w-full" onClick={runImport} disabled={busy}>
              {busy
                ? "Importing…"
                : `Import ${preview.length} ${preview.length === 1 ? "invoice" : "invoices"} + arm reminders`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
