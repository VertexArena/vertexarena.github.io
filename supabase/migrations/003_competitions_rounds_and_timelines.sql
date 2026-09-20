-- Milestone 4: atomic competition authoring, publication and private draft banners.
begin;

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  organisation_id uuid references public.organisations(id) on delete restrict,
  name text not null check (length(btrim(name)) between 2 and 160),
  slug text not null unique check (length(slug) between 3 and 100 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and slug not in ('new','edit')),
  status text not null default 'draft' check (status in ('draft','published')),
  field_tags text[] not null default '{}',
  prize_details text not null default '' check (length(prize_details) <= 5000),
  description text not null default '' check (length(description) <= 20000),
  minimum_age integer check (minimum_age between 0 and 120),
  maximum_age integer check (maximum_age between 0 and 120),
  team_mode text not null default 'individual' check (team_mode in ('individual','team','both')),
  minimum_team_size integer check (minimum_team_size between 2 and 100),
  maximum_team_size integer check (maximum_team_size between 2 and 100),
  categories text[] not null default '{}',
  structure text not null default 'direct3' check (structure in ('direct3','directx','100-30-3','custom')),
  banner_kind text not null default 'colour' check (banner_kind in ('colour','gradient','image')),
  banner_colour text not null default '#2563eb' check (banner_colour ~ '^#[0-9a-fA-F]{6}$'),
  banner_colour_end text not null default '#0b1120' check (banner_colour_end ~ '^#[0-9a-fA-F]{6}$'),
  banner_path text,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  starts_at timestamptz,
  certificate_status text not null default 'not_planned' check (certificate_status in ('not_planned','planned','template_ready')),
  certificates_available_at timestamptz,
  version integer not null default 1,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (minimum_age <= maximum_age),
  check (minimum_team_size <= maximum_team_size),
  check ((team_mode = 'individual' and minimum_team_size is null and maximum_team_size is null) or (team_mode <> 'individual' and minimum_team_size is not null and maximum_team_size is not null)),
  check (registration_opens_at < registration_closes_at),
  check (registration_closes_at <= starts_at),
  check (cardinality(field_tags) <= 13 and field_tags <@ array['mathematics','physics','chemistry','biology','programming','robotics','research','writing','design','business','debate','innovation','general STEM']),
  check (cardinality(categories) <= 30),
  check ((banner_kind = 'image' and banner_path is not null and banner_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif)$') or (banner_kind <> 'image' and banner_path is null))
);
create index competitions_owner_idx on public.competitions(owner_id, updated_at desc);
create index competitions_organisation_idx on public.competitions(organisation_id);
create index competitions_published_idx on public.competitions(published_at desc) where status = 'published';

create table public.competition_rounds (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 100),
  slug text not null check (length(slug) between 2 and 100 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sequence integer not null check (sequence between 1 and 20),
  advancement_count integer not null check (advancement_count between 1 and 1000000),
  opens_at timestamptz,
  submission_deadline timestamptz,
  judging_opens_at timestamptz,
  judging_closes_at timestamptz,
  leaderboard_releases_at timestamptz,
  status text not null default 'upcoming' check (status in ('upcoming','active','completed')),
  judging_state text not null default 'not_started',
  leaderboard_state text not null default 'unpublished',
  unique(competition_id, sequence),
  unique(competition_id, slug),
  check (opens_at < submission_deadline),
  check (submission_deadline <= leaderboard_releases_at),
  check ((judging_opens_at is null) = (judging_closes_at is null)),
  check (submission_deadline <= judging_opens_at and judging_opens_at < judging_closes_at and judging_closes_at <= leaderboard_releases_at)
);
alter table public.competitions enable row level security;
alter table public.competition_rounds enable row level security;
revoke all on public.competitions, public.competition_rounds from anon, authenticated;
grant select on public.competitions, public.competition_rounds to anon, authenticated;
create policy competitions_read on public.competitions for select to anon, authenticated
  using (status = 'published' or owner_id = (select auth.uid()));
create policy competition_rounds_read on public.competition_rounds for select to anon, authenticated
  using (exists (select 1 from public.competitions c where c.id = competition_id));

