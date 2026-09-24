-- Milestone 9: competition-specific organiser collaboration.
begin;

create table public.competition_organisers (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  organiser_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'manager' check (role = 'manager'),
  joined_at timestamptz not null default now(),
  primary key (competition_id, organiser_id)
);
create index competition_organisers_person_idx on public.competition_organisers(organiser_id, competition_id);
alter table public.competition_organisers enable row level security;
revoke all on public.competition_organisers from public, anon, authenticated;
grant select on public.competition_organisers to authenticated;

create table public.competition_organiser_invitations (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  organiser_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  unique (competition_id, organiser_id),
  check (expires_at > created_at)
);
create index competition_organiser_invitations_person_idx on public.competition_organiser_invitations(organiser_id, status, expires_at);
alter table public.competition_organiser_invitations enable row level security;
revoke all on public.competition_organiser_invitations from public, anon, authenticated;
grant select on public.competition_organiser_invitations to authenticated;

create function public.can_manage_competition(target_competition_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.competitions c where c.id = target_competition_id
      and (c.owner_id = auth.uid() or exists (
        select 1 from public.competition_organisers m
        where m.competition_id = c.id and m.organiser_id = auth.uid() and m.role = 'manager'
      ))
  );
$$;
revoke all on function public.can_manage_competition(uuid) from public, anon;
grant execute on function public.can_manage_competition(uuid) to authenticated;

create policy competition_organisers_read on public.competition_organisers
  for select to authenticated using (public.can_manage_competition(competition_id));
create policy competition_organiser_invitations_read on public.competition_organiser_invitations
  for select to authenticated using (
    organiser_id = (select auth.uid()) or exists (
      select 1 from public.competitions c
      where c.id = competition_id and c.owner_id = (select auth.uid())
    )
  );
drop policy competitions_read on public.competitions;
create policy competitions_read_public on public.competitions for select to anon
  using (status = 'published');
create policy competitions_read_authenticated on public.competitions for select to authenticated
  using (status = 'published' or owner_id = (select auth.uid())
    or public.can_manage_competition(id));

create function public.invite_competition_organiser(target_competition_id uuid, target_username text)
returns public.competition_organiser_invitations language plpgsql security definer
set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); c public.competitions; invitee public.profiles;
  invitation public.competition_organiser_invitations; cleaned text := lower(regexp_replace(btrim(target_username), '^@', ''));
begin
  if actor is null then raise exception 'Log in as the competition owner.' using errcode = '42501'; end if;
  select * into c from public.competitions where id = target_competition_id for update;
  if c.id is null or c.owner_id <> actor then
    raise exception 'Only the competition owner can invite organisers.' using errcode = '42501';
  end if;
  if cleaned !~ '^[a-z0-9_]{3,24}$' then raise exception 'Enter a valid organiser @username.'; end if;
  select * into invitee from public.profiles where lower(username::text) = cleaned;
  if invitee.id is null or invitee.account_type <> 'organiser' or invitee.profile_completed_at is null then
    raise exception 'Choose a completed organiser account, not a participant account.';
  end if;
  if invitee.id = actor then raise exception 'You already own this competition.'; end if;
  if exists (select 1 from public.competition_organisers m where m.competition_id = c.id and m.organiser_id = invitee.id) then
    raise exception 'This organiser already manages the competition.';
  end if;
  select * into invitation from public.competition_organiser_invitations
    where competition_id = c.id and organiser_id = invitee.id for update;
  if invitation.id is not null and invitation.status = 'pending' and invitation.expires_at > now() then
    raise exception 'An invitation is already waiting for this organiser.';
  end if;
  insert into public.competition_organiser_invitations
    (competition_id, organiser_id, invited_by, status, expires_at)
  values (c.id, invitee.id, actor, 'pending', now() + interval '14 days')
  on conflict (competition_id, organiser_id) do update
    set invited_by = excluded.invited_by, status = 'pending', created_at = now(),
      expires_at = excluded.expires_at, responded_at = null
  returning * into invitation;
  insert into public.notifications(recipient_id, competition_id, kind, title, body, link_path)
  values(invitee.id, c.id, 'competition_organiser_invitation', 'Competition organiser invitation',
    'You were invited to manage ' || c.name || '. Respond within 14 days.',
    '/organiser');
  return invitation;
end;
$$;

