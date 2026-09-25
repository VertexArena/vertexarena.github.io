-- Per-round submission rules, atomic entry records, and private file access.
begin;

create table public.round_submission_configs (
  round_id uuid primary key references public.competition_rounds(id) on delete cascade,
  enabled boolean not null default false,
  mode text not null check (mode in ('file', 'link', 'mixed')),
  allowed_mime_types text[] not null default '{}',
  max_file_bytes bigint not null default 0 check (max_file_bytes between 0 and 26214400),
  instructions text not null default '' check (length(instructions) <= 5000),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  allow_edits boolean not null default true,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  check (opens_at < closes_at),
  check (isfinite(opens_at) and isfinite(closes_at)),
  check (cardinality(allowed_mime_types) <= 20),
  check ((mode = 'link' and cardinality(allowed_mime_types) = 0 and max_file_bytes = 0)
    or (mode in ('file', 'mixed') and cardinality(allowed_mime_types) > 0 and max_file_bytes between 1 and 26214400))
);
create index round_submission_configs_closes_idx on public.round_submission_configs (closes_at) where enabled;

create table public.round_submissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.competition_rounds(id) on delete cascade,
  participant_id uuid references public.profiles(id) on delete cascade,
  team_id uuid references public.competition_teams(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id),
  first_submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  check ((participant_id is null) <> (team_id is null))
);
create unique index round_submissions_person_unique on public.round_submissions (round_id, participant_id) where participant_id is not null;
create unique index round_submissions_team_unique on public.round_submissions (round_id, team_id) where team_id is not null;
create index round_submissions_round_date_idx on public.round_submissions (round_id, updated_at desc);
create index round_submissions_person_idx on public.round_submissions (participant_id) where participant_id is not null;
create index round_submissions_team_idx on public.round_submissions (team_id) where team_id is not null;
create index round_submissions_submitter_idx on public.round_submissions (submitted_by);

create table public.round_submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.round_submissions(id) on delete cascade,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  original_name text not null check (length(btrim(original_name)) between 1 and 255 and original_name !~ '[[:cntrl:]]'),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index round_submission_files_submission_idx on public.round_submission_files (submission_id);
create index round_submission_files_uploader_idx on public.round_submission_files (uploaded_by);

create table public.round_submission_links (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.round_submissions(id) on delete cascade,
  url text not null check (length(url) between 8 and 2048 and url ~ '^https?://[^[:space:]]+$'),
  created_at timestamptz not null default now()
);
create index round_submission_links_submission_idx on public.round_submission_links (submission_id);

create function public.can_view_round_submission_config(target_round_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.competition_rounds r join public.competitions c on c.id = r.competition_id
    where r.id = target_round_id and (
      public.can_manage_competition(c.id)
      or (c.status = 'published' and (
        exists (select 1 from public.individual_registrations i
          where i.competition_id = c.id and i.participant_id = auth.uid())
        or exists (select 1 from public.competition_team_members m
          join public.competition_teams t on t.id = m.team_id and t.registered_at is not null
          where m.competition_id = c.id and m.participant_id = auth.uid())
      ))
    )
  );
$$;

create function public.can_read_round_submission(target_submission_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.round_submissions s
    join public.competition_rounds r on r.id = s.round_id
    where s.id = target_submission_id and (
      public.can_manage_competition(r.competition_id)
      or s.participant_id = auth.uid()
      or exists (select 1 from public.competition_team_members m
        where m.team_id = s.team_id and m.participant_id = auth.uid())
    )
  );
$$;