-- Deliberately privileged atomic write boundary; direct table writes are not granted.
-- Every call checks the persisted profile role and the existing row owner.
create function public.save_competition(details jsonb, rounds jsonb, expected_version integer default null)
returns public.competitions language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  candidate public.competitions;
  previous public.competitions;
  item jsonb;
  r public.competition_rounds;
  previous_release timestamptz;
  previous_count integer;
  position integer := 0;
  counts integer[] := '{}';
  saved_rounds jsonb;
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor and account_type = 'organiser' and profile_completed_at is not null) then
    raise exception 'Only an organiser with a complete profile can manage competitions.' using errcode = '42501';
  end if;
  if jsonb_typeof(details) <> 'object' or jsonb_typeof(rounds) <> 'array' or jsonb_array_length(rounds) not between 1 and 20 then
    raise exception 'Provide competition details and between 1 and 20 rounds.';
  end if;
  candidate := jsonb_populate_record(null::public.competitions, details);
  candidate.id := coalesce(candidate.id, gen_random_uuid());
  -- Serialize new IDs and existing edits, including simultaneous first saves.
  perform pg_advisory_xact_lock(hashtextextended(candidate.id::text, 0));
  select * into previous from public.competitions where id = candidate.id for update;
  if found then
    if previous.owner_id <> actor then raise exception 'You cannot edit this competition.' using errcode = '42501'; end if;
    if expected_version is distinct from previous.version then raise exception 'This competition changed in another tab. Reload before saving.' using errcode = '40001'; end if;
  elsif expected_version is not null then raise exception 'Competition no longer exists. Reload before saving.'; end if;
  candidate.owner_id := actor;
  candidate.name := btrim(candidate.name);
  candidate.slug := lower(btrim(candidate.slug));
  candidate.status := coalesce(candidate.status, 'draft');
  candidate.description := coalesce(btrim(candidate.description), '');
  candidate.prize_details := coalesce(btrim(candidate.prize_details), '');
  candidate.field_tags := coalesce(candidate.field_tags, '{}');
  candidate.categories := coalesce(candidate.categories, '{}');
  candidate.created_at := coalesce(previous.created_at, now());
  candidate.updated_at := now();
  candidate.version := coalesce(previous.version, 0) + 1;
  candidate.published_at := case when candidate.status = 'published' then coalesce(previous.published_at, now()) end;
  if previous.id is not null and candidate.slug <> previous.slug then raise exception 'A saved competition address cannot change.'; end if;
  if exists(select 1 from unnest(candidate.categories) category where length(btrim(category)) not between 1 and 80) or
     (select count(distinct lower(btrim(category))) from unnest(candidate.categories) category) <> cardinality(candidate.categories) then
    raise exception 'Categories must be distinct names, each 1–80 characters.';
  end if;
  if candidate.organisation_id is not null and candidate.organisation_id is distinct from previous.organisation_id and not exists (
    select 1 from public.organisation_memberships where organisation_id = candidate.organisation_id and organiser_id = actor and status = 'accepted'
  ) then raise exception 'Accept membership before associating this organisation.' using errcode = '42501'; end if;
  if candidate.banner_kind = 'image' and (split_part(candidate.banner_path,'/',1) <> actor::text or split_part(candidate.banner_path,'/',2) <> candidate.id::text or not exists (
    select 1 from storage.objects where bucket_id = 'competition-banners' and name = candidate.banner_path and owner_id = actor::text
  )) then raise exception 'Upload a banner owned by this competition organiser.'; end if;
  if candidate.status = 'published' and (cardinality(candidate.field_tags) = 0 or candidate.description = '' or candidate.prize_details = '' or candidate.registration_opens_at is null or candidate.registration_closes_at is null or candidate.starts_at is null) then
    raise exception 'Before publishing, add fields, description, prize details, and all registration and competition dates.';
  end if;
  if previous.status = 'published' then
    -- Published participation and result identities are immutable. Descriptive edits remain safe.
    if (to_jsonb(candidate) - array['name','description','prize_details','banner_kind','banner_colour','banner_colour_end','banner_path','updated_at','version']) is distinct from
       (to_jsonb(previous) - array['name','description','prize_details','banner_kind','banner_colour','banner_colour_end','banner_path','updated_at','version']) then
      raise exception 'Published participation rules, organisation, address and timeline are locked. Edit name, description, prizes or banner.';
    end if;
    select jsonb_agg(to_jsonb(cr) - array['competition_id','status','judging_state','leaderboard_state'] order by sequence) into saved_rounds from public.competition_rounds cr where competition_id = candidate.id;
    if rounds is distinct from saved_rounds then raise exception 'Published rounds are locked to preserve participant and result history.'; end if;
  end if;
  previous_release := candidate.starts_at;
  for item in select value from jsonb_array_elements(rounds) loop
    position := position + 1;
    r := jsonb_populate_record(null::public.competition_rounds, item);
    if r.sequence is distinct from position or r.id is null then raise exception 'Round sequence and identity are required.'; end if;
    if r.opens_at < previous_release then raise exception 'Each round must open after the competition start and previous results release.'; end if;
    if r.advancement_count >= previous_count then raise exception 'Each later round must advance fewer entries than the previous round.'; end if;
    if candidate.status = 'published' and (r.opens_at is null or r.submission_deadline is null or r.leaderboard_releases_at is null) then raise exception 'Every round needs an opening, submission deadline and results release.'; end if;
    previous_release := coalesce(r.leaderboard_releases_at, previous_release);
    previous_count := r.advancement_count;
    counts := array_append(counts, r.advancement_count);
  end loop;
  if (candidate.structure = 'direct3' and counts <> array[3]) or (candidate.structure = 'directx' and cardinality(counts) <> 1) or (candidate.structure = '100-30-3' and counts <> array[100,30,3]) then raise exception 'Round advancement must match the selected structure.'; end if;
  if candidate.certificates_available_at < previous_release then raise exception 'Certificates cannot be available before final results.'; end if;
  if candidate.certificate_status = 'not_planned' and candidate.certificates_available_at is not null then raise exception 'Plan certificates before setting their availability.'; end if;
  insert into public.competitions select candidate.*
  on conflict (id) do update set
    name = excluded.name, organisation_id = excluded.organisation_id, status = excluded.status, field_tags = excluded.field_tags,
    prize_details = excluded.prize_details, description = excluded.description, minimum_age = excluded.minimum_age, maximum_age = excluded.maximum_age,
    team_mode = excluded.team_mode, minimum_team_size = excluded.minimum_team_size, maximum_team_size = excluded.maximum_team_size,
    categories = excluded.categories, structure = excluded.structure, banner_kind = excluded.banner_kind, banner_colour = excluded.banner_colour,
    banner_colour_end = excluded.banner_colour_end, banner_path = excluded.banner_path, registration_opens_at = excluded.registration_opens_at,
    registration_closes_at = excluded.registration_closes_at, starts_at = excluded.starts_at, certificate_status = excluded.certificate_status,
    certificates_available_at = excluded.certificates_available_at, published_at = excluded.published_at, updated_at = excluded.updated_at, version = excluded.version;
  if previous.status is distinct from 'published' then
    -- Drafts have no participants or results. Once published, round rows are never replaced.
    delete from public.competition_rounds where competition_id = candidate.id;
    for item in select value from jsonb_array_elements(rounds) loop
      r := jsonb_populate_record(null::public.competition_rounds, item);
      insert into public.competition_rounds(id,competition_id,name,slug,sequence,advancement_count,opens_at,submission_deadline,judging_opens_at,judging_closes_at,leaderboard_releases_at)
      values(r.id,candidate.id,r.name,r.slug,r.sequence,r.advancement_count,r.opens_at,r.submission_deadline,r.judging_opens_at,r.judging_closes_at,r.leaderboard_releases_at);
    end loop;
  end if;
  return candidate;
end;
$$;
revoke all on function public.save_competition(jsonb,jsonb,integer) from public, anon;
grant execute on function public.save_competition(jsonb,jsonb,integer) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('competition-banners','competition-banners',false,5242880,array['image/jpeg','image/png','image/webp','image/gif']);
create policy competition_banners_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'competition-banners' and owner_id = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif)$'
  and split_part(name,'/',1) = (select auth.uid())::text
  and exists(select 1 from public.profiles where id = (select auth.uid()) and account_type = 'organiser')
);
create policy competition_banners_read on storage.objects for select to anon, authenticated using (
  bucket_id = 'competition-banners' and (
    owner_id = (select auth.uid())::text or exists(select 1 from public.competitions c where c.status = 'published' and c.banner_path = name)
  )
);
create policy competition_banners_delete on storage.objects for delete to authenticated using (
  bucket_id = 'competition-banners' and owner_id = (select auth.uid())::text and split_part(name,'/',1) = (select auth.uid())::text
  and not exists(select 1 from public.competitions c where c.banner_path = name)
);
commit;
