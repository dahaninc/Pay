/* Cross-tenant RLS attack test: attacker signs in and tries to read/modify
 * the demo business's data by every route the PostgREST API exposes. */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+[A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let pass = 0,
  fail = 0;
const check = (n: string, ok: boolean, d?: string) => {
  console.log(`${ok ? "✅" : "❌ LEAK"} ${n}${d ? ` — ${d}` : ""}`);
  ok ? pass++ : fail++;
};

async function main() {
  // victim
  const victim = createClient(URL_, ANON);
  await victim.auth.signInWithPassword({ email: "demo@paidup.local", password: "paidup-demo-2026" });
  const { data: vb } = await victim.from("businesses").select("id").limit(1);
  const victimBiz = vb?.[0]?.id as string;
  const { data: vi } = await victim.from("invoices").select("id, customer_id").limit(1);
  const victimInvoice = vi?.[0]?.id as string;
  const victimCustomer = vi?.[0]?.customer_id as string;

  // attacker in a different tenant
  const atk = createClient(URL_, ANON);
  const { error: authErr } = await atk.auth.signInWithPassword({
    email: "attacker@paidup.local",
    password: "attacker-demo-2026",
  });
  check("Attacker can sign in (separate tenant)", !authErr);
  const { data: ab } = await atk.from("businesses").insert({ owner_id: (await atk.auth.getUser()).data.user!.id, name: "Attacker Co" }).select().single();
  if (ab) await atk.from("business_members").insert({ business_id: ab.id, user_id: (await atk.auth.getUser()).data.user!.id, role: "owner" });

  // --- read attacks ---
  const { data: r1 } = await atk.from("businesses").select("*").eq("id", victimBiz);
  check("Cannot read victim business row", !r1?.length, `${r1?.length ?? 0} rows`);
  const { data: r2 } = await atk.from("invoices").select("*").eq("business_id", victimBiz);
  check("Cannot read victim invoices", !r2?.length, `${r2?.length ?? 0} rows`);
  const { data: r3 } = await atk.from("customers").select("*").eq("business_id", victimBiz);
  check("Cannot read victim customers (PII)", !r3?.length, `${r3?.length ?? 0} rows`);
  const { data: r4 } = await atk.from("messages").select("*").eq("business_id", victimBiz);
  check("Cannot read victim messages", !r4?.length, `${r4?.length ?? 0} rows`);
  const { data: r5 } = await atk.from("payments").select("*").eq("business_id", victimBiz);
  check("Cannot read victim payments", !r5?.length, `${r5?.length ?? 0} rows`);
  const { data: r6 } = await atk.from("invoices_view").select("*").eq("business_id", victimBiz);
  check("Cannot read victim invoices_view", !r6?.length, `${r6?.length ?? 0} rows`);

  // --- write attacks ---
  const { error: w1 } = await atk.from("invoices").update({ amount_cents: 1 }).eq("id", victimInvoice);
  const { data: after1 } = await victim.from("invoices").select("amount_cents").eq("id", victimInvoice).single();
  check("Cannot tamper victim invoice amount", after1?.amount_cents !== 1, w1 ? "RLS error" : `amount now ${after1?.amount_cents}`);
  const { data: w2 } = await atk.from("customers").update({ email: "hacked@evil.com" }).eq("id", victimCustomer).select();
  check("Cannot tamper victim customer", !w2?.length);
  // attacker tries to attach a customer under victim's tenant
  const { data: w3 } = await atk.from("customers").insert({ business_id: victimBiz, name: "injected" }).select();
  check("Cannot insert into victim tenant", !w3?.length);
  const { error: w4 } = await atk.from("invoices").delete().eq("id", victimInvoice);
  const { data: after4 } = await victim.from("invoices").select("id").eq("id", victimInvoice);
  check("Cannot delete victim invoice", !!after4?.length, w4 ? "RLS error" : "");

  // --- membership escalation ---
  const { data: w5 } = await atk.from("business_members").insert({ business_id: victimBiz, user_id: (await atk.auth.getUser()).data.user!.id, role: "owner" }).select();
  check("Cannot self-join victim tenant as member", !w5?.length);

  // --- token RPC only leaks token-scoped fields (no service-key data) ---
  const { data: tok } = await victim.from("invoices").select("pay_token").eq("id", victimInvoice).single();
  const { data: rpc } = await atk.rpc("get_invoice_by_token", { token: tok?.pay_token });
  const fields = rpc?.[0] ? Object.keys(rpc[0]) : [];
  const leakyFields = fields.filter((f) => !["invoice_id","number","amount_cents","currency","due_at","status","business_name","business_email","business_phone","stripe_account_id","stripe_charges_enabled"].includes(f));
  check("Pay-token RPC exposes only intended fields", leakyFields.length === 0, leakyFields.join(",") || "clean");

  // cleanup attacker's own business
  if (ab) await atk.from("businesses").delete().eq("id", ab.id);

  console.log(`\n${pass} passed, ${fail} LEAKS`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error("crashed", e); process.exit(1); });
