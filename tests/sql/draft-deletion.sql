-- Run through the connected Vertex Supabase execute_sql tool.
-- All fixtures, side effects and retired IDs are rolled back. No Auth accounts
-- or Storage objects are created; existing competitions are never edited.
begin;
set local statement_timeout = '15s';
do $$
declare
  owner_id uuid; participant_id uuid; organisation_id uuid; actor uuid;
  draft_id uuid := gen_random_uuid(); shared_id uuid := gen_random_uuid();
  fixture_round_id uuid := gen_random_uuid(); fresh_id uuid := gen_random_uuid();
  prepared jsonb; before_count integer; before_storage integer; before_retired integer;
  confirmation text := 'Codex rollback deletion fixture';
  fixture_banner_path text;
begin
  select p.id into owner_id from public.profiles p join auth.users u on u.id = p.id where u.email = 'john@example.com' and p.account_type = 'organiser';
  select p.id into participant_id from public.profiles p join auth.users u on u.id = p.id where u.email = 'rishit@example.com' and p.account_type = 'participant';
  select p.id into organisation_id from public.profiles p join auth.users u on u.id = p.id where u.email = 'socra@example.com' and p.account_type = 'organisation';
  if owner_id is null or participant_id is null or organisation_id is null then raise exception 'Authorized existing profiles are unavailable.'; end if;
  select count(*) into before_count from public.competitions;
  select count(*) into before_storage from storage.objects;
  select count(*) into before_retired from vertex_private.deleted_competition_ids;
  insert into public.competitions(id,owner_id,name,slug) values(draft_id,owner_id,confirmation,'codex-rollback-'||draft_id::text);
  insert into public.competition_rounds(id,competition_id,name,slug,sequence,advancement_count) values(fixture_round_id,draft_id,'Final','final',1,3);
  insert into public.round_scoring_criteria(id,round_id,name,max_marks,position) values(gen_random_uuid(),fixture_round_id,'Clarity',10,1);

  -- Role permissions apply, even with a valid owner JWT claim.
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  execute 'set local role anon';
  begin
    perform public.prepare_draft_competition_deletion(draft_id,1,confirmation);
    raise exception 'Anonymous execution unexpectedly succeeded.' using errcode = 'ZX001';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set local role authenticated';
  begin
    delete from public.competitions where id = draft_id;
    raise exception 'Direct DELETE unexpectedly succeeded.' using errcode = 'ZX001';
  exception when insufficient_privilege then null; end;
  begin
    perform public.prepare_draft_competition_deletion(draft_id,1,'wrong name');
    raise exception 'Incorrect name unexpectedly succeeded.' using errcode = 'ZX001';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.prepare_draft_competition_deletion(draft_id,99,confirmation);
    raise exception 'Stale version unexpectedly succeeded.' using errcode = 'ZX001';
  exception when sqlstate 'PT409' then null; end;
  foreach actor in array array[participant_id,organisation_id] loop
    perform set_config('request.jwt.claim.sub',actor::text,true);
    begin
      perform public.prepare_draft_competition_deletion(draft_id,1,confirmation);
      raise exception 'Non-organiser deletion unexpectedly succeeded.' using errcode = 'ZX001';
    exception when insufficient_privilege then null; end;
  end loop;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  if not vertex_private.competition_art_upload_allowed(owner_id::text||'/'||fresh_id::text||'/'||gen_random_uuid()::text||'.png','competition-banners') then
    raise exception 'Initial pre-save banner upload was incorrectly blocked.';
  end if;
  if vertex_private.competition_art_upload_allowed('malformed/path','competition-banners') then raise exception 'Malformed upload path accepted.'; end if;
  execute 'reset role';

  -- Retained activity prevents even the real owner from deleting.
  insert into public.competition_bookmarks(participant_id,competition_id) values(participant_id,draft_id);
  execute 'set local role authenticated';
  begin
    perform public.prepare_draft_competition_deletion(draft_id,1,confirmation);
    raise exception 'Draft with history unexpectedly accepted.' using errcode = 'ZX001';
  exception when sqlstate 'PT409' then null; end;
  execute 'reset role';
  delete from public.competition_bookmarks where competition_id = draft_id;
  update public.competitions set status = 'published',published_at = now() where id = draft_id;
  execute 'set local role authenticated';
  begin
    perform public.prepare_draft_competition_deletion(draft_id,1,confirmation);
    raise exception 'Published competition unexpectedly accepted.' using errcode = 'ZX001';
  exception when sqlstate 'PT409' then null; end;
  execute 'reset role';
  update public.competitions set status = 'draft',published_at = null where id = draft_id;

  -- A rollback-only permission fixture makes John a manager of another owner's
  -- row. No new profile is needed; this does not test the creation wizard.
  insert into public.competitions(id,owner_id,name,slug) values(shared_id,organisation_id,confirmation,'codex-manager-rollback-'||shared_id::text);
  insert into public.competition_organisers(competition_id,organiser_id) values(shared_id,owner_id);
  execute 'set local role authenticated';
  if not public.can_manage_competition(shared_id) then raise exception 'Manager permission fixture failed.'; end if;
  begin
    perform public.prepare_draft_competition_deletion(shared_id,1,confirmation);
    raise exception 'Manager deletion unexpectedly accepted.' using errcode = 'ZX001';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  -- Reference metadata exercises detach/version logic without uploading artwork.
  fixture_banner_path := owner_id::text||'/'||draft_id::text||'/'||gen_random_uuid()::text||'.png';
  update public.competitions set banner_kind = 'image',banner_path = fixture_banner_path where id = draft_id;
  execute 'set local role authenticated';
  if vertex_private.competition_banner_delete_allowed(fixture_banner_path) then raise exception 'Referenced banner cleanup allowed.'; end if;
  prepared := public.prepare_draft_competition_deletion(draft_id,1,confirmation);
  if prepared->'banner_paths' <> '[]'::jsonb or (prepared->'competition'->>'version')::integer <> 2
    or prepared->'competition'->>'banner_kind' <> 'colour' then raise exception 'Unexpected preparation result.'; end if;
  if not vertex_private.competition_banner_delete_allowed(fixture_banner_path) then raise exception 'Unreferenced owned banner cleanup blocked.'; end if;
  execute 'reset role';
  update public.competitions set version = 3 where id = draft_id;
  execute 'set local role authenticated';
  begin
    perform public.delete_draft_competition(draft_id,2,confirmation);
    raise exception 'Concurrent-edit version check failed.' using errcode = 'ZX001';
  exception when sqlstate 'PT409' then null; end;
  perform public.delete_draft_competition(draft_id,3,confirmation);
  if vertex_private.competition_art_upload_allowed(owner_id::text||'/'||draft_id::text||'/'||gen_random_uuid()::text||'.png','competition-banners') then raise exception 'Late upload accepted for deleted ID.'; end if;
  execute 'reset role';
  if exists(select 1 from public.competitions c where c.id = draft_id)
    or exists(select 1 from public.competition_rounds r where r.id = fixture_round_id)
    or exists(select 1 from public.round_scoring_criteria s where s.round_id = fixture_round_id) then raise exception 'Draft configuration did not cascade.'; end if;
  if not exists(select 1 from vertex_private.deleted_competition_ids where id = draft_id) then raise exception 'Deleted ID not retired.'; end if;
  begin
    insert into public.competitions(id,owner_id,name,slug) values(draft_id,owner_id,confirmation,'codex-recreate-'||draft_id::text);
    raise exception 'Deleted draft ID recreated.' using errcode = 'ZX001';
  exception when sqlstate 'PT409' then null; end;
  if (select count(*) from public.competitions) <> before_count+1
    or (select count(*) from storage.objects) <> before_storage
    or (select count(*) from vertex_private.deleted_competition_ids) <> before_retired+1 then raise exception 'Unexpected fixture side effects.'; end if;
end;
$$;
rollback;
select 'PASS: owner deletion, role denials, history/publication/version protections, cascades and retired-ID upload/recreation guards; all fixtures rolled back.' as result;
