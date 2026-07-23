export type Tone = "friendly" | "professional" | "firm" | "custom";
export type Channel = "email" | "sms";
export type Country = "US" | "UK" | "CA" | "AU";
export type Plan = "trial" | "free" | "solo" | "crew" | "pro" | "expired" | "lifetime";

export interface Business {
  id: string;
  owner_id: string;
  name: string;
  country: Country;
  currency: string;
  timezone: string;
  quiet_start: number;
  quiet_end: number;
  preferred_send_hour: number;
  allow_sunday: boolean;
  tone: Tone;
  reply_to_email: string | null;
  from_name: string | null;
  phone: string | null;
  plan: Plan;
  lifetime_tier: number;
  signup_source: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    referrer?: string | null;
    landing?: string | null;
    at?: string;
    // which plan/interval the user picked before landing on the no-card signup flow — used to
    // pre-select the right Stripe price when they upgrade at invoice #3 (see lib/trial.ts)
    intended_plan?: string | null;
    intended_interval?: string | null;
  } | null;
  trial_ends_at: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  stripe_trial_end: string | null;
  stripe_current_period_start: string | null;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  inbound_alias: string;
  created_at: string;
}

export interface Customer {
  id: string;
  business_id: string;
  name: string;
  email: string | null;
  extra_emails: string[];
  phone: string | null;
  notes: string | null;
  sms_consent: boolean;
  sms_opted_out: boolean;
  email_opted_out: boolean;
  flagged: boolean;
  created_at: string;
}

export type InvoiceStatus = "outstanding" | "paid" | "paused" | "written_off";
export type DisplayStatus = InvoiceStatus | "late";

export interface Invoice {
  id: string;
  business_id: string;
  customer_id: string;
  number: string;
  amount_cents: number;
  currency: string;
  issued_at: string;
  due_at: string;
  status: InvoiceStatus;
  source: "manual" | "email" | "photo" | "csv";
  paid_at: string | null;
  pay_token: string;
  notes: string | null;
  extraction: Record<string, unknown> | null;
  created_at: string;
}

export interface InvoiceRow extends Invoice {
  display_status: DisplayStatus;
  days_overdue: number;
  customer?: Customer;
}

export interface SequenceStep {
  offset_days: number; // relative to due date; negative = before due
  channel: Channel;
  label: string;
  subject?: string;
  body: string;
}

export interface Sequence {
  id: string;
  business_id: string;
  name: string;
  tone: Tone;
  steps: SequenceStep[];
  is_default: boolean;
}

export interface InvoiceSequence {
  id: string;
  invoice_id: string;
  sequence_id: string;
  business_id: string;
  state: "armed" | "paused" | "completed" | "stopped";
  current_step: number;
  next_run_at: string | null;
  custom_repeat_days: number | null;
}

export interface Message {
  id: string;
  business_id: string;
  invoice_id: string | null;
  customer_id: string | null;
  channel: Channel;
  direction: "outbound" | "inbound";
  to_address: string | null;
  subject: string | null;
  body: string;
  status:
    | "queued"
    | "simulated"
    | "sent"
    | "delivered"
    | "opened"
    | "clicked"
    | "failed"
    | "received";
  provider_id: string | null;
  error: string | null;
  step_index: number | null;
  created_at: string;
  sent_at: string | null;
}

export interface Payment {
  id: string;
  business_id: string;
  invoice_id: string;
  amount_cents: number;
  currency: string;
  method: "stripe" | "manual" | "other";
  stripe_payment_intent: string | null;
  paid_at: string;
}
