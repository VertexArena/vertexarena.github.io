-- Milestone 7: private competition teams and transactional team entry.
begin;

create schema if not exists vertex_private;
revoke all on schema vertex_private from public, anon, authenticated;

create table public.competition_teams (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  captain_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (name = btrim(name) and length(name) between 3 and 80 and name !~ '[[:cntrl:]]'),
  category text check (category is null or length(btrim(category)) between 1 and 80),
  registered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, competition_id),
  check (registered_at is not null or category is null)
);
create unique index competition_teams_name_unique on public.competition_teams (competition_id, lower(name));
create index competition_teams_captain_idx on public.competition_teams (captain_id);
alter table public.competition_teams enable row level security;
revoke all on public.competition_teams from anon, authenticated;
grant select on public.competition_teams to authenticated;
create policy competition_teams_read on public.competition_teams for select to authenticated
  using (captain_id = (select auth.uid()) or exists (
    select 1 from public.competitions c where c.id = competition_id and c.owner_id = (select auth.uid())
  ));

create table public.competition_team_members (
  team_id uuid not null,
  competition_id uuid not null,
  participant_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, participant_id),
  unique (competition_id, participant_id),
  foreign key (team_id, competition_id) references public.competition_teams(id, competition_id) on delete cascade
);
create index competition_team_members_participant_idx on public.competition_team_members (participant_id, joined_at desc);
alter table public.competition_team_members enable row level security;
revoke all on public.competition_team_members from anon, authenticated;
grant select on public.competition_team_members to authenticated;
create policy competition_team_members_read on public.competition_team_members for select to authenticated
  using (participant_id = (select auth.uid()) or exists (
    select 1 from public.competition_teams t where t.id = team_id and (
      t.captain_id = (select auth.uid()) or exists (
        select 1 from public.competitions c where c.id = t.competition_id and c.owner_id = (select auth.uid())
      )
    )
  ));

create table public.competition_team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  competition_id uuid not null,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (team_id, competition_id) references public.competition_teams(id, competition_id) on delete cascade,
  check ((status = 'pending' and responded_at is null) or (status <> 'pending' and responded_at is not null))
);
create unique index competition_team_invitations_pending_unique
  on public.competition_team_invitations (team_id, invitee_id) where status = 'pending';
create index competition_team_invitations_inbox_idx
  on public.competition_team_invitations (invitee_id, status, expires_at desc);
create index competition_team_invitations_team_idx
  on public.competition_team_invitations (team_id, created_at desc);
alter table public.competition_team_invitations enable row level security;
revoke all on public.competition_team_invitations from anon, authenticated;
grant select on public.competition_team_invitations to authenticated;
create policy competition_team_invitations_read on public.competition_team_invitations for select to authenticated
  using (invitee_id = (select auth.uid()) or exists (
    select 1 from public.competition_teams t where t.id = team_id and t.captain_id = (select auth.uid())
  ));

create function vertex_private.assert_team_eligible(c public.competitions, p public.profiles, require_open boolean default false)
returns void language plpgsql set search_path = public, pg_temp as $$
declare years integer;
begin
  if c.id is null or c.status <> 'published' or c.team_mode = 'individual' then
    raise exception 'This competition does not accept team entries.' using errcode = '23514';
  end if;
  if p.id is null or p.account_type <> 'participant' or p.profile_completed_at is null
     or p.full_name is null or p.username is null or p.birthday is null then
    raise exception 'Only participants with a completed profile and birthday can join teams.' using errcode = '23514';
  end if;
  if c.registration_closes_at is null or now() >= c.registration_closes_at then
    raise exception 'The registration deadline has passed.' using errcode = '23514';
  end if;
  if require_open and (c.registration_opens_at is null or now() < c.registration_opens_at) then
    raise exception 'Registration has not opened yet.' using errcode = '23514';
  end if;
  years := extract(year from age(current_date, p.birthday))::integer;
  if c.minimum_age is not null and years < c.minimum_age then
    raise exception 'Every team member must be at least % years old.', c.minimum_age using errcode = '23514';
  end if;
  if c.maximum_age is not null and years > c.maximum_age then
    raise exception 'Every team member must be % years old or younger.', c.maximum_age using errcode = '23514';
  end if;
