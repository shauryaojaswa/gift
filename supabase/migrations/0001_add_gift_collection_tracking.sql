-- Migration: add gift-collection tracking to submissions
-- Idempotent & additive. Safe to run on an existing project; no data is dropped.
-- Adds an "awaiting -> collected" collection state (with timestamp + staff) used
-- by the client dashboard to mark a customer's gift as collected at the counter.

alter table public.submissions
  add column if not exists collection_status text not null default 'awaiting',
  add column if not exists collected_at      timestamptz,
  add column if not exists collected_by      text;

-- Only two valid states.
alter table public.submissions
  drop constraint if exists submissions_collection_status_check;
alter table public.submissions
  add constraint submissions_collection_status_check
  check (collection_status in ('awaiting', 'collected'));

-- Fast "awaiting collection" counts on the client dashboard.
create index if not exists submissions_store_collection_idx
  on public.submissions (store_id, collection_status);

-- Backfill any pre-existing rows to the awaiting state (no-op for new rows).
update public.submissions
   set collection_status = 'awaiting'
 where collection_status is null;
