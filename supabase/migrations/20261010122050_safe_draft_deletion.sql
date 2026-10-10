-- Human-centred refinement: owner-only removal of unused, unpublished drafts.
begin;

-- Retain only retired IDs, preventing stale first-save/upload requests from
-- recreating a deleted draft. No application role can read or write this table.
create table vertex_private.deleted_competition_ids (
  id uuid primary key,
  deleted_at timestamptz not null default now()
);
alter table vertex_private.deleted_competition_ids enable row level security;
revoke all on vertex_private.deleted_competition_ids from public, anon, authenticated;

create function vertex_private.guard_retired_competition_id() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.id::text, 0));
  if exists (select 1 from vertex_private.deleted_competition_ids where id = new.id) then
    raise exception 'This draft was deleted. Create a new competition instead.' using errcode = 'PT409';
  end if;
  return new;
end;
$$;
revoke all on function vertex_private.guard_retired_competition_id() from public, anon, authenticated;
create trigger guard_retired_competition_id before insert on public.competitions
  for each row execute function vertex_private.guard_retired_competition_id();

-- Share the authoring RPC's ID lock with Storage insertion and deletion. Initial
-- banner uploads precede the first save, so valid new IDs must remain usable.
create function vertex_private.competition_art_upload_allowed(object_path text, object_bucket text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare comp uuid; actor uuid := auth.uid(); segment text;
begin
  if actor is null then return false; end if;
  if object_bucket = 'competition-banners' then
    if split_part(object_path, '/', 1) <> actor::text or not exists (
      select 1 from public.profiles where id = actor and account_type = 'organiser'
    ) then return false; end if;
    segment := split_part(object_path, '/', 2);
  elsif object_bucket = 'certificate-templates' then
    segment := split_part(object_path, '/', 1);
  else return false;
  end if;
  if segment is null or segment !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  comp := segment::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(comp::text, 0));
  if exists (select 1 from vertex_private.deleted_competition_ids where id = comp) then return false; end if;
  if exists (select 1 from public.competitions where id = comp) then
    return public.can_manage_competition(comp);
  end if;
  return object_bucket = 'competition-banners';
end;
$$;
revoke all on function vertex_private.competition_art_upload_allowed(text,text) from public, anon;
grant execute on function vertex_private.competition_art_upload_allowed(text,text) to authenticated;

alter policy competition_banners_insert on storage.objects with check (
  bucket_id = 'competition-banners' and owner_id = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif)$'
  and vertex_private.competition_art_upload_allowed(storage.objects.name, storage.objects.bucket_id)
);
-- A restrictive policy serializes template uploads without broadening existing
-- template ownership, release or path checks. Other buckets are unaffected.
create policy competition_art_insert_serialization on storage.objects as restrictive
  for insert to authenticated with check (
    bucket_id not in ('competition-banners','certificate-templates')
    or vertex_private.competition_art_upload_allowed(storage.objects.name, storage.objects.bucket_id)
  );

-- Explicit outer-column qualification repairs legacy manager policies. Managers
-- can read their competition's orphan artwork so Storage API cleanup can see it.
alter policy competition_banners_read_managers on storage.objects using (
  bucket_id = 'competition-banners' and exists (
    select 1 from public.competitions c
    where c.id::text = split_part(storage.objects.name, '/', 2)
      and public.can_manage_competition(c.id)
  )
);
alter policy competition_banners_delete_managers on storage.objects using (
  bucket_id = 'competition-banners' and exists (
    select 1 from public.competitions c
    where c.id::text = split_part(storage.objects.name, '/', 2)
      and public.can_manage_competition(c.id)
  ) and not exists (
    select 1 from public.competitions c where c.banner_path = storage.objects.name
  )
);

