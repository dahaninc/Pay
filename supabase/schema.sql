-- PaidUp — complete schema (consolidated from the 4 applied migrations).
-- Paste into the Supabase SQL editor of a fresh project, or apply via MCP.

create extension if not exists pgcrypto;

-- ============ businesses (tenant) ============
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  country text not null default 'US' check (country in ('US','UK','CA','AU')),
  currency text not null default 'USD' check (currency in ('USD','GBP','CAD','AUD')),
  timezone text not null default 'America/New_York',
  quiet_start int not null default 9 check (quiet_start >= 8),
  quiet_end int not null default 20 check (quiet_end <= 20),
  tone text not null default 'professional' check (tone in ('friendly','professional','firm')),
  reply_to_email text,
  from_name text,
  phone text,
  plan text not null default 'trial' check (plan in ('trial','solo','crew','pro','expired')),
  trial_ends_at timestamptz not null default now() + interval '14 days',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_account_id text,
  stripe_charges_enabled boolean not null default false,
  inbound_alias text unique default encode(gen_random_bytes(6),'hex'),
  created_at timestamptz not null default now()
);

-- ============ membership ============
create table public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create or replace function public.is_member(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from business_members where business_id = b and user_id = auth.uid()
  ) or exists(
    select 1 from businesses where id = b and owner_id = auth.uid()
  );
$$;

-- ============ customers ============
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  notes text,
  sms_consent boolean not null default true,
  sms_opted_out boolean not null default false,
  email_opted_out boolean not null default false,
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);
create index customers_business_idx on public.customers(business_id);

-- ============ invoices ============
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  number text not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'USD',
  issued_at date not null default current_date,
  due_at date not null,
  status text not null default 'outstanding' check (status in ('outstanding','paid','paused','written_off')),
  source text not null default 'manual' check (source in ('manual','email','photo','csv')),
  paid_at timestamptz,
  pay_token uuid not null default gen_random_uuid(),
  notes text,
  extraction jsonb,
  created_at timestamptz not null default now()
);
create index invoices_business_status_idx on public.invoices(business_id, status, due_at);

-- single source of truth for "late"
create view public.invoices_view
with (security_invoker = true) as
select i.*,
  case when i.status = 'outstanding' and i.due_at < current_date then 'late' else i.status end as display_status,
  greatest(0, (current_date - i.due_at))::int as days_overdue
from public.invoices i;

-- ============ sequences ============
create table public.sequences (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null default 'Default sequence',
  tone text not null default 'professional' check (tone in ('friendly','professional','firm')),
  steps jsonb not null,
  is_default boolean not null default true,
  created_at timestamptz not null default now()
);
create index sequences_business_idx on public.sequences(business_id);

create table public.invoice_sequences (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references public.invoices(id) on delete cascade,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  state text not null default 'armed' check (state in ('armed','paused','completed','stopped')),
  current_step int not null default 0,
  next_run_at timestamptz,
  created_at timestamptz not null default now()
);
create index invoice_sequences_due_idx on public.invoice_sequences(next_run_at) where state = 'armed';

-- ============ messages ============
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null check (channel in ('email','sms')),
  direction text not null default 'outbound' check (direction in ('outbound','inbound')),
  to_address text,
  subject text,
  body text not null,
  status text not null default 'queued' check (status in ('queued','simulated','sent','delivered','opened','clicked','failed','received')),
  provider_id text,
  error text,
  step_index int,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index messages_invoice_idx on public.messages(invoice_id, created_at);
create index messages_business_idx on public.messages(business_id, created_at);

-- ============ payments ============
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount_cents bigint not null,
  currency text not null,
  method text not null default 'manual' check (method in ('stripe','manual','other')),
  stripe_payment_intent text,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index payments_business_idx on public.payments(business_id, paid_at);

-- ============ events (audit/timeline) ============
create table public.events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  type text not null,
  entity text,
  entity_id uuid,
  data jsonb,
  created_at timestamptz not null default now()
);
create index events_business_idx on public.events(business_id, created_at);

-- ============ RLS ============
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.customers enable row level security;
alter table public.invoices enable row level security;
alter table public.sequences enable row level security;
alter table public.invoice_sequences enable row level security;
alter table public.messages enable row level security;
alter table public.payments enable row level security;
alter table public.events enable row level security;

-- owner_id checked directly on the row: INSERT ... RETURNING evaluates the SELECT
-- policy in the same statement, where is_member()'s subquery can't see the new row yet
create policy businesses_select on public.businesses for select using (owner_id = auth.uid() or is_member(id));
create policy businesses_insert on public.businesses for insert with check (owner_id = auth.uid());
create policy businesses_update on public.businesses for update using (is_member(id));

create policy members_select on public.business_members for select using (user_id = auth.uid() or is_member(business_id));
create policy members_insert on public.business_members for insert with check (
  user_id = auth.uid() and exists(select 1 from businesses where id = business_id and owner_id = auth.uid())
);

create policy customers_all on public.customers for all using (is_member(business_id)) with check (is_member(business_id));
create policy invoices_all on public.invoices for all using (is_member(business_id)) with check (is_member(business_id));
create policy sequences_all on public.sequences for all using (is_member(business_id)) with check (is_member(business_id));
create policy invoice_sequences_all on public.invoice_sequences for all using (is_member(business_id)) with check (is_member(business_id));
create policy messages_all on public.messages for all using (is_member(business_id)) with check (is_member(business_id));
create policy payments_all on public.payments for all using (is_member(business_id)) with check (is_member(business_id));
create policy events_all on public.events for all using (is_member(business_id)) with check (is_member(business_id));

-- ============ public pay-page RPCs (anon, token-scoped) ============
create or replace function public.get_invoice_by_token(token uuid)
returns table (
  invoice_id uuid,
  number text,
  amount_cents bigint,
  currency text,
  due_at date,
  status text,
  business_name text,
  business_email text,
  business_phone text,
  stripe_account_id text,
  stripe_charges_enabled boolean
)
language sql stable security definer set search_path = public as $$
  select i.id, i.number, i.amount_cents, i.currency, i.due_at, i.status,
         b.name, b.reply_to_email, b.phone, b.stripe_account_id, b.stripe_charges_enabled
  from invoices i join businesses b on b.id = i.business_id
  where i.pay_token = token;
$$;
grant execute on function public.get_invoice_by_token(uuid) to anon, authenticated;

create or replace function public.optout_sms_by_token(token uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare cust uuid; biz uuid;
begin
  select customer_id, business_id into cust, biz from invoices where pay_token = token;
  if cust is null then return; end if;
  update customers set sms_opted_out = true where id = cust;
  insert into events (business_id, type, entity, entity_id, data)
  values (biz, 'sms_optout', 'customer', cust, jsonb_build_object('via','pay_link'));
end;
$$;
grant execute on function public.optout_sms_by_token(uuid) to anon, authenticated;
