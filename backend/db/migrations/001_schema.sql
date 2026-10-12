-- Multi-tenant SaaS schema for the Jewellery Spin & Win platform.
-- Every store-owned row carries store_id so tenancy can be enforced in the database.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles: application user, one per authenticated account
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  full_name text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_email_unique on profiles (lower(email));

-- ---------------------------------------------------------------------------
-- plans: subscription plan definitions, editable by the platform admin
-- ---------------------------------------------------------------------------
create table if not exists plans (
  id text primary key,
  name text not null,
  price_inr integer not null default 0,
  billing_interval text not null default 'month',
  trial_days integer not null default 0,
  max_stores integer not null default 1,
  max_submissions_per_month integer,
  csv_export boolean not null default false,
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- stores: tenant root
-- ---------------------------------------------------------------------------
create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null default '',
  subtitle text,
  logo_url text,
  primary_color text,
  secondary_color text,
  google_review_url text,
  campaign_badge text,
  min_spin_amount integer not null default 10000,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists stores_slug_unique on stores (lower(slug));

-- ---------------------------------------------------------------------------
-- store_members: which user belongs to which store, and with what role
-- ---------------------------------------------------------------------------
create table if not exists store_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now()
);
create unique index if not exists store_members_unique on store_members (store_id, user_id);
create index if not exists store_members_user_idx on store_members (user_id);

-- ---------------------------------------------------------------------------
-- rewards: store-specific gift definitions
-- ---------------------------------------------------------------------------
create table if not exists rewards (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  name text not null,
  wheel_label text,
  description text,
  voucher_amount integer,
  claim_code_prefix text,
  validity_text text,
  terms text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rewards_store_idx on rewards (store_id);

-- ---------------------------------------------------------------------------
-- reward_tiers: purchase boundaries mapped to a reward and wheel segment
-- ---------------------------------------------------------------------------
create table if not exists reward_tiers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  min_amount integer not null,
  max_amount integer,
  reward_id uuid not null references rewards (id) on delete restrict,
  target_segment integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reward_tiers_range check (max_amount is null or max_amount > min_amount)
);
create index if not exists reward_tiers_store_idx on reward_tiers (store_id);

-- ---------------------------------------------------------------------------
-- submissions: customer entries + immutable reward snapshot
-- ---------------------------------------------------------------------------
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  purchase_amount integer not null,
  tier_id uuid references reward_tiers (id) on delete set null,
  reward_id uuid references rewards (id) on delete set null,
  reward_label text not null,
  reward_description text,
  reward_voucher_amount integer,
  reward_validity_text text,
  claim_code text,
  review_cta_shown boolean not null default false,
  review_cta_clicked boolean not null default false,
  collection_status text not null default 'awaiting' check (collection_status in ('awaiting', 'collected')),
  collected_at timestamptz,
  collected_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists submissions_claim_code_unique on submissions (claim_code) where claim_code is not null;
create index if not exists submissions_store_created_idx on submissions (store_id, created_at desc);
create index if not exists submissions_store_phone_idx on submissions (store_id, customer_phone);

-- ---------------------------------------------------------------------------
-- subscriptions: billing state for a store (backend-controlled)
-- ---------------------------------------------------------------------------
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  plan_id text not null references plans (id),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'cancelled', 'expired', 'suspended')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  grace_ends_at timestamptz,
  provider text,
  provider_subscription_id text,
  provider_customer_id text,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_store_idx on subscriptions (store_id);
create unique index if not exists subscriptions_provider_unique
  on subscriptions (provider, provider_subscription_id) where provider_subscription_id is not null;

-- ---------------------------------------------------------------------------
-- billing_events: verified provider webhook events, idempotent by event id
-- ---------------------------------------------------------------------------
create table if not exists billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text,
  store_id uuid references stores (id) on delete set null,
  subscription_id uuid references subscriptions (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);
create unique index if not exists billing_events_idempotent on billing_events (provider, event_id);

-- ---------------------------------------------------------------------------
-- usage_counters: monthly submission usage per store, for plan limits
-- ---------------------------------------------------------------------------
create table if not exists usage_counters (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  period text not null,
  submissions integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists usage_counters_unique on usage_counters (store_id, period);

-- ---------------------------------------------------------------------------
-- platform_admins: explicit platform-operator identities
-- ---------------------------------------------------------------------------
create table if not exists platform_admins (
  user_id uuid primary key references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- audit_logs: sensitive administrative actions
-- ---------------------------------------------------------------------------
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on audit_logs (created_at desc);