create function public.can_upload_round_submission_file(object_name text, object_size bigint, object_mime text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  round_text text := split_part(object_name, '/', 1);
  person_text text := split_part(object_name, '/', 2);
  file_text text := split_part(object_name, '/', 3);
  target_round_id uuid;
begin
  if actor is null or round_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or person_text <> actor::text
      or file_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or object_name <> round_text || '/' || person_text || '/' || file_text
      or object_size is null or object_size < 1 or object_size > 26214400 or object_mime is null then
    return false;
  end if;
  target_round_id := round_text::uuid;
  return exists (
    select 1 from public.round_submission_configs cfg
    join public.competition_rounds r on r.id = cfg.round_id
    join public.competitions c on c.id = r.competition_id
    where cfg.round_id = target_round_id and cfg.enabled and cfg.mode in ('file','mixed')
      and c.status = 'published' and now() >= cfg.opens_at and now() < cfg.closes_at
      and object_size <= cfg.max_file_bytes and object_mime = any(cfg.allowed_mime_types)
      and (
        exists (select 1 from public.individual_registrations i
          where i.competition_id = c.id and i.participant_id = actor)
        or exists (select 1 from public.competition_teams t
          where t.competition_id = c.id and t.captain_id = actor and t.registered_at is not null)
      )
  );
end;
$$;

alter table public.round_submission_configs enable row level security;
alter table public.round_submissions enable row level security;
alter table public.round_submission_files enable row level security;
alter table public.round_submission_links enable row level security;
revoke all on public.round_submission_configs, public.round_submissions,
  public.round_submission_files, public.round_submission_links from public, anon, authenticated;
grant select on public.round_submission_configs, public.round_submissions,
  public.round_submission_files, public.round_submission_links to authenticated;
create policy round_submission_configs_read on public.round_submission_configs for select to authenticated
  using (public.can_view_round_submission_config(round_id));
create policy round_submissions_read on public.round_submissions for select to authenticated
  using (public.can_read_round_submission(id));
create policy round_submission_files_read on public.round_submission_files for select to authenticated
  using (public.can_read_round_submission(submission_id));
create policy round_submission_links_read on public.round_submission_links for select to authenticated
  using (public.can_read_round_submission(submission_id));

revoke all on function public.can_view_round_submission_config(uuid),
  public.can_read_round_submission(uuid),
  public.can_upload_round_submission_file(text,bigint,text) from public, anon;
grant execute on function public.can_view_round_submission_config(uuid),
  public.can_read_round_submission(uuid),
  public.can_upload_round_submission_file(text,bigint,text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 26214400, null)
on conflict (id) do update set public = false, file_size_limit = 26214400, allowed_mime_types = null;
create policy submissions_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'submissions' and owner_id = (select auth.uid())::text
  and public.can_upload_round_submission_file(name, (metadata->>'size')::bigint, metadata->>'mimetype')
);
create policy submissions_select on storage.objects for select to authenticated using (
  bucket_id = 'submissions' and (
    (owner_id = (select auth.uid())::text and split_part(name, '/', 2) = (select auth.uid())::text)
    or exists (select 1 from public.round_submission_files f
      where f.storage_path = storage.objects.name and public.can_read_round_submission(f.submission_id))
  )
);
create policy submissions_delete_unreferenced on storage.objects for delete to authenticated using (
  bucket_id = 'submissions' and owner_id = (select auth.uid())::text
  and split_part(name, '/', 2) = (select auth.uid())::text
  and not exists (select 1 from public.round_submission_files f where f.storage_path = storage.objects.name)
);

create function public.save_round_submission_config(
  target_round_id uuid, submission_enabled boolean, submission_mode text,
  mime_types text[], file_limit_bytes bigint, submission_instructions text,
  submission_opens_at timestamptz, submission_closes_at timestamptz, edits_allowed boolean
)
returns public.round_submission_configs language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.competition_rounds;
  old_config public.round_submission_configs;
  saved public.round_submission_configs;
  cleaned_mimes text[] := array(select distinct lower(btrim(v)) from unnest(coalesce(mime_types, '{}'::text[])) v where btrim(v) <> '' order by 1);
