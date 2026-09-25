begin;

create table public.competition_meetings (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  name text not null check (name = btrim(name) and length(name) between 3 and 100 and name !~ '[[:cntrl:]]'),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  jitsi_room_name text not null unique check (jitsi_room_name ~ '^Vertex[A-Fa-f0-9]{32}$'),
  starts_at timestamptz not null check (starts_at > '-infinity'::timestamptz and starts_at < 'infinity'::timestamptz),
  created_at timestamptz not null default now(),
  unique (id, competition_id),
  unique (competition_id, slug)
);
create unique index competition_meetings_name_unique on public.competition_meetings (competition_id, lower(name));
create index competition_meetings_schedule_idx on public.competition_meetings (competition_id, starts_at);
create index competition_meetings_creator_idx on public.competition_meetings (created_by);

create table public.meeting_participant_assignments (
  meeting_id uuid not null,
  competition_id uuid not null,
  participant_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (meeting_id, participant_id),
  foreign key (meeting_id, competition_id) references public.competition_meetings(id, competition_id) on delete cascade
);
create index meeting_participant_assignments_person_idx on public.meeting_participant_assignments (participant_id, meeting_id);
create index meeting_participant_assignments_comp_idx on public.meeting_participant_assignments (competition_id);

create table public.meeting_team_assignments (
  meeting_id uuid not null,
  competition_id uuid not null,
  team_id uuid not null,
  assigned_at timestamptz not null default now(),
  primary key (meeting_id, team_id),
  foreign key (meeting_id, competition_id) references public.competition_meetings(id, competition_id) on delete cascade,
  foreign key (team_id, competition_id) references public.competition_teams(id, competition_id) on delete cascade
);
create index meeting_team_assignments_team_idx on public.meeting_team_assignments (team_id, meeting_id);
create index meeting_team_assignments_comp_idx on public.meeting_team_assignments (competition_id);

create function public.can_access_competition_meeting(target_meeting_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.competition_meetings meeting
    where meeting.id = target_meeting_id and (
      public.can_manage_competition(meeting.competition_id)
      or exists (
        select 1 from public.meeting_participant_assignments assignment
        where assignment.meeting_id = meeting.id and assignment.participant_id = auth.uid()
          and (
            exists (select 1 from public.individual_registrations r
              where r.competition_id = meeting.competition_id and r.participant_id = auth.uid())
            or exists (select 1 from public.competition_team_members member
              join public.competition_teams team on team.id = member.team_id
              where member.competition_id = meeting.competition_id
                and member.participant_id = auth.uid() and team.registered_at is not null)
          )
      )
      or exists (
        select 1 from public.meeting_team_assignments assignment
        join public.competition_teams team on team.id = assignment.team_id and team.registered_at is not null
        join public.competition_team_members member on member.team_id = team.id
        where assignment.meeting_id = meeting.id and member.participant_id = auth.uid()
      )
    )
  );
$$;
revoke all on function public.can_access_competition_meeting(uuid) from public, anon;
grant execute on function public.can_access_competition_meeting(uuid) to authenticated;

alter table public.competition_meetings enable row level security;
alter table public.meeting_participant_assignments enable row level security;
alter table public.meeting_team_assignments enable row level security;
revoke all on public.competition_meetings, public.meeting_participant_assignments,
  public.meeting_team_assignments from public, anon, authenticated;
grant select on public.competition_meetings, public.meeting_participant_assignments,
  public.meeting_team_assignments to authenticated;
create policy competition_meetings_read on public.competition_meetings for select to authenticated
  using (public.can_access_competition_meeting(id));
create policy meeting_participant_assignments_manage_read on public.meeting_participant_assignments
  for select to authenticated using (public.can_manage_competition(competition_id));
create policy meeting_team_assignments_manage_read on public.meeting_team_assignments
  for select to authenticated using (public.can_manage_competition(competition_id));

alter table public.notifications add column meeting_id uuid
  references public.competition_meetings(id) on delete cascade;
create index notifications_meeting_idx on public.notifications (meeting_id) where meeting_id is not null;