create function vertex_private.assert_deletable_draft(
  target_competition_id uuid, expected_version integer, confirmation_name text
) returns public.competitions language plpgsql security definer set search_path = '' as $$
declare c public.competitions;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and account_type = 'organiser'
  ) then raise exception 'Only the organiser who owns this draft can delete it.' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_competition_id::text, 0));
  select * into c from public.competitions where id = target_competition_id for update;
  if c.id is null or c.owner_id <> auth.uid() then
    raise exception 'Only the organiser who owns this draft can delete it.' using errcode = '42501';
  end if;
  if c.status <> 'draft' or c.published_at is not null then
    raise exception 'Published competitions cannot be deleted. Their entries, results and certificates are retained.' using errcode = 'PT409';
  end if;
  if expected_version is distinct from c.version then
    raise exception 'This draft changed in another tab. Reopen it before deleting.' using errcode = 'PT409';
  end if;
  if confirmation_name is distinct from c.name then
    raise exception 'Type the saved competition name exactly to confirm deletion.' using errcode = '22023';
  end if;
  if exists (select 1 from public.competition_organisers where competition_id = c.id)
    or exists (select 1 from public.competition_organiser_invitations where competition_id = c.id)
    or exists (select 1 from public.individual_registrations where competition_id = c.id)
    or exists (select 1 from public.competition_teams where competition_id = c.id)
    or exists (select 1 from public.competition_team_members where competition_id = c.id)
    or exists (select 1 from public.competition_team_invitations where competition_id = c.id)
    or exists (select 1 from public.competition_bookmarks where competition_id = c.id)
    or exists (select 1 from public.competition_announcements where competition_id = c.id)
    or exists (select 1 from public.competition_questions where competition_id = c.id)
    or exists (select 1 from public.competition_meetings where competition_id = c.id)
    or exists (select 1 from public.notifications where competition_id = c.id)
    or exists (select 1 from public.certificate_templates where competition_id = c.id)
    or exists (select 1 from public.competition_certificate_settings where competition_id = c.id and (enabled or released_at is not null))
    or exists (select 1 from vertex_private.deadline_reminders where competition_id = c.id)
    or exists (
      select 1 from public.competition_rounds r where r.competition_id = c.id and (
        r.status <> 'upcoming' or r.judging_state <> 'not_started'
        or r.leaderboard_state <> 'unpublished' or r.leaderboard_published_at is not null
        or exists (select 1 from public.round_submissions s where s.round_id = r.id)
        or exists (select 1 from public.round_scores s where s.round_id = r.id)
        or exists (select 1 from public.round_advancement_decisions d where d.round_id = r.id)
        or exists (select 1 from public.round_advancement_records a where a.round_id = r.id)
        or exists (select 1 from public.round_participant_eligibility e where e.round_id = r.id)
        or exists (select 1 from public.round_category_winners w where w.round_id = r.id)
      )
    ) then
    raise exception 'This draft has collaborators, entries or retained activity. Remove unused configuration separately; competition history cannot be deleted.' using errcode = 'PT409';
  end if;
  if c.banner_path is not null and (split_part(c.banner_path,'/',2) <> c.id::text or exists (
    select 1 from public.competitions other where other.id <> c.id and other.banner_path = c.banner_path
  )) then raise exception 'This banner is shared or has an unexpected path. Draft deletion is blocked.' using errcode = 'PT409'; end if;
  if exists (select 1 from storage.objects o where
    (o.bucket_id = 'certificate-templates' and split_part(o.name,'/',1) = c.id::text)
    or (o.bucket_id = 'submissions' and split_part(o.name,'/',1) in (
      select r.id::text from public.competition_rounds r where r.competition_id = c.id
    ))
  ) then raise exception 'Remove unused certificate artwork before deleting this draft. Submission artwork and history are protected.' using errcode = 'PT409'; end if;
  return c;
end;
$$;
revoke all on function vertex_private.assert_deletable_draft(uuid,integer,text) from public, anon, authenticated;

create function vertex_private.prepare_draft_deletion(
  target_competition_id uuid, expected_version integer, confirmation_name text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.competitions; paths jsonb;
begin
  c := vertex_private.assert_deletable_draft(target_competition_id,expected_version,confirmation_name);
  -- Detach before the Storage API can remove referenced banner artwork. Failed
  -- cleanup leaves a recoverable draft; a retry scans all paths again.
  if c.banner_path is not null then
    update public.competitions set banner_path = null, banner_kind = 'colour',
      version = version + 1, updated_at = now() where id = c.id returning * into c;
  end if;
  select coalesce(jsonb_agg(o.name order by o.name),'[]'::jsonb) into paths
    from storage.objects o where o.bucket_id = 'competition-banners'
      and split_part(o.name,'/',2) = c.id::text;
  return jsonb_build_object('competition',to_jsonb(c),'banner_paths',paths);
end;
$$;
create function vertex_private.finish_draft_deletion(
  target_competition_id uuid, expected_version integer, confirmation_name text
) returns void language plpgsql security definer set search_path = '' as $$
declare c public.competitions;
begin
  c := vertex_private.assert_deletable_draft(target_competition_id,expected_version,confirmation_name);
  if c.banner_path is not null or exists (
    select 1 from storage.objects o where o.bucket_id = 'competition-banners'
      and split_part(o.name,'/',2) = c.id::text
  ) then raise exception 'Unused banner images still need removal. Retry deletion after Storage cleanup.' using errcode = 'PT409'; end if;
  insert into vertex_private.deleted_competition_ids(id) values(c.id);
  delete from public.competitions where id = c.id;
end;
$$;
revoke all on function vertex_private.prepare_draft_deletion(uuid,integer,text),
  vertex_private.finish_draft_deletion(uuid,integer,text) from public, anon;
grant execute on function vertex_private.prepare_draft_deletion(uuid,integer,text),
  vertex_private.finish_draft_deletion(uuid,integer,text) to authenticated;

-- Exposed wrappers run as the caller. Elevation stays in guarded private helpers.
grant usage on schema vertex_private to authenticated;
create function public.prepare_draft_competition_deletion(
  target_competition_id uuid, expected_version integer, confirmation_name text
) returns jsonb language sql security invoker set search_path = '' as $$
  select vertex_private.prepare_draft_deletion(target_competition_id,expected_version,confirmation_name);
$$;
create function public.delete_draft_competition(
  target_competition_id uuid, expected_version integer, confirmation_name text
) returns void language sql security invoker set search_path = '' as $$
  select vertex_private.finish_draft_deletion(target_competition_id,expected_version,confirmation_name);
$$;
revoke all on function public.prepare_draft_competition_deletion(uuid,integer,text),
  public.delete_draft_competition(uuid,integer,text) from public, anon;
grant execute on function public.prepare_draft_competition_deletion(uuid,integer,text),
  public.delete_draft_competition(uuid,integer,text) to authenticated;

commit;
