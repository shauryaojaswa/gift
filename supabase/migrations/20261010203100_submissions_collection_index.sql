-- Migration: submissions collection lookup index
--
-- Replaces 0001_add_gift_collection_tracking.sql, which was removed because it
-- conflicted with the canonical schema:
--   1. Its filename sorted BEFORE 20261010202900_initial_schema.sql, so any
--      ordered apply (`supabase db push`, SQL editor run in name order) failed
--      on `alter table public.submissions` before that table existed.
--   2. It re-added collection columns already added by
--      20261010203000_managed_tenant_foundation.sql, with an incompatible type
--      (collected_by text vs collected_by uuid). Running first would have
--      silently made the `add column if not exists` a no-op and left a text
--      column that mark_submission_collected(uuid auth.uid()) cannot write.
--
-- The only artifact unique to 0001 was this index, preserved here verbatim.
-- Idempotent and additive; safe on any schema state.

create index if not exists submissions_store_collection_idx
  on public.submissions (store_id, collection_status);
