-- Milestone 14: round criteria, authoritative marks, and controlled visibility.
begin;

create table public.round_scoring_settings (
  round_id uuid primary key references public.competition_rounds(id) on delete cascade,
  show_scores_public boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index round_scoring_settings_editor_idx on public.round_scoring_settings(updated_by);

create table public.round_scoring_criteria (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.competition_rounds(id) on delete cascade,
  name text not null check (name = btrim(name) and length(name) between 2 and 100 and name !~ '[[:cntrl:]]'),
  description text not null default '' check (length(description) <= 1000 and description !~ '[[:cntrl:]]'),
  max_marks numeric(8,2) not null check (max_marks > 0 and max_marks <= 100000),
  position integer not null check (position between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, round_id),
  unique (round_id, position) deferrable initially deferred
);
create unique index round_scoring_criteria_name_idx on public.round_scoring_criteria(round_id, lower(name));

create table public.round_scores (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null,
  criterion_id uuid not null,
  participant_id uuid references public.profiles(id) on delete cascade,
  team_id uuid references public.competition_teams(id) on delete cascade,
  marks numeric(8,2) not null check (marks >= 0),
  entered_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (criterion_id, round_id) references public.round_scoring_criteria(id, round_id) on delete cascade,
  check ((participant_id is null) <> (team_id is null))
);
create unique index round_scores_individual_unique on public.round_scores(criterion_id, participant_id) where participant_id is not null;
create unique index round_scores_team_unique on public.round_scores(criterion_id, team_id) where team_id is not null;
create index round_scores_round_entry_idx on public.round_scores(round_id, participant_id, team_id);
create index round_scores_team_idx on public.round_scores(team_id) where team_id is not null;
create index round_scores_entered_by_idx on public.round_scores(entered_by);

alter table public.round_scoring_settings enable row level security;
alter table public.round_scoring_criteria enable row level security;
alter table public.round_scores enable row level security;
revoke all on public.round_scoring_settings, public.round_scoring_criteria, public.round_scores from public, anon, authenticated;
grant select on public.round_scoring_settings, public.round_scoring_criteria, public.round_scores to authenticated;
create policy round_scoring_settings_read on public.round_scoring_settings for select to authenticated
  using (public.can_manage_competition((select competition_id from public.competition_rounds where id = round_id)));
create policy round_scoring_criteria_read on public.round_scoring_criteria for select to authenticated
  using (public.can_manage_competition((select competition_id from public.competition_rounds where id = round_id)));
create policy round_scores_read on public.round_scores for select to authenticated
  using (public.can_manage_competition((select competition_id from public.competition_rounds where id = round_id)));

create function public.save_scoring_criterion(target_round_id uuid, target_criterion_id uuid,
  criterion_name text, criterion_max numeric, criterion_description text default '')
returns public.round_scoring_criteria language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.competition_rounds; saved public.round_scoring_criteria; clean_name text := btrim(coalesce(criterion_name,''));
  clean_description text := btrim(coalesce(criterion_description,''));
begin
  select * into r from public.competition_rounds where id = target_round_id for update;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can edit scoring.' using errcode = '42501';
  end if;
  if r.leaderboard_state <> 'unpublished' or r.judging_state = 'finalised' then
    raise exception 'Scoring is locked after results are finalised.' using errcode = '23514';
  end if;
  if length(clean_name) not between 2 and 100 or clean_name ~ '[[:cntrl:]]'
      or length(clean_description) > 1000 or clean_description ~ '[[:cntrl:]]'
      or criterion_max is null or criterion_max <= 0 or criterion_max > 100000
      or criterion_max <> round(criterion_max,2) then
    raise exception 'Use a name, up to 1000 description characters, and a maximum from 0.01 to 100000 with at most two decimals.' using errcode = '23514';
  end if;
  if target_criterion_id is null then
    insert into public.round_scoring_criteria(round_id,name,max_marks,description,position)
    values (r.id,clean_name,criterion_max,clean_description,
      (select coalesce(max(position),0)+1 from public.round_scoring_criteria where round_id = r.id)) returning * into saved;
  else
    if exists (select 1 from public.round_scores where criterion_id = target_criterion_id and marks > criterion_max) then
      raise exception 'Existing marks exceed this maximum. Edit those scores first.' using errcode = '23514';
    end if;
    update public.round_scoring_criteria set name = clean_name, max_marks = criterion_max,
      description = clean_description, updated_at = now()
    where id = target_criterion_id and round_id = r.id returning * into saved;
    if saved.id is null then raise exception 'Criterion not found in this round.' using errcode = '23514'; end if;
  end if;
  return saved;
end;
$$;

create function public.move_scoring_criterion(target_criterion_id uuid, direction integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare item public.round_scoring_criteria; neighbour public.round_scoring_criteria; r public.competition_rounds;
begin
  select * into item from public.round_scoring_criteria where id = target_criterion_id;
  if item.id is null then raise exception 'Criterion not found.' using errcode = '23514'; end if;
  select * into r from public.competition_rounds where id = item.round_id for update;
  if auth.uid() is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can reorder scoring.' using errcode = '42501';
  end if;
  if r.leaderboard_state <> 'unpublished' or r.judging_state = 'finalised' then
    raise exception 'Scoring is locked after results are finalised.' using errcode = '23514';
  end if;
  if direction not in (-1,1) then raise exception 'Invalid order change.' using errcode = '23514'; end if;
  select * into neighbour from public.round_scoring_criteria
    where round_id = item.round_id and position = item.position + direction;
  if neighbour.id is null then return; end if;
  update public.round_scoring_criteria set position = case when id = item.id then neighbour.position else item.position end,
    updated_at = now() where id in (item.id, neighbour.id);
end;
$$;

create function public.delete_scoring_criterion(target_criterion_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare item public.round_scoring_criteria; r public.competition_rounds;
begin
  select * into item from public.round_scoring_criteria where id = target_criterion_id;
  if item.id is null then raise exception 'Criterion not found.' using errcode = '23514'; end if;
  select * into r from public.competition_rounds where id = item.round_id for update;
  if auth.uid() is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can delete scoring criteria.' using errcode = '42501';
  end if;
  if r.leaderboard_state <> 'unpublished' or r.judging_state = 'finalised' then
    raise exception 'Scoring is locked after results are finalised.' using errcode = '23514';
  end if;
  if exists (select 1 from public.round_scores where criterion_id = item.id) then
    raise exception 'Clear marks for this criterion before deleting it.' using errcode = '23514';
  end if;
  delete from public.round_scoring_criteria where id = item.id;
  update public.round_scoring_criteria set position = position - 1, updated_at = now()
    where round_id = item.round_id and position > item.position;
end;
$$;

create function public.save_round_scores(target_round_id uuid, target_participant_id uuid,
  target_team_id uuid, score_items jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.competition_rounds; item jsonb; criterion public.round_scoring_criteria;
  entered numeric; seen uuid[] := '{}'; criterion_id uuid;
begin
  select * into r from public.competition_rounds where id = target_round_id for update;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can enter scores.' using errcode = '42501';
  end if;
  if r.leaderboard_state <> 'unpublished' or r.judging_state = 'finalised' then
    raise exception 'Scores are locked after results are finalised.' using errcode = '23514';
  end if;
  if (target_participant_id is null) = (target_team_id is null) then
    raise exception 'Choose one individual or team entry.' using errcode = '23514';
  end if;
  if target_participant_id is not null and not exists (
    select 1 from public.individual_registrations where competition_id = r.competition_id and participant_id = target_participant_id
  ) or target_team_id is not null and not exists (
    select 1 from public.competition_teams where competition_id = r.competition_id and id = target_team_id and registered_at is not null
  ) then raise exception 'Entry is not registered for this competition.' using errcode = '23514'; end if;
  if jsonb_typeof(score_items) <> 'array' or jsonb_array_length(score_items) > 100 then
    raise exception 'Scores must be a list of criteria.' using errcode = '23514';
  end if;
  for item in select value from jsonb_array_elements(score_items) loop
    begin criterion_id := (item->>'criterion_id')::uuid; exception when others then
      raise exception 'Invalid criterion.' using errcode = '23514'; end;
    if criterion_id = any(seen) then raise exception 'Criterion repeated.' using errcode = '23514'; end if;
    seen := array_append(seen,criterion_id);
    select * into criterion from public.round_scoring_criteria where id = criterion_id and round_id = r.id;
    if criterion.id is null then raise exception 'Criterion does not belong to this round.' using errcode = '23514'; end if;
    if item->'marks' is null or item->'marks' = 'null'::jsonb then
      delete from public.round_scores where criterion_id = criterion.id
        and ((target_participant_id is not null and participant_id = target_participant_id)
          or (target_team_id is not null and team_id = target_team_id));
    else
      begin entered := (item->>'marks')::numeric; exception when others then
        raise exception 'Marks must be numeric.' using errcode = '23514'; end;
      if entered < 0 or entered > criterion.max_marks or entered <> round(entered,2) then
        raise exception 'Marks for % must be between 0 and %, with at most two decimals.', criterion.name, criterion.max_marks using errcode = '23514';
      end if;
      if target_participant_id is not null then
        insert into public.round_scores(round_id,criterion_id,participant_id,marks,entered_by)
        values (r.id,criterion.id,target_participant_id,entered,auth.uid())
        on conflict (criterion_id,participant_id) where participant_id is not null
        do update set marks = excluded.marks, entered_by = excluded.entered_by, updated_at = now();
      else
        insert into public.round_scores(round_id,criterion_id,team_id,marks,entered_by)
        values (r.id,criterion.id,target_team_id,entered,auth.uid())
        on conflict (criterion_id,team_id) where team_id is not null
        do update set marks = excluded.marks, entered_by = excluded.entered_by, updated_at = now();
      end if;
    end if;
  end loop;
end;
$$;

create function public.set_round_score_visibility(target_round_id uuid, visible boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.competition_rounds;
begin
  select * into r from public.competition_rounds where id = target_round_id for update;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can change score visibility.' using errcode = '42501';
  end if;
  if visible is null then raise exception 'Choose whether scores are public.' using errcode = '23514'; end if;
  insert into public.round_scoring_settings(round_id,show_scores_public,updated_by)
    values (r.id,visible,auth.uid())
  on conflict (round_id) do update set show_scores_public = excluded.show_scores_public,
    updated_by = excluded.updated_by, updated_at = now();
end;
$$;

create function public.round_scoring_roster(target_round_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.competition_rounds; criteria jsonb; entries jsonb; total_max numeric;
begin
  select * into r from public.competition_rounds where id = target_round_id;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can view scoring.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,
    'max_marks',max_marks,'position',position) order by position),'[]'::jsonb), coalesce(sum(max_marks),0)
    into criteria,total_max from public.round_scoring_criteria where round_id = r.id;
  with roster as (
    select 'individual'::text as entry_type, i.participant_id, null::uuid as team_id,
      p.full_name as name, p.username::text as username
    from public.individual_registrations i join public.profiles p on p.id = i.participant_id
    where i.competition_id = r.competition_id
    union all
    select 'team', null::uuid, t.id, t.name, null::text
    from public.competition_teams t where t.competition_id = r.competition_id and t.registered_at is not null
  ), scored as (
    select e.*,
      coalesce((select sum(s.marks) from public.round_scores s where s.round_id = r.id
        and ((e.participant_id is not null and s.participant_id = e.participant_id)
          or (e.team_id is not null and s.team_id = e.team_id))),0) as total,
      (select count(*) from public.round_scores s where s.round_id = r.id
        and ((e.participant_id is not null and s.participant_id = e.participant_id)
          or (e.team_id is not null and s.team_id = e.team_id))) as scored_count,
      (select coalesce(jsonb_object_agg(s.criterion_id::text,s.marks),'{}'::jsonb)
        from public.round_scores s where s.round_id = r.id
        and ((e.participant_id is not null and s.participant_id = e.participant_id)
          or (e.team_id is not null and s.team_id = e.team_id))) as marks
    from roster e
  )
  select coalesce(jsonb_agg(jsonb_build_object('entry_type',entry_type,'participant_id',participant_id,
    'team_id',team_id,'name',name,'username',username,'total',total,
    'scored_count',scored_count,'marks',marks)
    order by (scored_count = jsonb_array_length(criteria)) desc, total desc, lower(name)), '[]'::jsonb)
    into entries from scored;
  return jsonb_build_object('criteria',criteria,'entries',entries,'max_total',total_max,
    'show_scores_public',coalesce((select show_scores_public from public.round_scoring_settings where round_id = r.id),false),
    'locked',r.leaderboard_state <> 'unpublished' or r.judging_state = 'finalised');
end;
$$;

create function public.public_round_scores(target_round_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.competition_rounds; criteria_count integer; max_total numeric; entries jsonb;
begin
  select * into r from public.competition_rounds where id = target_round_id;
  if r.id is null or not exists (select 1 from public.competitions c where c.id = r.competition_id and c.status = 'published') then
    raise exception 'Round not found.' using errcode = '23514';
  end if;
  if not coalesce((select show_scores_public from public.round_scoring_settings where round_id = r.id),false) then
    raise exception 'Scores are private for this round.' using errcode = '42501';
  end if;
  select count(*),coalesce(sum(max_marks),0) into criteria_count,max_total
    from public.round_scoring_criteria where round_id = r.id;
  with roster as (
    select 'individual'::text as entry_type, i.participant_id, null::uuid as team_id,
      p.full_name as name, p.username::text as username
    from public.individual_registrations i join public.profiles p on p.id = i.participant_id
    where i.competition_id = r.competition_id
    union all
    select 'team', null::uuid, t.id, t.name, null::text
    from public.competition_teams t where t.competition_id = r.competition_id and t.registered_at is not null
  ), scored as (
    select e.*, count(s.id) as scored_count,coalesce(sum(s.marks),0) as total
    from roster e left join public.round_scores s on s.round_id = r.id
      and ((e.participant_id is not null and s.participant_id = e.participant_id)
        or (e.team_id is not null and s.team_id = e.team_id))
    group by e.entry_type,e.participant_id,e.team_id,e.name,e.username
  )
  select coalesce(jsonb_agg(jsonb_build_object('entry_type',entry_type,'name',name,
    'username',username,'total',total) order by total desc,lower(name)), '[]'::jsonb)
    into entries from scored where criteria_count > 0 and scored_count = criteria_count;
  return jsonb_build_object('entries',entries,'max_total',max_total);
end;
$$;

revoke all on function public.save_scoring_criterion(uuid,uuid,text,numeric,text),
  public.move_scoring_criterion(uuid,integer), public.delete_scoring_criterion(uuid),
  public.save_round_scores(uuid,uuid,uuid,jsonb),public.set_round_score_visibility(uuid,boolean),
  public.round_scoring_roster(uuid),public.public_round_scores(uuid) from public, anon;
grant execute on function public.save_scoring_criterion(uuid,uuid,text,numeric,text),
  public.move_scoring_criterion(uuid,integer), public.delete_scoring_criterion(uuid),
  public.save_round_scores(uuid,uuid,uuid,jsonb),public.set_round_score_visibility(uuid,boolean),
  public.round_scoring_roster(uuid) to authenticated;
grant execute on function public.public_round_scores(uuid) to anon,authenticated;

commit;