create function public.respond_competition_organiser_invitation(invitation_id uuid, accept_invitation boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); invitation public.competition_organiser_invitations; c public.competitions;
begin
  if actor is null then raise exception 'Log in to respond.' using errcode = '42501'; end if;
  select * into invitation from public.competition_organiser_invitations where id = invitation_id for update;
  if invitation.id is null or invitation.organiser_id <> actor then
    raise exception 'This invitation is not addressed to your account.' using errcode = '42501';
  end if;
  if invitation.status <> 'pending' then raise exception 'This invitation has already been answered.'; end if;
  if invitation.expires_at <= now() then raise exception 'This invitation has expired. Ask the owner to invite you again.'; end if;
  if accept_invitation is null then raise exception 'Choose accept or decline.'; end if;
  if not exists (select 1 from public.profiles p where p.id = actor and p.account_type = 'organiser' and p.profile_completed_at is not null) then
    raise exception 'Only completed organiser accounts can accept invitations.' using errcode = '42501';
  end if;
  select * into c from public.competitions where id = invitation.competition_id for update;
  if c.id is null then raise exception 'Competition no longer exists.'; end if;
  if accept_invitation then
    if c.owner_id = actor then raise exception 'You already own this competition.'; end if;
    insert into public.competition_organisers(competition_id, organiser_id)
      values(c.id, actor) on conflict do nothing;
  end if;
  update public.competition_organiser_invitations
    set status = case when accept_invitation then 'accepted' else 'declined' end,
      responded_at = now()
    where id = invitation.id;
  insert into public.notifications(recipient_id, competition_id, kind, title, body, link_path)
  values(c.owner_id, c.id, 'competition_organiser_response', 'Organiser invitation answered',
    (select full_name from public.profiles where id = actor) ||
      case when accept_invitation then ' joined ' else ' declined the invitation to ' end || c.name || '.',
    '/organiser/competition/' || c.slug || '/workspace');
end;
$$;

create function public.remove_competition_organiser(target_competition_id uuid, target_organiser_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); c public.competitions;
begin
  if actor is null then raise exception 'Log in to change organiser access.' using errcode = '42501'; end if;
  select * into c from public.competitions where id = target_competition_id for update;
  if c.id is null then raise exception 'Competition not found.'; end if;
  if target_organiser_id = c.owner_id then
    raise exception 'The competition owner cannot be removed.' using errcode = '42501';
  end if;
  if actor <> c.owner_id and actor <> target_organiser_id then
    raise exception 'Only the owner can remove another organiser.' using errcode = '42501';
  end if;
  delete from public.competition_organisers
    where competition_id = c.id and organiser_id = target_organiser_id;
  if not found then raise exception 'This organiser is not on the team.'; end if;
  insert into public.notifications(recipient_id, competition_id, kind, title, body, link_path)
  values(target_organiser_id, c.id, 'competition_organiser_removed', 'Competition access ended',
    'You no longer manage ' || c.name || '.', '/organiser');
end;
$$;

create function public.cancel_competition_organiser_invitation(invitation_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); invitation public.competition_organiser_invitations;
begin
  if actor is null then raise exception 'Log in as the competition owner.' using errcode = '42501'; end if;
  select i.* into invitation from public.competition_organiser_invitations i
  join public.competitions c on c.id = i.competition_id
  where i.id = invitation_id and c.owner_id = actor for update of i;
  if invitation.id is null or invitation.status <> 'pending' then
    raise exception 'No pending invitation can be cancelled.' using errcode = '42501';
  end if;
  update public.competition_organiser_invitations
    set status = 'cancelled', responded_at = now() where id = invitation.id;
end;
$$;

create function public.my_competition_organiser_invitations()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'competition_name', c.name, 'competition_slug', c.slug,
    'owner_name', p.full_name, 'owner_username', p.username,
    'expires_at', i.expires_at, 'created_at', i.created_at
  ) order by i.created_at desc), '[]'::jsonb)
  from public.competition_organiser_invitations i
  join public.competitions c on c.id = i.competition_id
  join public.profiles p on p.id = c.owner_id
  where i.organiser_id = auth.uid() and i.status = 'pending' and i.expires_at > now()
    and exists (select 1 from public.profiles mine
      where mine.id = auth.uid() and mine.account_type = 'organiser');
$$;

revoke all on function public.invite_competition_organiser(uuid,text),
  public.respond_competition_organiser_invitation(uuid,boolean),
  public.remove_competition_organiser(uuid,uuid),
  public.cancel_competition_organiser_invitation(uuid),
  public.my_competition_organiser_invitations() from public, anon;
grant execute on function public.invite_competition_organiser(uuid,text),
  public.respond_competition_organiser_invitation(uuid,boolean),
  public.remove_competition_organiser(uuid,uuid),
  public.cancel_competition_organiser_invitation(uuid),
  public.my_competition_organiser_invitations() to authenticated;

-- Existing owner checks in three RPCs are replaced below with owner-or-manager checks.

