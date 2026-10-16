-- =============================================================================
-- v1.2.0 - public bracket gift-pool read (real wheel labels for customers)
-- =============================================================================
-- ADDITIVE ONLY. One new read-only function + explicit grants. No table,
-- constraint, trigger, policy or existing function is modified. The claim
-- authority (submit_customer_entry) is NOT touched by this migration.
--
-- WHY THIS EXISTS:
--   v1.2.0 requires the customer wheel to show the shop's REAL approved gift
--   names for the customer's purchase bracket: no placeholder slice labels, no
--   fake prizes, and a clear "not configured yet" state when a bracket has no
--   valid pool. tier_gift_options is revoked from anon (20261015170000), so the
--   public client cannot see which approved gifts belong to which bracket.
--   This function exposes exactly that, per store, display fields only:
--   no other shop's data, no customer data, no platform configuration.
--
-- SELECTION SEMANTICS mirror submit_customer_entry:
--   * a bracket's pool = its active tier_gift_options rows joined to active
--     rewards and active gift_catalog entries;
--   * a bracket with no such pool falls back to its legacy single reward
--     (historical production shops keep behaving exactly as before).
-- This read is presentation only. The authoritative award, eligibility and
-- immutability stay in submit_customer_entry, which remains the only writer of
-- claims.
--
-- Applied to staging first, verified, then to production (see
-- docs/FINAL_HANDOVER.md migration table). Expect: 1 additive migration.
-- =============================================================================

create or replace function public.get_store_gift_pool(p_store_slug text)
returns table (
  tier_id uuid,
  reward_id uuid,
  gift_name text,
  wheel_label text,
  gift_description text,
  voucher_value integer
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Approved pool gifts (gift options), one row per gift the shop approved for
  -- the bracket. Pool wins over any legacy reward for the same bracket.
  select
    o.tier_id,
    r.id,
    r.name,
    r.wheel_label,
    coalesce(r.description, ''),
    r.voucher_value
  from public.stores s
  join public.reward_tiers t on t.store_id = s.id and t.active
  join public.tier_gift_options o on o.tier_id = t.id and o.active
  join public.rewards r on r.store_id = s.id and r.id = o.reward_id and r.active
  join public.gift_catalog g on g.id = r.catalog_gift_id and g.active
  where s.slug = p_store_slug
    and s.active
    and s.status = 'active'

  union all

  -- Legacy single-gift fallback: only for brackets that have no valid pool,
  -- matching the selection order in submit_customer_entry.
  select
    t.id,
    r.id,
    r.name,
    r.wheel_label,
    coalesce(r.description, ''),
    r.voucher_value
  from public.stores s
  join public.reward_tiers t on t.store_id = s.id and t.active
  join public.rewards r on r.store_id = s.id and r.id = t.reward_id and r.active
  where s.slug = p_store_slug
    and s.active
    and s.status = 'active'
    and not exists (
      select 1
      from public.tier_gift_options o
      join public.rewards pool_reward
        on pool_reward.store_id = s.id and pool_reward.id = o.reward_id and pool_reward.active
      join public.gift_catalog g on g.id = pool_reward.catalog_gift_id and g.active
      where o.tier_id = t.id and o.active
    )
  order by 1
$$;

revoke all on function public.get_store_gift_pool(text) from public;
grant execute on function public.get_store_gift_pool(text) to anon, authenticated;
