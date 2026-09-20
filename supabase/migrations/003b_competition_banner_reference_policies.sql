-- Qualify outer Storage names; competitions also has a name column.
begin;
alter policy competition_banners_read on storage.objects using (
  bucket_id = 'competition-banners' and (
    owner_id = (select auth.uid())::text or exists(
      select 1 from public.competitions c where c.status = 'published' and c.banner_path = storage.objects.name
    )
  )
);
alter policy competition_banners_delete on storage.objects using (
  bucket_id = 'competition-banners' and owner_id = (select auth.uid())::text
  and split_part(storage.objects.name,'/',1) = (select auth.uid())::text
  and not exists(select 1 from public.competitions c where c.banner_path = storage.objects.name)
);
commit;
