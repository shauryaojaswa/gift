-- Defect fix: store deletion always rolled back.
--
-- Root cause (verified 2026-10-15 against 20261010203000_managed_tenant_foundation.sql):
-- audit_managed_change() is wired to AFTER INSERT/UPDATE/DELETE triggers on
-- stores, rewards, reward_tiers, store_admins, store_subscriptions,
-- tier_gift_options, store_owner_invitations (plus gift_catalog,
-- platform_policies, subscription_plans, and submissions collection updates).
-- For a DELETE on stores (direct or via any ON DELETE CASCADE child deletion in
-- the same statement) the function inserted a platform_audit_logs row carrying
-- the dying store's id in store_id. The FK platform_audit_logs_store_id_fkey
-- then failed ("insert or update on table platform_audit_logs violates foreign
-- key constraint platform_audit_logs_store_id_fkey"), rolling back the delete.
-- The FK's ON DELETE SET NULL action never runs for these rows: the audit row
-- is created AFTER its parent is gone, so no referential action applies.
-- Making the FK DEFERRABLE INITIALLY DEFERRED would not fix it either - the
-- parent row is still absent when the check runs at COMMIT.
--
-- Fix (narrowest correct option, trigger side): when the audit row's computed
-- store/actor reference no longer exists (the entity is being deleted in the
-- same statement/transaction), write NULL into the live FK column and preserve
-- the original identifier inside the existing details metadata
-- ("deleted_store_id" / "deleted_actor_id"). The audit row itself is always
-- inserted and stays durable; action, timestamp, actor and changed_fields are
-- unchanged. Valid references are untouched, so ordinary child deletions keep
-- their store linkage. No schema objects are added or dropped.

create or replace function public.audit_managed_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_store_id uuid;
  v_actor_id uuid;
  v_changed_fields text[];
  v_details jsonb;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;

  if tg_table_name = 'submissions' then
    if (v_old ->> 'collection_status') is not distinct from (v_new ->> 'collection_status') then
      return new;
    end if;
    v_changed_fields := array['collection_status'];
  elsif tg_op = 'INSERT' then
    select array_agg(fields.key order by fields.key) into v_changed_fields
    from jsonb_object_keys(v_new) as fields(key);
  elsif tg_op = 'DELETE' then
    select array_agg(fields.key order by fields.key) into v_changed_fields
    from jsonb_object_keys(v_old) as fields(key);
  else
    select array_agg(new_field.key order by new_field.key) into v_changed_fields
    from jsonb_each(v_new) as new_field
    join jsonb_each(v_old) as old_field using (key)
    where new_field.value is distinct from old_field.value;
  end if;

  if tg_table_name = 'stores' then
    v_store_id := coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);
  else
    v_store_id := coalesce((v_new ->> 'store_id')::uuid, (v_old ->> 'store_id')::uuid);
  end if;
  v_actor_id := (select auth.uid());

  v_details := jsonb_build_object('changed_fields', coalesce(to_jsonb(v_changed_fields), '[]'::jsonb));

  -- Defect fix: never place a dying entity's id into a live foreign-key column.
  -- If the referenced store no longer exists (deleted in this same
  -- statement/transaction - the stores trigger itself or any cascade), detach
  -- the reference and keep the identifier in the existing details metadata.
  if v_store_id is not null
     and not exists (select 1 from public.stores s where s.id = v_store_id) then
    v_details := v_details || jsonb_build_object('deleted_store_id', v_store_id);
    v_store_id := null;
  end if;

  -- Same treatment for the actor reference (auth.users self-deletion cascades).
  if v_actor_id is not null
     and not exists (select 1 from auth.users u where u.id = v_actor_id) then
    v_details := v_details || jsonb_build_object('deleted_actor_id', v_actor_id);
    v_actor_id := null;
  end if;

  insert into public.platform_audit_logs (actor_id, store_id, action, details)
  values (
    v_actor_id,
    v_store_id,
    tg_table_name || '.' || lower(tg_op),
    v_details
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