end;
$$;
create function vertex_private.assert_free_identity(target_competition_id uuid, target_participant_id uuid)
returns void language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.individual_registrations r
             where r.competition_id = target_competition_id and r.participant_id = target_participant_id) then
    raise exception 'This participant already has an individual entry.' using errcode = '23505';
  end if;
  if exists (select 1 from public.competition_team_members m
             where m.competition_id = target_competition_id and m.participant_id = target_participant_id) then
    raise exception 'This participant already belongs to a team for this competition.' using errcode = '23505';
  end if;
end;
$$;
revoke all on function vertex_private.assert_team_eligible(public.competitions, public.profiles, boolean) from public, anon, authenticated;
revoke all on function vertex_private.assert_free_identity(uuid, uuid) from public, anon, authenticated;

create function public.create_competition_team(target_competition_id uuid, team_name text)
returns public.competition_teams language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); c public.competitions; p public.profiles; team public.competition_teams; cleaned text := btrim(team_name);
begin
  if actor is null then raise exception 'Log in as a participant to create a team.' using errcode = '42501'; end if;
  if cleaned is null or length(cleaned) not between 3 and 80 or cleaned ~ '[[:cntrl:]]' then
    raise exception 'Choose a team name of 3 to 80 characters.' using errcode = '23514';
  end if;
  select * into p from public.profiles where id = actor for update;
  select * into c from public.competitions where id = target_competition_id for share;
  perform vertex_private.assert_team_eligible(c, p);
  perform vertex_private.assert_free_identity(c.id, actor);
  insert into public.competition_teams (competition_id, captain_id, name)
  values (c.id, actor, cleaned) returning * into team;
  insert into public.competition_team_members (team_id, competition_id, participant_id)
  values (team.id, c.id, actor);
  update public.competition_team_invitations set status = 'cancelled', responded_at = now()
  where competition_id = c.id and invitee_id = actor and status = 'pending';
  return team;
end;
$$;

create function public.invite_competition_team_member(target_team_id uuid, target_username text)
returns public.competition_team_invitations language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); team public.competition_teams; c public.competitions; invitee public.profiles;
  invitation public.competition_team_invitations; username_text text := regexp_replace(btrim(target_username), '^@', ''); occupied integer;
begin
  if actor is null then raise exception 'Log in to invite a participant.' using errcode = '42501'; end if;
  if username_text is null or username_text !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception 'Enter a valid @username.' using errcode = '23514';
  end if;
  select * into team from public.competition_teams where id = target_team_id for update;
  if team.id is null or team.captain_id <> actor then
    raise exception 'Only the team captain can invite members.' using errcode = '42501';
  end if;
  select * into c from public.competitions where id = team.competition_id;
  if team.registered_at is not null then raise exception 'The registered roster is locked.' using errcode = '23514'; end if;
  if now() >= c.registration_closes_at then raise exception 'The registration deadline has passed.' using errcode = '23514'; end if;
  select * into invitee from public.profiles where lower(username::text) = lower(username_text) for update;
  if invitee.id is null then raise exception 'No participant has that @username.' using errcode = '23514'; end if;
  if invitee.id = actor then raise exception 'The captain already belongs to this team.' using errcode = '23514'; end if;
  perform vertex_private.assert_team_eligible(c, invitee);
  perform vertex_private.assert_free_identity(c.id, invitee.id);
  update public.competition_team_invitations set status = 'cancelled', responded_at = now()
  where team_id = team.id and invitee_id = invitee.id and status = 'pending' and expires_at <= now();
  if exists (select 1 from public.competition_team_invitations
             where team_id = team.id and invitee_id = invitee.id and status = 'pending') then
    raise exception 'This participant already has a pending invitation.' using errcode = '23505';
  end if;
  select count(*) into occupied from public.competition_team_members where team_id = team.id;
  occupied := occupied + (select count(*) from public.competition_team_invitations
    where team_id = team.id and status = 'pending' and expires_at > now());
  if occupied >= c.maximum_team_size then
    raise exception 'This team has no open invitation slots (maximum % members).', c.maximum_team_size using errcode = '23514';
  end if;
  insert into public.competition_team_invitations
    (team_id, competition_id, invitee_id, invited_by, expires_at)
  values (team.id, c.id, invitee.id, actor, least(now() + interval '14 days', c.registration_closes_at))
  returning * into invitation;
  insert into public.notifications (recipient_id, competition_id, kind, title, body, link_path)
  values (invitee.id, c.id, 'team_invitation', 'Team invitation',
    'You have been invited to ' || team.name || ' for ' || c.name || '.',
    '/competition/' || c.slug || '/team');
  return invitation;
