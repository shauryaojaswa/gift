-- JRIQ production pre-migration evidence baseline (prepared 2026-10-15, NOT executed)
--
-- PURPOSE: capture a read-only snapshot of the protected data BEFORE any production
-- migration, so post-migration verification can prove nothing changed.
--
-- PII RULE: this script prints NO phone numbers, NO customer names, NO emails.
-- Only counts, claim codes, amounts, and structural facts are printed.
--
-- RUN WHERE: Supabase dashboard SQL editor on project jwellery (awshkiwqkuubkhecszzk),
-- or psql from a network with DB egress. Read-only: SELECT statements only.
--
-- SAVE OUTPUT TO: %USERPROFILE%\backups\jriq\baseline-<date>.txt (outside the repo,
-- never committed).

-- 1. Row counts per protected table
select 'stores' as tbl, count(*) from public.stores
union all select 'store_admins', count(*) from public.store_admins
union all select 'rewards', count(*) from public.rewards
union all select 'reward_tiers', count(*) from public.reward_tiers
union all select 'submissions', count(*) from public.submissions
union all select 'collections', count(*) from public.collections
union all select 'subscription_plans', count(*) from public.subscription_plans
union all select 'store_subscriptions', count(*) from public.store_subscriptions;

-- 2. Protected claim (NO PII columns: excludes customer name/phone)
select
  id, coupon_code, purchase_amount, reward_label, reward_wheel_label,
  reward_claim_code_prefix, tier_label, status, created_at
from public.submissions
where coupon_code = 'GIFT-DDD89040';

-- 3. Existing shop structure (tiers + rewards, no customers)
select 'tier' as kind, t.id::text, t.min_amount::text, t.max_amount::text,
       t.reward_id::text, r.name
from public.reward_tiers t
left join public.rewards r on r.id = t.reward_id
where t.store_id = '00000000-0000-4000-a000-000000000001'
order by t.min_amount;

select 'reward' as kind, id::text, name, wheel_label, active::text, catalog_gift_id::text
from public.rewards
where store_id = '00000000-0000-4000-a000-000000000001'
order by name;

-- 4. Store + owner mappings (emails allowed in the file on disk, not in chat/docs)
select s.id, s.slug, s.status, s.min_spin_amount, sa.email, sa.role
from public.stores s
left join public.store_admins sa on sa.store_id = s.id
order by s.slug, sa.role;

-- 5. Migration history as recorded in the database
select version, name, statements
from supabase_migrations.schema_migrations
order by version;

-- 6. Postgres timezone (business-day semantics depend on it)
select current_setting('TimeZone') as db_timezone, current_date as db_today;
