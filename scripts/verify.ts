/* End-to-end verification against the live Supabase project.
 * Exercises the same code paths the app uses: arming plan, scheduler,
 * payment auto-stop, stats, RLS isolation, public pay RPCs.
 * Run: npx tsx scripts/verify.ts
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

// load .env.local
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+[A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

import { defaultSteps } from "../lib/templates";
import { armingPlan, processDueReminders, stopSequence } from "../lib/scheduler";
import { getHeaderStats } from "../lib/stats";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
}

async function main() {
  const db = createClient(URL_, ANON);

  // ---- 1. auth ----
  const { data: auth, error: authErr } = await db.auth.signInWithPassword({
    email: "demo@paidup.local",
    password: "paidup-demo-2026",
  });
  check("Password sign-in (demo user)", !authErr && !!auth.user, authErr?.message);
  if (!auth.user) process.exit(1);

  // ---- 2. business onboarding (same inserts as createBusiness action) ----
  // reuse the existing business on repeat runs (the app has no business deletes by design)
  const { data: existingBiz } = await db
    .from("businesses")
    .select("*")
    .eq("owner_id", auth.user.id)
    .order("created_at", { ascending: true })
    .limit(1);
  let biz = existingBiz?.[0];
  if (!biz) {
    const { data: created, error: bizErr } = await db
      .from("businesses")
      .insert({
        owner_id: auth.user.id,
        name: "Dave's Plumbing",
        country: "US",
        currency: "USD",
        timezone: "Asia/Tokyo", // daytime there right now → sends are inside the compliance window
        tone: "professional",
        reply_to_email: "demo@paidup.local",
        from_name: "Dave's Plumbing",
      })
      .select()
      .single();
    check("Create business (RLS insert as owner)", !bizErr && !!created, bizErr?.message);
    biz = created;
    await db.from("business_members").insert({ business_id: biz.id, user_id: auth.user.id, role: "owner" });
  } else {
    check("Create business (RLS insert as owner)", true, "reusing existing");
  }

  const { data: seqRows } = await db
    .from("sequences")
    .select("*")
    .eq("business_id", biz.id)
    .eq("is_default", true)
    .limit(1);
  let seq = seqRows?.[0];
  if (!seq) {
    const { data: createdSeq, error: seqErr } = await db
      .from("sequences")
      .insert({ business_id: biz.id, name: "Default sequence", tone: "professional", steps: defaultSteps("professional"), is_default: true })
      .select()
      .single();
    check("Seed default 5-step sequence", !seqErr && createdSeq.steps.length === 5);
    seq = createdSeq;
  } else {
    check("Seed default 5-step sequence", seq.steps.length === 5, "reusing existing");
  }

  // clean prior verify invoices so counters assert cleanly
  const { data: oldInvs } = await db.from("invoices").select("id").eq("business_id", biz.id).eq("number", "INV-142");
  for (const oi of oldInvs ?? []) await db.from("invoices").delete().eq("id", oi.id);
  await db.from("payments").delete().eq("business_id", biz.id);

  // ---- 3. invoice + arming ----
  const { data: cust } = await db
    .from("customers")
    .insert({ business_id: biz.id, name: "Sarah Miller", email: "sarah@example.com", phone: "+15550001234" })
    .select()
    .single();

  const dueAt = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10); // 6 days overdue
  const { data: inv, error: invErr } = await db
    .from("invoices")
    .insert({
      business_id: biz.id, customer_id: cust.id, number: "INV-142",
      amount_cents: 84000, currency: "USD",
      issued_at: new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10),
      due_at: dueAt, status: "outstanding", source: "manual",
    })
    .select()
    .single();
  check("Create invoice", !invErr, invErr?.message);

  // late derivation from the SQL view (single source of truth)
  const { data: viewRow } = await db.from("invoices_view").select("display_status, days_overdue").eq("id", inv.id).single();
  check("invoices_view derives late status", viewRow?.display_status === "late" && viewRow?.days_overdue === 6,
    `display_status=${viewRow?.display_status}, days_overdue=${viewRow?.days_overdue}`);

  const plan = armingPlan(defaultSteps("professional"), dueAt, biz.timezone);
  check("Arming plan picks next future step", plan.stepIndex === 3, `step ${plan.stepIndex} (+10d firm follow-up), fires ${plan.nextRunAt.toISOString()}`);

  const { data: iseq } = await db
    .from("invoice_sequences")
    .insert({
      invoice_id: inv.id, sequence_id: seq.id, business_id: biz.id,
      state: "armed", current_step: plan.stepIndex,
      next_run_at: new Date(Date.now() - 60000).toISOString(), // force due now to exercise the scheduler
    })
    .select()
    .single();

  // ---- 4. scheduler run (the actual production function) ----
  const outcomes = await processDueReminders(db, { businessId: biz.id });
  const sent = outcomes.find((o) => o.invoiceId === inv.id);
  check("Scheduler processes due reminder", sent?.action === "simulated",
    `action=${sent?.action} detail=${sent?.detail}`);

  const { data: msg } = await db.from("messages").select("*").eq("invoice_id", inv.id).eq("direction", "outbound").single();
  check("Message recorded with rendered merge tags",
    !!msg && msg.status === "simulated" && msg.body.includes("Sarah") && msg.body.includes("$840") && msg.body.includes("/pay/"),
    msg ? `"${msg.body.slice(0, 90)}…"` : "no message");
  check("Idempotency key set", msg?.idempotency_key === `${iseq.id}:${plan.stepIndex}`);

  // re-run: must not double-send
  const rerun = await processDueReminders(db, { businessId: biz.id });
  const { count: msgCount } = await db.from("messages").select("id", { count: "exact", head: true }).eq("invoice_id", inv.id).eq("direction", "outbound");
  check("Idempotent re-run (no duplicate send)", msgCount === 1 && rerun.filter((o) => o.invoiceId === inv.id && o.action === "simulated").length === 0);

  const { data: advanced } = await db.from("invoice_sequences").select("*").eq("id", iseq.id).single();
  check("Sequence advanced to final step, ≥24h out",
    advanced.current_step === 4 && new Date(advanced.next_run_at).getTime() > Date.now() + 23 * 3600000,
    `step=${advanced.current_step}, next=${advanced.next_run_at}`);

  // ---- 5. payment → auto-stop → recovered counter ----
  const now = new Date().toISOString();
  await db.from("invoices").update({ status: "paid", paid_at: now }).eq("id", inv.id);
  await db.from("payments").insert({ business_id: biz.id, invoice_id: inv.id, amount_cents: 84000, currency: "USD", method: "manual", paid_at: now });
  await stopSequence(db, inv.id);
  const { data: stopped } = await db.from("invoice_sequences").select("state, next_run_at").eq("id", iseq.id).single();
  check("Payment stops sequence", stopped?.state === "stopped" && stopped?.next_run_at === null);

  const stats = await getHeaderStats(db, biz.id, "USD");
  check("Recovered counter counts reminded-then-paid invoice", stats.recoveredCents === 84000,
    `recovered=$${stats.recoveredCents / 100}`);
  check("Outstanding drops to zero after payment", stats.outstandingCents === 0);

  // ---- 6. public pay page RPCs (anon, token-scoped) ----
  const anon = createClient(URL_, ANON);
  const { data: payData } = await anon.rpc("get_invoice_by_token", { token: inv.pay_token });
  check("Anon pay-link RPC returns invoice", payData?.[0]?.business_name === "Dave's Plumbing" && Number(payData?.[0]?.amount_cents) === 84000);
  const { data: badToken } = await anon.rpc("get_invoice_by_token", { token: "00000000-0000-0000-0000-000000000000" });
  check("Anon RPC returns nothing for bad token", !badToken?.length);
  await anon.rpc("optout_sms_by_token", { token: inv.pay_token });
  const { data: custAfter } = await db.from("customers").select("sms_opted_out").eq("id", cust.id).single();
  check("SMS opt-out via pay link", custAfter?.sms_opted_out === true);

  // ---- 7. RLS isolation: anon sees nothing ----
  const { data: leak1 } = await anon.from("invoices").select("id");
  const { data: leak2 } = await anon.from("businesses").select("id");
  const { data: leak3 } = await anon.from("messages").select("id");
  check("RLS: anon client sees zero rows", !leak1?.length && !leak2?.length && !leak3?.length);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("❌ crashed:", e);
  process.exit(1);
});