end;
$$;

create function public.respond_competition_team_invitation(target_invitation_id uuid, accept_invitation boolean)
returns public.competition_team_invitations language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); invitation public.competition_team_invitations; team public.competition_teams;
  c public.competitions; p public.profiles; occupied integer;
begin
  if actor is null then raise exception 'Log in to respond to an invitation.' using errcode = '42501'; end if;
  -- Read the invite first, then lock the team before any participant profile lock.
  select * into invitation from public.competition_team_invitations where id = target_invitation_id;
  if invitation.id is null or invitation.invitee_id <> actor then
    raise exception 'This invitation is not yours.' using errcode = '42501';
  end if;
  select * into team from public.competition_teams where id = invitation.team_id for update;
  select * into invitation from public.competition_team_invitations where id = target_invitation_id for update;
  if invitation.status <> 'pending' then raise exception 'This invitation has already been answered.' using errcode = '23514'; end if;
  if now() >= invitation.expires_at then raise exception 'This invitation has expired.' using errcode = '23514'; end if;
  if accept_invitation is null then raise exception 'Choose accept or decline.' using errcode = '23514'; end if;
  if team.registered_at is not null then raise exception 'The registered roster is locked.' using errcode = '23514'; end if;
  select * into c from public.competitions where id = team.competition_id;
  if not accept_invitation then
    update public.competition_team_invitations set status = 'declined', responded_at = now()
    where id = invitation.id returning * into invitation;
    return invitation;
  end if;
  select * into p from public.profiles where id = actor for update;
  perform vertex_private.assert_team_eligible(c, p);
  perform vertex_private.assert_free_identity(c.id, actor);
  select count(*) into occupied from public.competition_team_members where team_id = team.id;
  if occupied >= c.maximum_team_size then
    raise exception 'This team is full (maximum % members).', c.maximum_team_size using errcode = '23514';
  end if;
  insert into public.competition_team_members (team_id, competition_id, participant_id)
  values (team.id, c.id, actor);
  update public.competition_team_invitations set status = 'accepted', responded_at = now()
  where id = invitation.id returning * into invitation;
  update public.competition_team_invitations set status = 'cancelled', responded_at = now()
  where invitee_id = actor and competition_id = c.id and id <> invitation.id and status = 'pending';
  insert into public.notifications (recipient_id, competition_id, kind, title, body, link_path)
  values (team.captain_id, c.id, 'team_member_joined', 'New team member',
    p.full_name || ' joined ' || team.name || '.', '/competition/' || c.slug || '/team');
  return invitation;
end;
$$;

create function public.cancel_competition_team_invitation(target_invitation_id uuid)
returns public.competition_team_invitations language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); invitation public.competition_team_invitations; team public.competition_teams;
begin
  if actor is null then raise exception 'Log in to cancel an invitation.' using errcode = '42501'; end if;
  select * into invitation from public.competition_team_invitations where id = target_invitation_id;
  if invitation.id is null then raise exception 'Invitation not found.' using errcode = '23514'; end if;
  select * into team from public.competition_teams where id = invitation.team_id for update;
  if team.captain_id <> actor then raise exception 'Only the team captain can cancel invitations.' using errcode = '42501'; end if;
  update public.competition_team_invitations set status = 'cancelled', responded_at = now()
  where id = invitation.id and status = 'pending' returning * into invitation;
  if invitation.id is null then raise exception 'Only pending invitations can be cancelled.' using errcode = '23514'; end if;
  return invitation;