create or replace function public.save_competition(details jsonb, rounds jsonb, expected_version integer default null)
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
    if not public.can_manage_competition(candidate.id) then raise exception 'You cannot edit this competition.' using errcode = '42501'; end if;
    if expected_version is distinct from previous.version then raise exception 'This competition changed in another tab. Reload before saving.' using errcode = 'PT409'; end if;
  elsif expected_version is not null then raise exception 'Competition no longer exists. Reload before saving.'; end if;
  candidate.owner_id := coalesce(previous.owner_id, actor);
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
  if candidate.banner_kind = 'image' and (previous.id is null or candidate.banner_path is distinct from previous.banner_path) and (candidate.banner_path is null or split_part(candidate.banner_path,'/',1) <> actor::text or split_part(candidate.banner_path,'/',2) <> candidate.id::text or not exists (
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

create or replace function public.organiser_competition_entries(
  target_competition_id uuid, team_page integer default 0, individual_page integer default 0
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); c public.competitions; teams jsonb; individuals jsonb;
  team_total integer; individual_total integer; t_page integer := greatest(0, least(coalesce(team_page, 0), 100000));
  i_page integer := greatest(0, least(coalesce(individual_page, 0), 100000));
begin
  if actor is null then raise exception 'Log in as the competition owner.' using errcode = '42501'; end if;
  select * into c from public.competitions where id = target_competition_id;
  if c.id is null or not public.can_manage_competition(c.id) then
    raise exception 'Only competition organisers can view participants.' using errcode = '42501';
  end if;
  select count(*) into team_total from public.competition_teams
  where competition_id = c.id and registered_at is not null;
  select count(*) into individual_total from public.individual_registrations where competition_id = c.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'category', t.category, 'registered_at', t.registered_at,
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'full_name', p.full_name, 'username', p.username,
      'captain', p.id = t.captain_id
    ) order by (p.id <> t.captain_id), m.joined_at), '[]'::jsonb)
      from public.competition_team_members m join public.profiles p on p.id = m.participant_id
      where m.team_id = t.id)
  ) order by t.registered_at desc, t.id), '[]'::jsonb) into teams
  from (select * from public.competition_teams
    where competition_id = c.id and registered_at is not null
    order by registered_at desc, id limit 25 offset t_page * 25) t;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'category', r.category, 'created_at', r.created_at,
    'full_name', p.full_name, 'username', p.username
  ) order by r.created_at desc, r.id), '[]'::jsonb) into individuals
  from (select * from public.individual_registrations
    where competition_id = c.id order by created_at desc, id
    limit 25 offset i_page * 25) r
  join public.profiles p on p.id = r.participant_id;
  return jsonb_build_object('teams', teams, 'individuals', individuals,
    'team_total', team_total, 'individual_total', individual_total,
    'team_page', t_page, 'individual_page', i_page);
end;
$$;

create or replace function public.organiser_dashboard_summary()
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  competitions_json jsonb;
  activity_json jsonb;
begin
  if actor is null or not exists (
    select 1 from public.profiles p
    where p.id = actor and p.account_type = 'organiser'
  ) then
    raise exception 'Only organiser accounts can view this dashboard.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'owner_id', c.owner_id, 'access_role', case when c.owner_id = actor then 'owner' else 'manager' end, 'name', c.name, 'slug', c.slug, 'status', c.status,
    'team_mode', c.team_mode, 'registration_opens_at', c.registration_opens_at,
    'registration_closes_at', c.registration_closes_at, 'starts_at', c.starts_at,
    'certificate_status', c.certificate_status,
    'certificates_available_at', c.certificates_available_at,
    'updated_at', c.updated_at,
    'individual_count', (select count(*) from public.individual_registrations r where r.competition_id = c.id),
    'team_count', (select count(*) from public.competition_teams t where t.competition_id = c.id and t.registered_at is not null),
    'team_participant_count', (select count(*) from public.competition_team_members m
      join public.competition_teams t on t.id = m.team_id
      where m.competition_id = c.id and t.registered_at is not null)
  ) order by c.updated_at desc, c.id), '[]'::jsonb)
  into competitions_json
  from public.competitions c where public.can_manage_competition(c.id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', activity.kind, 'competition_name', activity.competition_name,
    'competition_slug', activity.competition_slug, 'subject', activity.subject,
    'occurred_at', activity.occurred_at
  ) order by activity.occurred_at desc), '[]'::jsonb)
  into activity_json
  from (
    select 'individual_registration'::text as kind, c.name as competition_name,
      c.slug as competition_slug, p.full_name as subject, r.created_at as occurred_at
    from public.individual_registrations r
    join public.competitions c on c.id = r.competition_id
    join public.profiles p on p.id = r.participant_id
    where public.can_manage_competition(c.id)
    union all
    select 'team_registration', c.name, c.slug, t.name, t.registered_at
    from public.competition_teams t
    join public.competitions c on c.id = t.competition_id
    where public.can_manage_competition(c.id) and t.registered_at is not null
    union all
    select 'competition_updated', c.name, c.slug, c.name, c.updated_at
    from public.competitions c where public.can_manage_competition(c.id)
    order by occurred_at desc limit 12
  ) activity;

  return jsonb_build_object('competitions', competitions_json, 'recent_activity', activity_json);
end;
$$;

create policy competition_banners_read_managers on storage.objects for select to authenticated using (
  bucket_id = 'competition-banners' and exists (
    select 1 from public.competitions c
    where c.banner_path = name and public.can_manage_competition(c.id)
  )
);
create policy competition_banners_delete_managers on storage.objects for delete to authenticated using (
  bucket_id = 'competition-banners' and exists (
    select 1 from public.competitions c
    where c.id::text = split_part(name, '/', 2)
      and c.banner_path is distinct from name
      and public.can_manage_competition(c.id)
  )
);
commit;
