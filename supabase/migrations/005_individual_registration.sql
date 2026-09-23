-- Milestone 6: authoritative individual entry and immediate in-app confirmation.
begin;

create table public.individual_registrations (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  participant_id uuid not null references public.profiles(id) on delete cascade,
  category text check (category is null or length(btrim(category)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (competition_id, participant_id)
);
create index individual_registrations_participant_idx on public.individual_registrations (participant_id, created_at desc);
alter table public.individual_registrations enable row level security;
revoke all on public.individual_registrations from anon, authenticated;
grant select on public.individual_registrations to authenticated;
create policy individual_registrations_read on public.individual_registrations for select to authenticated
  using (
    participant_id = (select auth.uid())
    or exists (select 1 from public.competitions c where c.id = competition_id and c.owner_id = (select auth.uid()))
  );

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  competition_id uuid references public.competitions(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z0-9_]{3,50}$'),
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 1000),
  link_path text not null check (left(link_path, 1) = '/' and left(link_path, 2) <> '//' and length(link_path) <= 500),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
create policy notifications_read on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

-- Table writes are private. This endpoint validates persisted roles and dates,
-- then inserts registration and notification in the same transaction.
create function public.register_individual(target_competition_id uuid, chosen_category text default null)
returns public.individual_registrations
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  person public.profiles;
  competition public.competitions;
  registration public.individual_registrations;
  participant_age integer;
  category_name text := nullif(btrim(chosen_category), '');
begin
  if actor is null then
    raise exception 'Log in as a participant to register.' using errcode = '42501';
  end if;
  select * into person from public.profiles where id = actor for share;
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
  if exists (select 1 from public.individual_registrations r where r.competition_id = competition.id and r.participant_id = actor) then
    raise exception 'You are already registered for this competition.' using errcode = '23505';
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
  on conflict (competition_id, participant_id) do nothing
  returning * into registration;
  if registration.id is null then
    raise exception 'You are already registered for this competition.' using errcode = '23505';
  end if;
  insert into public.notifications (recipient_id, competition_id, kind, title, body, link_path)
  values (actor, competition.id, 'registration_confirmed', 'Registration confirmed',
    'You are registered for ' || competition.name || '.', '/competition/' || competition.slug || '/register');
  return registration;
end;
$$;
revoke all on function public.register_individual(uuid,text) from public, anon;
grant execute on function public.register_individual(uuid,text) to authenticated;
commit;
