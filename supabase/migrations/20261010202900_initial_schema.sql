create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  subtitle text,
  logo_url text,
  primary_color text,
  secondary_color text,
  google_review_url text,
  campaign_badge text,
  min_spin_amount integer not null default 10000 check (min_spin_amount > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  description text,
  claim_code_prefix text,
  validity_text text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id)
);

create table if not exists public.reward_tiers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  min_amount integer not null check (min_amount > 0),
  max_amount integer check (max_amount is null or max_amount > min_amount),
  reward_id uuid not null,
  target_segment integer not null check (target_segment between 0 and 7),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (store_id, reward_id)
    references public.rewards(store_id, id) on delete restrict
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_name text not null check (length(btrim(customer_name)) between 2 and 80),
  customer_phone text not null,
  purchase_amount integer not null check (purchase_amount > 0),
  reward_id uuid not null,
  reward_label text not null,
  reward_description text,
  coupon_code text,
  review_cta_shown boolean not null default false,
  review_cta_clicked boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (store_id, reward_id)
    references public.rewards(store_id, id) on delete restrict
);

create table if not exists public.store_admins (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'owner' check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  unique (store_id, user_id)
);