begin
  select * into r from public.competition_rounds where id = target_round_id for share;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can configure round submissions.' using errcode = '42501';
  end if;
  if submission_mode not in ('file','link','mixed') or submission_mode is null then
    raise exception 'Choose files, links, or both.' using errcode = '23514';
  end if;
  if submission_opens_at is null or submission_closes_at is null
      or not isfinite(submission_opens_at) or not isfinite(submission_closes_at)
      or submission_opens_at < r.opens_at or submission_closes_at > r.submission_deadline
      or submission_opens_at >= submission_closes_at then
    raise exception 'Submission dates must fit inside the round opening and deadline.' using errcode = '23514';
  end if;
  if length(coalesce(submission_instructions, '')) > 5000 then
    raise exception 'Instructions must be at most 5000 characters.' using errcode = '23514';
  end if;
  if submission_mode = 'link' then
    cleaned_mimes := '{}'::text[];
    file_limit_bytes := 0;
  elsif file_limit_bytes is null or file_limit_bytes < 1 or file_limit_bytes > 26214400
      or cardinality(cleaned_mimes) not between 1 and 20
      or exists (select 1 from unnest(cleaned_mimes) m
        where m !~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$') then
    raise exception 'Set 1–20 valid MIME types and a file limit no higher than 25 MB.' using errcode = '23514';
  end if;
  select * into old_config from public.round_submission_configs where round_id = r.id for update;
  if old_config.round_id is not null and exists (
    select 1 from public.round_submissions s where s.round_id = r.id
  ) and (old_config.mode <> submission_mode or old_config.allowed_mime_types <> cleaned_mimes
      or old_config.max_file_bytes <> file_limit_bytes or old_config.opens_at <> submission_opens_at
      or submission_closes_at < old_config.closes_at) then
    raise exception 'Submitted work locks format, file rules, and opening time. You may extend the close time.' using errcode = '23514';
  end if;
  insert into public.round_submission_configs
    (round_id, enabled, mode, allowed_mime_types, max_file_bytes, instructions, opens_at, closes_at, allow_edits, updated_by)
  values (r.id, coalesce(submission_enabled,false), submission_mode, cleaned_mimes, file_limit_bytes,
    coalesce(submission_instructions,''), submission_opens_at, submission_closes_at, coalesce(edits_allowed,true), auth.uid())
  on conflict (round_id) do update set enabled = excluded.enabled, mode = excluded.mode,
    allowed_mime_types = excluded.allowed_mime_types, max_file_bytes = excluded.max_file_bytes,
    instructions = excluded.instructions, opens_at = excluded.opens_at, closes_at = excluded.closes_at,
    allow_edits = excluded.allow_edits, updated_by = excluded.updated_by, updated_at = now()
  returning * into saved;
  return saved;
end;
$$;

create function public.save_round_submission(
  target_round_id uuid, target_team_id uuid default null, file_items jsonb default '[]'::jsonb,
  link_urls text[] default '{}'::text[], expected_version integer default null
)
returns public.round_submissions language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  cfg public.round_submission_configs;
  r public.competition_rounds;
  c public.competitions;
  current_submission public.round_submissions;
  saved public.round_submissions;
  item jsonb;
  object_row storage.objects;
  file_path text;
  file_name text;
  link text;
  old_paths text[];
begin
  if actor is null then raise exception 'Log in to submit round work.' using errcode = '42501'; end if;
  select * into cfg from public.round_submission_configs where round_id = target_round_id for share;
  select * into r from public.competition_rounds where id = target_round_id;
  select * into c from public.competitions where id = r.competition_id;
  if cfg.round_id is null or not cfg.enabled or c.status <> 'published' then
    raise exception 'Submissions are not enabled for this round.' using errcode = '23514';
  end if;
  if now() < cfg.opens_at or now() >= cfg.closes_at then
    raise exception 'Submission window is closed.' using errcode = '23514';
  end if;
  if target_team_id is null then
    if not exists (select 1 from public.individual_registrations i
      where i.competition_id = c.id and i.participant_id = actor) then
      raise exception 'Only registered individual entrants can submit individual work.' using errcode = '42501';
    end if;
  elsif not exists (select 1 from public.competition_teams t
    where t.id = target_team_id and t.competition_id = c.id
      and t.captain_id = actor and t.registered_at is not null) then
    raise exception 'Only the registered team captain can submit team work.' using errcode = '42501';
  end if;
  if file_items is null or jsonb_typeof(file_items) <> 'array'
      or jsonb_array_length(file_items) > 20 or cardinality(coalesce(link_urls, '{}'::text[])) > 20 then
    raise exception 'Use at most 20 files and 20 links.' using errcode = '23514';
  end if;
  if (cfg.mode = 'file' and (jsonb_array_length(file_items) = 0 or cardinality(coalesce(link_urls, '{}'::text[])) > 0))
      or (cfg.mode = 'link' and (cardinality(coalesce(link_urls, '{}'::text[])) = 0 or jsonb_array_length(file_items) > 0))
      or (cfg.mode = 'mixed' and jsonb_array_length(file_items) + cardinality(coalesce(link_urls, '{}'::text[])) = 0) then
    raise exception 'Provide the file or link content required by this round.' using errcode = '23514';
  end if;
  if target_team_id is null then
    select * into current_submission from public.round_submissions
    where round_id = r.id and participant_id = actor for update;
  else
    select * into current_submission from public.round_submissions
    where round_id = r.id and team_id = target_team_id for update;
  end if;
  if current_submission.id is not null and (not cfg.allow_edits or expected_version is distinct from current_submission.version) then
    raise exception 'This submission cannot be edited, or it changed in another window.' using errcode = '23514';
  end if;
  if current_submission.id is null and expected_version is not null then
    raise exception 'Reload this round before submitting.' using errcode = '23514';
  end if;
  for item in select value from jsonb_array_elements(file_items) loop
    if jsonb_typeof(item) <> 'object' then raise exception 'Invalid file details.' using errcode = '23514'; end if;
    file_path := item->>'path'; file_name := btrim(item->>'name');
    if file_path is null or file_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'
        or split_part(file_path,'/',1) <> r.id::text or split_part(file_path,'/',2) <> actor::text
        or file_name is null or length(file_name) not between 1 and 255 or file_name ~ '[[:cntrl:]]' then
      raise exception 'Invalid uploaded file details.' using errcode = '23514';
    end if;
    select * into object_row from storage.objects o
      where o.bucket_id = 'submissions' and o.name = file_path and o.owner_id = actor::text;
    if object_row.id is null or object_row.metadata->>'size' !~ '^[0-9]+$'
        or (object_row.metadata->>'size')::bigint not between 1 and cfg.max_file_bytes
        or (object_row.metadata->>'size')::bigint > 26214400
        or not (object_row.metadata->>'mimetype' = any(cfg.allowed_mime_types)) then
      raise exception 'A file is missing, too large, or has a type this round does not allow.' using errcode = '23514';
    end if;
    if exists (select 1 from public.round_submission_files f
      where f.storage_path = file_path and f.submission_id is distinct from current_submission.id) then
      raise exception 'This file belongs to another submission.' using errcode = '23505';
    end if;
  end loop;
  for link in select unnest(coalesce(link_urls, '{}'::text[])) loop
    if link is null or length(link) not between 8 and 2048 or link !~ '^https?://[^[:space:]]+$' then
      raise exception 'Use complete http:// or https:// links.' using errcode = '23514';
    end if;
  end loop;
  if current_submission.id is null then
    insert into public.round_submissions (round_id, participant_id, team_id, submitted_by)
    values (r.id, case when target_team_id is null then actor end, target_team_id, actor)
    returning * into saved;
  else
    saved := current_submission;
    select array_agg(storage_path) into old_paths from public.round_submission_files where submission_id = saved.id;
    delete from public.round_submission_files where submission_id = saved.id;
    delete from public.round_submission_links where submission_id = saved.id;
    update public.round_submissions set updated_at = now(), version = version + 1, submitted_by = actor
      where id = saved.id returning * into saved;
  end if;
  for item in select value from jsonb_array_elements(file_items) loop
    file_path := item->>'path'; file_name := btrim(item->>'name');
    select * into object_row from storage.objects o where o.bucket_id = 'submissions' and o.name = file_path;
    insert into public.round_submission_files (submission_id, storage_path, original_name, mime_type, size_bytes, uploaded_by)
    values (saved.id, file_path, file_name, object_row.metadata->>'mimetype', (object_row.metadata->>'size')::bigint, actor);
  end loop;
  for link in select unnest(coalesce(link_urls, '{}'::text[])) loop
    insert into public.round_submission_links (submission_id, url) values (saved.id, link);
  end loop;
  insert into public.notifications (recipient_id, competition_id, kind, title, body, link_path)
  select recipients.id, c.id, 'submission_confirmed',
    case when current_submission.id is null then 'Submission confirmed' else 'Submission updated' end,
    r.name || ' work for ' || c.name || ' was ' || case when current_submission.id is null then 'submitted.' else 'updated.' end,
    '/competition/' || c.slug || '/submissions/' || r.slug
  from (
    select actor as id where target_team_id is null
    union
    select m.participant_id from public.competition_team_members m where m.team_id = target_team_id
  ) recipients;
  return saved;
end;
$$;

create function public.organiser_round_submission_review(
  target_round_id uuid, search_term text default '', status_filter text default 'all',
  entry_filter text default 'all', result_page integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  comp_id uuid;
  needle text := lower(btrim(coalesce(search_term,'')));
  page_number integer := least(greatest(coalesce(result_page,0),0),100000);
  total integer;
  rows jsonb;
begin
  select competition_id into comp_id from public.competition_rounds where id = target_round_id;
  if auth.uid() is null or comp_id is null or not public.can_manage_competition(comp_id) then
    raise exception 'Only competition organisers can review submissions.' using errcode = '42501';
  end if;
  if length(needle) > 100 or status_filter not in ('all','valid','late','missing')
      or entry_filter not in ('all','individual','team') then
    raise exception 'Invalid review filter.' using errcode = '23514';
  end if;
  with entries as (
    select 'individual'::text as entry_type, i.participant_id, null::uuid as team_id,
      p.full_name as name, p.username::text as username, i.created_at as registered_at
    from public.individual_registrations i join public.profiles p on p.id = i.participant_id
    where i.competition_id = comp_id
    union all
    select 'team', null::uuid, t.id, t.name, null::text, t.registered_at
    from public.competition_teams t where t.competition_id = comp_id and t.registered_at is not null
  ), joined as (
    select e.*, s.id as submission_id, s.first_submitted_at, s.updated_at,
      case when s.id is null then 'missing'
        when s.first_submitted_at >= cfg.closes_at then 'late' else 'valid' end as status
    from entries e left join public.round_submissions s on s.round_id = target_round_id
      and ((e.entry_type = 'individual' and s.participant_id = e.participant_id)
        or (e.entry_type = 'team' and s.team_id = e.team_id))
    left join public.round_submission_configs cfg on cfg.round_id = target_round_id
  )
  select count(*) into total from joined j
  where (needle = '' or lower(j.name) like '%' || needle || '%' or lower(coalesce(j.username,'')) like '%' || needle || '%')
    and (status_filter = 'all' or j.status = status_filter)
    and (entry_filter = 'all' or j.entry_type = entry_filter);
  with entries as (
    select 'individual'::text as entry_type, i.participant_id, null::uuid as team_id,
      p.full_name as name, p.username::text as username, i.created_at as registered_at
    from public.individual_registrations i join public.profiles p on p.id = i.participant_id
    where i.competition_id = comp_id
    union all
    select 'team', null::uuid, t.id, t.name, null::text, t.registered_at
    from public.competition_teams t where t.competition_id = comp_id and t.registered_at is not null
  ), joined as (
    select e.*, s.id as submission_id, s.first_submitted_at, s.updated_at,
      case when s.id is null then 'missing'
        when s.first_submitted_at >= cfg.closes_at then 'late' else 'valid' end as status
    from entries e left join public.round_submissions s on s.round_id = target_round_id
      and ((e.entry_type = 'individual' and s.participant_id = e.participant_id)
        or (e.entry_type = 'team' and s.team_id = e.team_id))
    left join public.round_submission_configs cfg on cfg.round_id = target_round_id
  )
  select coalesce(jsonb_agg(to_jsonb(item)), '[]'::jsonb) into rows from (
    select j.*,
      (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'path',f.storage_path,'name',f.original_name,
        'mime_type',f.mime_type,'size_bytes',f.size_bytes) order by f.created_at,f.id), '[]'::jsonb)
        from public.round_submission_files f where f.submission_id = j.submission_id) as files,
      (select coalesce(jsonb_agg(l.url order by l.created_at,l.id), '[]'::jsonb)
        from public.round_submission_links l where l.submission_id = j.submission_id) as links
    from joined j
    where (needle = '' or lower(j.name) like '%' || needle || '%' or lower(coalesce(j.username,'')) like '%' || needle || '%')
      and (status_filter = 'all' or j.status = status_filter)
      and (entry_filter = 'all' or j.entry_type = entry_filter)
    order by lower(j.name), j.participant_id nulls last, j.team_id nulls last
    limit 25 offset page_number * 25
  ) item;
  return jsonb_build_object('entries',rows,'total',total,'page',page_number);
end;
$$;

revoke all on function public.save_round_submission_config(uuid,boolean,text,text[],bigint,text,timestamptz,timestamptz,boolean),
  public.save_round_submission(uuid,uuid,jsonb,text[],integer),
  public.organiser_round_submission_review(uuid,text,text,text,integer) from public, anon;
grant execute on function public.save_round_submission_config(uuid,boolean,text,text[],bigint,text,timestamptz,timestamptz,boolean),
  public.save_round_submission(uuid,uuid,jsonb,text[],integer),
  public.organiser_round_submission_review(uuid,text,text,text,integer) to authenticated;

commit;
