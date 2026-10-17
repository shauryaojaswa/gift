-- Fix: store-logo storage RLS never allowed shop owners to upload/replace
-- their own logo (owner in-app upload was denied with
-- "new row violates row-level security policy").
--
-- Root cause: the policies' EXISTS subquery aliases `public.stores` as `s`,
-- and the bare column reference `name` inside `storage.foldername(name)`
-- resolved to `s.name` (the shop's display name, e.g. 'Shree Jewellers')
-- instead of `storage.objects.name` (the object path). The comparison
-- `s.id::text = (storage.foldername('Shree Jewellers'))[1]` was therefore
-- always NULL/false, so the owner branch of the policy never passed; only the
-- `is_platform_admin()` branch worked.
--
-- Fix: qualify the object-path column explicitly as `storage.objects.name`
-- in both the INSERT policy's WITH CHECK and the UPDATE policy's USING /
-- WITH CHECK. No data is touched; this only corrects the policy predicate so
-- `store-logos/{storeId}/...` objects are writable by that shop's own admins
-- (tenant isolation preserved: the folder must match the store id).
--
-- Rollback (restore the previous, defective policies):
--   drop policy "Store users can upload own logo" on storage.objects;
--   drop policy "Store users can update own logo" on storage.objects;
--   create policy "Store users can upload own logo" on storage.objects for
--     insert to authenticated with check (
--       bucket_id = 'store-logos' and (public.is_platform_admin() or exists (
--         select 1 from public.stores s
--         where s.id::text = (storage.foldername(s.name))[1]
--           and public.is_store_admin(s.id))));
--   create policy "Store users can update own logo" on storage.objects for
--     update to authenticated
--     using (bucket_id = 'store-logos' and (public.is_platform_admin() or exists (
--       select 1 from public.stores s
--       where s.id::text = (storage.foldername(s.name))[1]
--         and public.is_store_admin(s.id))))
--     with check (bucket_id = 'store-logos' and (public.is_platform_admin() or exists (
--       select 1 from public.stores s
--       where s.id::text = (storage.foldername(s.name))[1]
--         and public.is_store_admin(s.id))));

drop policy if exists "Store users can upload own logo" on storage.objects;
create policy "Store users can upload own logo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'store-logos'
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.stores s
        where s.id::text = (storage.foldername(storage.objects.name))[1]
          and public.is_store_admin(s.id)
      )
    )
  );

drop policy if exists "Store users can update own logo" on storage.objects;
create policy "Store users can update own logo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'store-logos'
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.stores s
        where s.id::text = (storage.foldername(storage.objects.name))[1]
          and public.is_store_admin(s.id)
      )
    )
  )
  with check (
    bucket_id = 'store-logos'
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.stores s
        where s.id::text = (storage.foldername(storage.objects.name))[1]
          and public.is_store_admin(s.id)
      )
    )
  );