end;
$$;

create function public.leave_competition_team(target_team_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); team public.competition_teams; c public.competitions; p public.profiles;
begin
  if actor is null then raise exception 'Log in to leave a team.' using errcode = '42501'; end if;
  select * into team from public.competition_teams where id = target_team_id for update;
  if team.id is null then raise exception 'Team not found.' using errcode = '23514'; end if;
  if team.captain_id = actor then
    raise exception 'The captain cannot leave. Remove members and disband an unregistered team instead.' using errcode = '23514';
  end if;
  if team.registered_at is not null then raise exception 'The registered roster is locked.' using errcode = '23514'; end if;
  delete from public.competition_team_members where team_id = team.id and participant_id = actor
  returning participant_id into actor;
  if actor is null then raise exception 'You do not belong to this team.' using errcode = '42501'; end if;
  select * into c from public.competitions where id = team.competition_id;
  select * into p from public.profiles where id = actor;
  insert into public.notifications (recipient_id, competition_id, kind, title, body, link_path)
  values (team.captain_id, c.id, 'team_member_left', 'Team member left',
    p.full_name || ' left ' || team.name || '.', '/competition/' || c.slug || '/team');
end;
$$;

create function public.remove_competition_team_member(target_team_id uuid, target_participant_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); team public.competition_teams; c public.competitions;
begin
  if actor is null then raise exception 'Log in to manage your team.' using errcode = '42501'; end if;
  select * into team from public.competition_teams where id = target_team_id for update;
  if team.id is null or team.captain_id <> actor then
    raise exception 'Only the team captain can remove members.' using errcode = '42501';
  end if;
  if target_participant_id = actor then
    raise exception 'The captain cannot remove themselves.' using errcode = '23514';
  end if;
  if team.registered_at is not null then raise exception 'The registered roster is locked.' using errcode = '23514'; end if;
  delete from public.competition_team_members
  where team_id = team.id and participant_id = target_participant_id;
  if not found then raise exception 'This participant is not on the team.' using errcode = '23514'; end if;
  select * into c from public.competitions where id = team.competition_id;
  insert into public.notifications (recipient_id, competition_id, kind, title, body, link_path)
  values (target_participant_id, c.id, 'team_member_removed', 'Team membership changed',
    'You were removed from ' || team.name || '.', '/competition/' || c.slug || '/team');
end;
$$;

create function public.disband_competition_team(target_team_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); team public.competition_teams;
begin
  if actor is null then raise exception 'Log in to manage your team.' using errcode = '42501'; end if;
  select * into team from public.competition_teams where id = target_team_id for update;
  if team.id is null or team.captain_id <> actor then
    raise exception 'Only the team captain can disband this team.' using errcode = '42501';
  end if;
  if team.registered_at is not null then raise exception 'Registered teams cannot be disbanded.' using errcode = '23514'; end if;
  if exists (select 1 from public.competition_team_members where team_id = team.id and participant_id <> actor) then
    raise exception 'Remove other members before disbanding this team.' using errcode = '23514';
  end if;
  if exists (select 1 from public.competition_team_invitations where team_id = team.id and status = 'pending') then
    raise exception 'Cancel pending invitations before disbanding this team.' using errcode = '23514';
  end if;
  delete from public.competition_teams where id = team.id;
end;
$$;

create function public.register_competition_team(target_team_id uuid, chosen_category text default null)
returns public.competition_teams language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); team public.competition_teams; c public.competitions; person public.profiles;
  member_count integer; category_name text := nullif(btrim(chosen_category), '');
