-- Serialize unreferenced banner removal with save, upload and draft deletion.
begin;
create function vertex_private.competition_banner_delete_allowed(object_path text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); comp uuid; segment text := split_part(object_path,'/',2);
begin
  if actor is null or segment is null or segment !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  comp := segment::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(comp::text,0));
  if split_part(object_path,'/',1) <> actor::text and not public.can_manage_competition(comp) then return false; end if;
  return not exists(select 1 from public.competitions c where c.banner_path = object_path);
end;
$$;
revoke all on function vertex_private.competition_banner_delete_allowed(text) from public,anon;
grant execute on function vertex_private.competition_banner_delete_allowed(text) to authenticated;
alter policy competition_banners_delete on storage.objects using (
  bucket_id = 'competition-banners' and owner_id = (select auth.uid())::text
  and split_part(storage.objects.name,'/',1) = (select auth.uid())::text
  and vertex_private.competition_banner_delete_allowed(storage.objects.name)
);
alter policy competition_banners_delete_managers on storage.objects using (
  bucket_id = 'competition-banners' and exists(
    select 1 from public.competitions c where c.id::text = split_part(storage.objects.name,'/',2)
      and public.can_manage_competition(c.id)
  ) and vertex_private.competition_banner_delete_allowed(storage.objects.name)
);
commit;