create function public.search_meeting_assignables(target_competition_id uuid, search_term text default '', result_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  needle text := lower(regexp_replace(btrim(coalesce(search_term, '')), '^@', ''));
  capped integer := least(greatest(coalesce(result_limit, 20), 1), 30);
  people jsonb;
  teams jsonb;
begin
  if auth.uid() is null or not public.can_manage_competition(target_competition_id) then
    raise exception 'Only this competition’s organisers can search its roster.' using errcode = '42501';
  end if;
  if length(needle) > 100 then
    raise exception 'Search text is too long.' using errcode = '23514';
  end if;
  select coalesce(jsonb_agg(to_jsonb(person)), '[]'::jsonb) into people from (
    select profile.id, profile.full_name, profile.username::text as username
    from public.profiles profile
    where profile.account_type = 'participant'
      and (
        exists (select 1 from public.individual_registrations r
          where r.competition_id = target_competition_id and r.participant_id = profile.id)
        or exists (select 1 from public.competition_team_members member
          join public.competition_teams team on team.id = member.team_id and team.registered_at is not null
          where member.competition_id = target_competition_id and member.participant_id = profile.id)
      )
      and (needle = '' or lower(profile.full_name) like '%' || needle || '%'
        or lower(profile.username::text) like '%' || needle || '%')
    order by profile.full_name, profile.id limit capped
  ) person;
  select coalesce(jsonb_agg(to_jsonb(team_row)), '[]'::jsonb) into teams from (
    select team.id, team.name,
      (select count(*) from public.competition_team_members member where member.team_id = team.id) as member_count
    from public.competition_teams team
    where team.competition_id = target_competition_id and team.registered_at is not null
      and (needle = '' or lower(team.name) like '%' || needle || '%')
    order by team.name, team.id limit capped
  ) team_row;
  return jsonb_build_object('participants', people, 'teams', teams);
end;
$$;

create function public.create_competition_meeting(
  target_competition_id uuid, meeting_name text, meeting_starts_at timestamptz,
  participant_ids uuid[] default '{}'::uuid[], team_ids uuid[] default '{}'::uuid[]
)
returns public.competition_meetings language plpgsql security definer set search_path = public, pg_temp as $$
declare
  competition public.competitions;
  created public.competition_meetings;
  chosen_participants uuid[] := array(select distinct unnest(coalesce(participant_ids, '{}'::uuid[])));
  chosen_teams uuid[] := array(select distinct unnest(coalesce(team_ids, '{}'::uuid[])));
  base_slug text;
  valid_count integer;
begin
  if auth.uid() is null or not public.can_manage_competition(target_competition_id) then
    raise exception 'Only this competition’s organisers can create meetings.' using errcode = '42501';
  end if;
  select * into competition from public.competitions where id = target_competition_id for share;
  if competition.id is null or competition.status <> 'published' then
    raise exception 'Publish the competition before creating meetings.' using errcode = '23514';
  end if;
  if length(btrim(coalesce(meeting_name, ''))) not between 3 and 100
     or btrim(meeting_name) ~ '[[:cntrl:]]' then
    raise exception 'Enter a meeting name between 3 and 100 characters.' using errcode = '23514';
  end if;
  if exists (select 1 from public.competition_meetings m
      where m.competition_id = target_competition_id and lower(m.name) = lower(btrim(meeting_name))) then
    raise exception 'A meeting with this name already exists in the competition.' using errcode = '23505';
  end if;
  if meeting_starts_at is null or not isfinite(meeting_starts_at) then
    raise exception 'Choose a valid meeting start date and time.' using errcode = '23514';
  end if;
  if cardinality(chosen_participants) + cardinality(chosen_teams) = 0
     or cardinality(chosen_participants) + cardinality(chosen_teams) > 1000
     or array_position(chosen_participants, null) is not null
     or array_position(chosen_teams, null) is not null then
    raise exception 'Assign at least one registered participant or team.' using errcode = '23514';
  end if;
  select count(*) into valid_count from unnest(chosen_participants) requested(id)
  where exists (select 1 from public.profiles p where p.id = requested.id and p.account_type = 'participant')
    and (
      exists (select 1 from public.individual_registrations r
        where r.competition_id = target_competition_id and r.participant_id = requested.id)
      or exists (select 1 from public.competition_team_members member
        join public.competition_teams team on team.id = member.team_id and team.registered_at is not null
        where member.competition_id = target_competition_id and member.participant_id = requested.id)
    );
  if valid_count <> cardinality(chosen_participants) then
    raise exception 'Every selected participant must have a confirmed competition entry.' using errcode = '23514';
  end if;
  select count(*) into valid_count from unnest(chosen_teams) requested(id)
  where exists (select 1 from public.competition_teams team
    where team.id = requested.id and team.competition_id = target_competition_id and team.registered_at is not null);
  if valid_count <> cardinality(chosen_teams) then
    raise exception 'Every selected team must be registered for this competition.' using errcode = '23514';
  end if;
  base_slug := trim(both '-' from lower(regexp_replace(btrim(meeting_name), '[^a-zA-Z0-9]+', '-', 'g')));
  if base_slug = '' then base_slug := 'meeting'; end if;
  created.id := gen_random_uuid();
  insert into public.competition_meetings (id, competition_id, created_by, name, slug, jitsi_room_name, starts_at)
  values (created.id, competition.id, auth.uid(), btrim(meeting_name),
    trim(both '-' from left(base_slug, 75)) || '-' || left(replace(created.id::text, '-', ''), 8),
    'Vertex' || replace(gen_random_uuid()::text, '-', ''), meeting_starts_at)
  returning * into created;
  insert into public.meeting_participant_assignments (meeting_id, competition_id, participant_id)
    select created.id, competition.id, id from unnest(chosen_participants) id;
  insert into public.meeting_team_assignments (meeting_id, competition_id, team_id)
    select created.id, competition.id, id from unnest(chosen_teams) id;
  insert into public.notifications (recipient_id, competition_id, meeting_id, kind, title, body, link_path)
    select recipients.id, competition.id, created.id, 'meeting_assignment',
      'Meeting assigned: ' || left(created.name, 140),
      left('You are invited to ' || created.name || ' for ' || competition.name || '.', 1000),
      '/competition/' || competition.slug || '/meeting/' || created.slug
    from (
      select unnest(chosen_participants) as id
      union
      select member.participant_id from public.meeting_team_assignments assignment
        join public.competition_team_members member on member.team_id = assignment.team_id
        where assignment.meeting_id = created.id
    ) recipients;
  return created;
end;
$$;

revoke all on function public.search_meeting_assignables(uuid,text,integer),
  public.create_competition_meeting(uuid,text,timestamptz,uuid[],uuid[]) from public, anon;
grant execute on function public.search_meeting_assignables(uuid,text,integer),
  public.create_competition_meeting(uuid,text,timestamptz,uuid[],uuid[]) to authenticated;

alter publication supabase_realtime add table public.competition_meetings;
commit;