begin
  if actor is null then raise exception 'Log in to register a team.' using errcode = '42501'; end if;
  select * into team from public.competition_teams where id = target_team_id for update;
  if team.id is null or team.captain_id <> actor then
    raise exception 'Only the team captain can register this team.' using errcode = '42501';
  end if;
  if team.registered_at is not null then raise exception 'This team is already registered.' using errcode = '23505'; end if;
  select * into c from public.competitions where id = team.competition_id;
  if c.status <> 'published' or c.team_mode = 'individual' then
    raise exception 'This competition does not accept team entries.' using errcode = '23514';
  end if;
  if c.registration_opens_at is null or now() < c.registration_opens_at then
    raise exception 'Registration has not opened yet.' using errcode = '23514';
  end if;
  if c.registration_closes_at is null or now() >= c.registration_closes_at then
    raise exception 'The registration deadline has passed.' using errcode = '23514';
  end if;
  select count(*) into member_count from public.competition_team_members where team_id = team.id;
  if member_count < c.minimum_team_size or member_count > c.maximum_team_size then
    raise exception 'Team size must be between % and % members; currently %.', c.minimum_team_size, c.maximum_team_size, member_count using errcode = '23514';
  end if;
  if cardinality(c.categories) > 0 then
    if category_name is null or not (category_name = any(c.categories)) then
      raise exception 'Choose one of this competition''s categories.' using errcode = '23514';
    end if;
  elsif category_name is not null then
    raise exception 'This competition does not use categories.' using errcode = '23514';
  end if;
  -- Team row serializes roster mutations; profile rows serialize individual entry races.
  for person in select p.* from public.profiles p join public.competition_team_members m
    on m.participant_id = p.id where m.team_id = team.id order by p.id for update of p
  loop
    perform vertex_private.assert_team_eligible(c, person, true);
    if exists (select 1 from public.individual_registrations r
               where r.competition_id = c.id and r.participant_id = person.id) then
      raise exception 'A team member already has an individual entry.' using errcode = '23505';
    end if;
  end loop;
  update public.competition_teams set registered_at = now(), category = category_name
  where id = team.id returning * into team;
  update public.competition_team_invitations set status = 'cancelled', responded_at = now()
  where team_id = team.id and status = 'pending';
  insert into public.notifications (recipient_id, competition_id, kind, title, body, link_path)
  select m.participant_id, c.id, 'team_registration_confirmed', 'Team entry confirmed',
    team.name || ' is registered for ' || c.name || '.', '/competition/' || c.slug || '/team'
  from public.competition_team_members m where m.team_id = team.id;
  return team;
end;
$$;

create function public.get_competition_team_workspace(target_competition_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); c public.competitions; team public.competition_teams;
  members jsonb := '[]'::jsonb; sent jsonb := '[]'::jsonb; incoming jsonb := '[]'::jsonb;
begin
  if actor is null then raise exception 'Log in to open your team.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = actor and account_type = 'participant') then
    raise exception 'Only participants can use team entry.' using errcode = '42501';
  end if;
  select * into c from public.competitions where id = target_competition_id and status = 'published';
  if c.id is null then raise exception 'Competition not found.' using errcode = '23514'; end if;
  select t.* into team from public.competition_teams t
  join public.competition_team_members m on m.team_id = t.id
  where t.competition_id = c.id and m.participant_id = actor;
  if team.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'full_name', p.full_name, 'username', p.username,
      'joined_at', m.joined_at, 'captain', p.id = team.captain_id
    ) order by (p.id <> team.captain_id), m.joined_at), '[]'::jsonb)
    into members from public.competition_team_members m
    join public.profiles p on p.id = m.participant_id where m.team_id = team.id;
    if team.captain_id = actor then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'invitee_id', i.invitee_id, 'full_name', p.full_name,
        'username', p.username, 'status', case when i.status = 'pending' and i.expires_at <= now()
          then 'expired' else i.status end, 'expires_at', i.expires_at
      ) order by i.created_at desc), '[]'::jsonb)
      into sent from public.competition_team_invitations i
      join public.profiles p on p.id = i.invitee_id
      where i.team_id = team.id;
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'team_id', t.id, 'team_name', t.name,
    'captain_name', p.full_name, 'captain_username', p.username,
    'expires_at', i.expires_at
  ) order by i.created_at desc), '[]'::jsonb)
  into incoming from public.competition_team_invitations i
  join public.competition_teams t on t.id = i.team_id
  join public.profiles p on p.id = t.captain_id
  where i.competition_id = c.id and i.invitee_id = actor and i.status = 'pending'
    and i.expires_at > now() and t.registered_at is null;
  return jsonb_build_object(
    'team', case when team.id is null then null else jsonb_build_object(
      'id', team.id, 'name', team.name, 'captain_id', team.captain_id,
      'category', team.category, 'registered_at', team.registered_at,
      'created_at', team.created_at
    ) end,
    'members', members, 'sent_invitations', sent, 'incoming_invitations', incoming,
    'individual_registered', exists (
      select 1 from public.individual_registrations r
      where r.competition_id = c.id and r.participant_id = actor
    )
  );
end;
$$;

create function public.my_competition_team_dashboard()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); teams jsonb; invitations jsonb;
begin
  if actor is null then raise exception 'Log in to view your teams.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = actor and account_type = 'participant') then
    raise exception 'Only participants can view team entries.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'captain_id', t.captain_id,
    'category', t.category, 'registered_at', t.registered_at,
    'competition_name', c.name, 'competition_slug', c.slug, 'starts_at', c.starts_at,
    'member_count', (select count(*) from public.competition_team_members m2 where m2.team_id = t.id)
  ) order by t.created_at desc), '[]'::jsonb)
  into teams from public.competition_team_members m
  join public.competition_teams t on t.id = m.team_id
  join public.competitions c on c.id = t.competition_id
  where m.participant_id = actor;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'team_name', t.name, 'competition_name', c.name,
    'competition_slug', c.slug, 'expires_at', i.expires_at
  ) order by i.created_at desc), '[]'::jsonb)
  into invitations from public.competition_team_invitations i
  join public.competition_teams t on t.id = i.team_id
  join public.competitions c on c.id = i.competition_id
  where i.invitee_id = actor and i.status = 'pending' and i.expires_at > now()
    and t.registered_at is null;
  return jsonb_build_object('teams', teams, 'invitations', invitations);
end;
$$;

create function public.organiser_competition_entries(
  target_competition_id uuid, team_page integer default 0, individual_page integer default 0
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); c public.competitions; teams jsonb; individuals jsonb;
  team_total integer; individual_total integer; t_page integer := greatest(0, least(coalesce(team_page, 0), 100000));
  i_page integer := greatest(0, least(coalesce(individual_page, 0), 100000));
begin
  if actor is null then raise exception 'Log in as the competition owner.' using errcode = '42501'; end if;
  select * into c from public.competitions where id = target_competition_id;
  if c.id is null or c.owner_id <> actor then
    raise exception 'Only the competition owner can view participants.' using errcode = '42501';
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

-- Replace Milestone 6 entry RPC so an individual entry cannot race team membership.
create or replace function public.register_individual(target_competition_id uuid, chosen_category text default null)
returns public.individual_registrations
language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); person public.profiles; competition public.competitions;
  registration public.individual_registrations; participant_age integer;
  category_name text := nullif(btrim(chosen_category), '');
begin
  if actor is null then raise exception 'Log in as a participant to register.' using errcode = '42501'; end if;
  select * into person from public.profiles where id = actor for update;
  if person.id is null or person.account_type <> 'participant' then
    raise exception 'Only participant accounts can register.' using errcode = '42501';
  end if;
  if person.profile_completed_at is null or person.full_name is null or person.username is null or person.birthday is null then
    raise exception 'Complete your profile and birthday before registering.' using errcode = '23514';
  end if;
  select * into competition from public.competitions where id = target_competition_id for share;
  if competition.id is null or competition.status <> 'published' then
    raise exception 'This competition is not available for registration.' using errcode = '23514';
  end if;
  if competition.team_mode = 'team' then
    raise exception 'This competition accepts teams only.' using errcode = '23514';
  end if;
  if exists (select 1 from public.individual_registrations r
             where r.competition_id = competition.id and r.participant_id = actor) then
    raise exception 'You are already registered for this competition.' using errcode = '23505';
  end if;
  if exists (select 1 from public.competition_team_members m
             where m.competition_id = competition.id and m.participant_id = actor) then
    raise exception 'You already belong to a team for this competition.' using errcode = '23505';
  end if;
  if competition.registration_opens_at is null or now() < competition.registration_opens_at then
    raise exception 'Registration has not opened yet.' using errcode = '23514';
  end if;
  if competition.registration_closes_at is null or now() >= competition.registration_closes_at then
    raise exception 'The registration deadline has passed.' using errcode = '23514';
  end if;
  participant_age := extract(year from age(current_date, person.birthday))::integer;
  if competition.minimum_age is not null and participant_age < competition.minimum_age then
    raise exception 'You must be at least % years old to register.', competition.minimum_age using errcode = '23514';
  end if;
  if competition.maximum_age is not null and participant_age > competition.maximum_age then
    raise exception 'You must be % years old or younger to register.', competition.maximum_age using errcode = '23514';
  end if;
  if cardinality(competition.categories) > 0 then
    if category_name is null or not (category_name = any(competition.categories)) then
      raise exception 'Choose one of this competition''s categories.' using errcode = '23514';
    end if;
  elsif category_name is not null then
    raise exception 'This competition does not use categories.' using errcode = '23514';
  end if;
  insert into public.individual_registrations (competition_id, participant_id, category)
  values (competition.id, actor, category_name)
  on conflict (competition_id, participant_id) do nothing returning * into registration;
  if registration.id is null then
    raise exception 'You are already registered for this competition.' using errcode = '23505';
  end if;
  insert into public.notifications (recipient_id, competition_id, kind, title, body, link_path)
  values (actor, competition.id, 'registration_confirmed', 'Registration confirmed',
    'You are registered for ' || competition.name || '.', '/competition/' || competition.slug || '/register');
  return registration;
end;
$$;

revoke all on function public.create_competition_team(uuid, text) from public, anon;
revoke all on function public.invite_competition_team_member(uuid, text) from public, anon;
revoke all on function public.respond_competition_team_invitation(uuid, boolean) from public, anon;
revoke all on function public.cancel_competition_team_invitation(uuid) from public, anon;
revoke all on function public.leave_competition_team(uuid) from public, anon;
revoke all on function public.remove_competition_team_member(uuid, uuid) from public, anon;
revoke all on function public.disband_competition_team(uuid) from public, anon;
revoke all on function public.register_competition_team(uuid, text) from public, anon;
revoke all on function public.get_competition_team_workspace(uuid) from public, anon;
revoke all on function public.my_competition_team_dashboard() from public, anon;
revoke all on function public.organiser_competition_entries(uuid, integer, integer) from public, anon;
grant execute on function public.create_competition_team(uuid, text) to authenticated;
grant execute on function public.invite_competition_team_member(uuid, text) to authenticated;
grant execute on function public.respond_competition_team_invitation(uuid, boolean) to authenticated;
grant execute on function public.cancel_competition_team_invitation(uuid) to authenticated;
grant execute on function public.leave_competition_team(uuid) to authenticated;
grant execute on function public.remove_competition_team_member(uuid, uuid) to authenticated;
grant execute on function public.disband_competition_team(uuid) to authenticated;
grant execute on function public.register_competition_team(uuid, text) to authenticated;
grant execute on function public.get_competition_team_workspace(uuid) to authenticated;
grant execute on function public.my_competition_team_dashboard() to authenticated;
grant execute on function public.organiser_competition_entries(uuid, integer, integer) to authenticated;

alter publication supabase_realtime add table
  public.competition_teams, public.competition_team_members,
  public.competition_team_invitations, public.notifications;
commit;
