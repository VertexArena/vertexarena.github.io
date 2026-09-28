-- Milestone 15: authoritative round advancement and exact cutoff decisions.
begin;

create table public.round_advancement_decisions (
  round_id uuid primary key references public.competition_rounds(id) on delete cascade,
  mode text not null check (mode in ('unresolved','automatic','include_all','exclude_all','manual')),
  boundary_score numeric(10,2),
  boundary_ids uuid[] not null default '{}',
  selected_ids uuid[] not null default '{}',
  entry_count integer not null default 0,
  cutoff_count integer not null default 0,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  finalised_by uuid references public.profiles(id) on delete set null,
  finalised_at timestamptz,
  check (finalised_at is null or mode <> 'unresolved')
);
create index round_advancement_decisions_decider_idx on public.round_advancement_decisions(decided_by);
create index round_advancement_decisions_finaliser_idx on public.round_advancement_decisions(finalised_by);

create table public.round_advancement_records (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.competition_rounds(id) on delete cascade,
  participant_id uuid references public.profiles(id) on delete cascade,
  team_id uuid references public.competition_teams(id) on delete cascade,
  rank integer not null check (rank > 0),
  total numeric(12,2) not null check (total >= 0),
  status text not null check (status in ('advanced','winner','eliminated')),
  tags text[] not null default '{}',
  finalised_at timestamptz not null default now(),
  check ((participant_id is null) <> (team_id is null))
);
create unique index round_advancement_person_unique on public.round_advancement_records(round_id,participant_id) where participant_id is not null;
create unique index round_advancement_team_unique on public.round_advancement_records(round_id,team_id) where team_id is not null;
create index round_advancement_person_idx on public.round_advancement_records(participant_id) where participant_id is not null;
create index round_advancement_team_idx on public.round_advancement_records(team_id) where team_id is not null;
create index round_advancement_status_idx on public.round_advancement_records(round_id,status);

create table public.round_participant_eligibility (
  round_id uuid not null references public.competition_rounds(id) on delete cascade,
  participant_id uuid not null references public.profiles(id) on delete cascade,
  source_team_id uuid references public.competition_teams(id) on delete cascade,
  status text not null check (status in ('advanced','winner','eliminated')),
  tags text[] not null default '{}',
  finalised_at timestamptz not null default now(),
  primary key(round_id,participant_id)
);
create index round_participant_eligibility_person_idx on public.round_participant_eligibility(participant_id,round_id);
create index round_participant_eligibility_team_idx on public.round_participant_eligibility(source_team_id) where source_team_id is not null;

alter table public.round_advancement_decisions enable row level security;
alter table public.round_advancement_records enable row level security;
alter table public.round_participant_eligibility enable row level security;
revoke all on public.round_advancement_decisions, public.round_advancement_records,
  public.round_participant_eligibility from public,anon,authenticated;
grant select on public.round_advancement_decisions, public.round_advancement_records,
  public.round_participant_eligibility to authenticated;
create policy advancement_decisions_manager_read on public.round_advancement_decisions for select to authenticated
  using (public.can_manage_competition((select competition_id from public.competition_rounds where id=round_id)));
create policy advancement_records_read on public.round_advancement_records for select to authenticated
  using (public.can_manage_competition((select competition_id from public.competition_rounds where id=round_id))
    or participant_id=(select auth.uid())
    or exists(select 1 from public.competition_team_members m where m.team_id=round_advancement_records.team_id and m.participant_id=(select auth.uid())));
create policy advancement_eligibility_read on public.round_participant_eligibility for select to authenticated
  using (participant_id=(select auth.uid())
    or public.can_manage_competition((select competition_id from public.competition_rounds where id=round_id)));

-- Only prior finalised advancement activates a later round entry.
create function public.round_entry_eligible(target_round_id uuid, target_participant_id uuid, target_team_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists (
    select 1 from public.competition_rounds r where r.id=target_round_id
      and ((target_participant_id is not null and target_team_id is null and exists (
        select 1 from public.individual_registrations i
        where i.competition_id=r.competition_id and i.participant_id=target_participant_id))
        or (target_team_id is not null and target_participant_id is null and exists (
          select 1 from public.competition_teams t
          where t.competition_id=r.competition_id and t.id=target_team_id and t.registered_at is not null)))
      and (r.sequence=1 or exists (
        select 1 from public.competition_rounds previous
        join public.round_advancement_decisions d on d.round_id=previous.id and d.finalised_at is not null
        join public.round_advancement_records record on record.round_id=previous.id and record.status='advanced'
        where previous.competition_id=r.competition_id and previous.sequence=r.sequence-1
          and ((target_participant_id is not null and record.participant_id=target_participant_id)
            or (target_team_id is not null and record.team_id=target_team_id))))
  );
$$;
revoke all on function public.round_entry_eligible(uuid,uuid,uuid) from public,anon,authenticated;

-- Internal ranking returns every active entry, including incomplete ones.
create function vertex_private.round_ranking(target_round_id uuid)
returns table(entry_type text, participant_id uuid, team_id uuid, name text, username text,
  total numeric, scored_count bigint, rank bigint, boundary boolean, provisional text)
language sql stable security definer set search_path=public,pg_temp as $$
  with round_info as (select * from public.competition_rounds where id=target_round_id),
  criteria as (select count(*) as n from public.round_scoring_criteria where round_id=target_round_id),
  roster as (
    select 'individual'::text entry_type,i.participant_id,null::uuid team_id,p.full_name name,p.username::text username
    from round_info r join public.individual_registrations i on i.competition_id=r.competition_id
      join public.profiles p on p.id=i.participant_id
    where public.round_entry_eligible(r.id,i.participant_id,null)
    union all
    select 'team'::text,null::uuid,t.id,t.name,null::text
    from round_info r join public.competition_teams t on t.competition_id=r.competition_id and t.registered_at is not null
    where public.round_entry_eligible(r.id,null,t.id)
  ), totals as (
    select e.entry_type,e.participant_id,e.team_id,e.name,e.username,
      coalesce(sum(s.marks),0)::numeric total,count(s.id) scored_count
    from roster e left join public.round_scores s on s.round_id=target_round_id
      and ((e.participant_id is not null and s.participant_id=e.participant_id)
        or (e.team_id is not null and s.team_id=e.team_id))
    group by e.entry_type,e.participant_id,e.team_id,e.name,e.username
  ), complete as (
    select t.*,rank() over(order by t.total desc) place
    from totals t cross join criteria c where c.n>0 and t.scored_count=c.n
  ), cutoff as (
    select (select v.total from complete v order by v.total desc,v.name
      offset greatest(r.advancement_count-1,0) limit 1) value,
      r.advancement_count quota from round_info r
  ), boundary_stats as (
    select cutoff.value,cutoff.quota,
      count(*) filter(where complete.total>cutoff.value) above_count,
      count(*) filter(where complete.total=cutoff.value) tied_count
    from cutoff left join complete on true group by cutoff.value,cutoff.quota
  )
  select t.entry_type,t.participant_id,t.team_id,t.name,t.username,t.total,t.scored_count,
    c.place,
    (c.place is not null and b.value is not null and b.above_count<b.quota
      and b.above_count+b.tied_count>b.quota and t.total=b.value) boundary,
    case when c.place is null then 'incomplete'
      when b.value is null or t.total>b.value then 'advance'
      when t.total<b.value then 'eliminate'
      when b.above_count+b.tied_count>b.quota then 'unresolved'
      else 'advance' end provisional
  from totals t left join complete c on c.entry_type=t.entry_type
    and c.participant_id is not distinct from t.participant_id
    and c.team_id is not distinct from t.team_id
  cross join boundary_stats b;
$$;
revoke all on function vertex_private.round_ranking(uuid) from public,anon,authenticated;

create function public.round_advancement_preview(target_round_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r public.competition_rounds; rows jsonb; tied uuid[]; cutoff numeric;
  above_count integer; entry_count integer; incomplete_count integer; d public.round_advancement_decisions;
  decision_current boolean;
begin
  select * into r from public.competition_rounds where id=target_round_id;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can review advancement.' using errcode='42501';
  end if;
  select * into d from public.round_advancement_decisions where round_id=r.id;
  select coalesce(jsonb_agg(jsonb_build_object('entry_type',entry_type,'participant_id',participant_id,
    'team_id',team_id,'name',name,'username',username,'total',total,'scored_count',scored_count,
    'rank',rank,'boundary',boundary,'provisional',provisional)
    order by (rank is null),rank,total desc,lower(name)),'[]'::jsonb),
    coalesce(array_agg(coalesce(participant_id,team_id) order by coalesce(participant_id,team_id)) filter(where boundary),'{}'::uuid[]),
    max(total) filter(where boundary),count(*) filter(where provisional='advance' and not boundary),
    count(*),count(*) filter(where provisional='incomplete')
    into rows,tied,cutoff,above_count,entry_count,incomplete_count
    from vertex_private.round_ranking(r.id);
  decision_current := d.round_id is not null and d.boundary_ids=tied and d.boundary_score is not distinct from cutoff
    and d.entry_count=entry_count and d.cutoff_count=r.advancement_count;
  return jsonb_build_object('entries',rows,'boundary_ids',to_jsonb(tied),'boundary_score',cutoff,
    'above_count',above_count,'entry_count',entry_count,'incomplete_count',incomplete_count,
    'advancement_count',r.advancement_count,'decision_mode',case when decision_current then d.mode else 'unresolved' end,
    'selected_ids',case when decision_current then to_jsonb(d.selected_ids) else '[]'::jsonb end,
    'decision_stale',d.round_id is not null and not decision_current and d.finalised_at is null,
    'finalised',d.finalised_at is not null,'finalised_at',d.finalised_at,
    'criteria_count',(select count(*) from public.round_scoring_criteria where round_id=r.id),
    'is_final_round',not exists(select 1 from public.competition_rounds next where next.competition_id=r.competition_id and next.sequence=r.sequence+1));
end;
$$;

create function public.set_round_cutoff_decision(target_round_id uuid, decision_mode text, chosen_ids uuid[] default '{}')
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.competition_rounds; snapshot jsonb; boundary_ids uuid[]; selected uuid[] := '{}';
  above_count integer; needed integer;
begin
  select * into r from public.competition_rounds where id=target_round_id for update;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can decide cutoff ties.' using errcode='42501';
  end if;
  if r.judging_state='finalised' then raise exception 'Results are already finalised.' using errcode='23514'; end if;
  snapshot:=public.round_advancement_preview(r.id);
  select coalesce(array_agg(value::uuid order by value::uuid),'{}'::uuid[])
    into boundary_ids from jsonb_array_elements_text(snapshot->'boundary_ids');
  if cardinality(boundary_ids)=0 then raise exception 'No cutoff tie needs a decision.' using errcode='23514'; end if;
  above_count:=(snapshot->>'above_count')::integer;
  needed:=r.advancement_count-above_count;
  if decision_mode not in ('unresolved','include_all','exclude_all','manual') then
    raise exception 'Choose a valid cutoff decision.' using errcode='23514';
  end if;
  if decision_mode='include_all' then selected:=boundary_ids;
  elsif decision_mode='exclude_all' then
    if above_count=0 then raise exception 'Cannot exclude every entrant from advancement.' using errcode='23514'; end if;
  elsif decision_mode='manual' then
    select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into selected from unnest(coalesce(chosen_ids,'{}'::uuid[])) x;
    if cardinality(selected)<>needed or not selected<@boundary_ids then
      raise exception 'Select exactly % entries from the cutoff tie.',needed using errcode='23514';
    end if;
  end if;
  insert into public.round_advancement_decisions(round_id,mode,boundary_score,boundary_ids,selected_ids,
    entry_count,cutoff_count,decided_by,decided_at)
  values(r.id,decision_mode,(snapshot->>'boundary_score')::numeric,boundary_ids,selected,
    (snapshot->>'entry_count')::integer,r.advancement_count,auth.uid(),now())
  on conflict(round_id) do update set mode=excluded.mode,boundary_score=excluded.boundary_score,
    boundary_ids=excluded.boundary_ids,selected_ids=excluded.selected_ids,entry_count=excluded.entry_count,
    cutoff_count=excluded.cutoff_count,decided_by=excluded.decided_by,decided_at=excluded.decided_at;
end;
$$;

create function public.finalise_round_advancement(target_round_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.competition_rounds; snapshot jsonb; d public.round_advancement_decisions;
  item record; chosen boolean; final_round boolean; outcome text; labels text[];
begin
  select * into r from public.competition_rounds where id=target_round_id for update;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can finalise advancement.' using errcode='42501';
  end if;
  if r.judging_state='finalised' then raise exception 'Results are already finalised.' using errcode='23514'; end if;
  snapshot:=public.round_advancement_preview(r.id);
  if (snapshot->>'criteria_count')::integer=0 or (snapshot->>'entry_count')::integer=0
      or (snapshot->>'incomplete_count')::integer>0 then
    raise exception 'Score every active entry against every criterion before finalising.' using errcode='23514';
  end if;
  select * into d from public.round_advancement_decisions where round_id=r.id;
  if jsonb_array_length(snapshot->'boundary_ids')>0 and (snapshot->>'decision_mode')='unresolved' then
    raise exception 'Resolve the cutoff tie before finalising or publishing results.' using errcode='23514';
  end if;
  if jsonb_array_length(snapshot->'boundary_ids')=0 then
    insert into public.round_advancement_decisions(round_id,mode,entry_count,cutoff_count,decided_by,decided_at)
      values(r.id,'automatic',(snapshot->>'entry_count')::integer,r.advancement_count,auth.uid(),now())
    on conflict(round_id) do update set mode='automatic',boundary_score=null,boundary_ids='{}',selected_ids='{}',
      entry_count=excluded.entry_count,cutoff_count=excluded.cutoff_count,decided_by=excluded.decided_by,decided_at=excluded.decided_at;
  end if;
  final_round:=(snapshot->>'is_final_round')::boolean;
  for item in select * from vertex_private.round_ranking(r.id) loop
    chosen:=item.provisional='advance' or (item.boundary and item.provisional='unresolved'
      and coalesce(item.participant_id,item.team_id)=any(d.selected_ids));
    outcome:=case when chosen then case when final_round then 'winner' else 'advanced' end else 'eliminated' end;
    labels:=case when not chosen then '{}'::text[] when final_round then array['winner']
      when r.advancement_count<=3 then array['top_'||r.advancement_count::text,'finalist']
      else array['top_'||r.advancement_count::text] end;
    insert into public.round_advancement_records(round_id,participant_id,team_id,rank,total,status,tags)
      values(r.id,item.participant_id,item.team_id,item.rank,item.total,outcome,labels);
    if item.participant_id is not null then
      insert into public.round_participant_eligibility(round_id,participant_id,status,tags)
        values(r.id,item.participant_id,outcome,labels);
    else
      insert into public.round_participant_eligibility(round_id,participant_id,source_team_id,status,tags)
        select r.id,m.participant_id,item.team_id,outcome,labels
        from public.competition_team_members m where m.team_id=item.team_id;
    end if;
  end loop;
  update public.round_advancement_decisions set finalised_at=now(),finalised_by=auth.uid() where round_id=r.id;
  update public.competition_rounds set judging_state='finalised' where id=r.id;
end;
$$;

create function public.my_round_progress(target_competition_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); rows jsonb;
begin
  if actor is null then raise exception 'Sign in to view your round progress.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('round_id',r.id,'round_name',r.name,'round_slug',r.slug,
    'sequence',r.sequence,'status',e.status,'tags',e.tags,'team_id',e.source_team_id,
    'finalised_at',e.finalised_at) order by r.sequence),'[]'::jsonb) into rows
  from public.round_participant_eligibility e join public.competition_rounds r on r.id=e.round_id
  where r.competition_id=target_competition_id and e.participant_id=actor;
  return rows;
end;
$$;

-- A later milestone can schedule or publish only finalised result state.
create function vertex_private.guard_round_publication()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.leaderboard_state in ('scheduled','published') and old.leaderboard_state is distinct from new.leaderboard_state
    and not exists(select 1 from public.round_advancement_decisions d where d.round_id=new.id and d.finalised_at is not null) then
    raise exception 'Finalise advancement before publishing results.' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger guard_round_publication before update of leaderboard_state on public.competition_rounds
  for each row execute function vertex_private.guard_round_publication();

revoke all on function public.round_advancement_preview(uuid),public.set_round_cutoff_decision(uuid,text,uuid[]),
  public.finalise_round_advancement(uuid),public.my_round_progress(uuid) from public,anon;
grant execute on function public.round_advancement_preview(uuid),public.set_round_cutoff_decision(uuid,text,uuid[]),
  public.finalise_round_advancement(uuid),public.my_round_progress(uuid) to authenticated;


-- Existing scoring and submission APIs use the authoritative round roster.
create or replace function public.round_scoring_roster(target_round_id uuid)
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
    where i.competition_id = r.competition_id and public.round_entry_eligible(r.id,i.participant_id,null)
    union all
    select 'team', null::uuid, t.id, t.name, null::text
    from public.competition_teams t where t.competition_id = r.competition_id and t.registered_at is not null and public.round_entry_eligible(r.id,null,t.id)
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

create or replace function public.save_round_scores(target_round_id uuid, target_participant_id uuid,
  target_team_id uuid, score_items jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.competition_rounds; item jsonb; criterion public.round_scoring_criteria;
  entered numeric; seen uuid[] := '{}'; requested_criterion_id uuid;
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
  if not public.round_entry_eligible(r.id,target_participant_id,target_team_id) then
    raise exception 'Entry is not active in this round.' using errcode = '42501';
  end if;
  if jsonb_typeof(score_items) <> 'array' or jsonb_array_length(score_items) > 100 then
    raise exception 'Scores must be a list of criteria.' using errcode = '23514';
  end if;
  for item in select value from jsonb_array_elements(score_items) loop
    begin requested_criterion_id := (item->>'criterion_id')::uuid; exception when others then
      raise exception 'Invalid criterion.' using errcode = '23514'; end;
    if requested_criterion_id = any(seen) then raise exception 'Criterion repeated.' using errcode = '23514'; end if;
    seen := array_append(seen,requested_criterion_id);
    select * into criterion from public.round_scoring_criteria where id = requested_criterion_id and round_id = r.id;
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

create or replace function public.public_round_scores(target_round_id uuid)
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
    where i.competition_id = r.competition_id and public.round_entry_eligible(r.id,i.participant_id,null)
    union all
    select 'team', null::uuid, t.id, t.name, null::text
    from public.competition_teams t where t.competition_id = r.competition_id and t.registered_at is not null and public.round_entry_eligible(r.id,null,t.id)
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

create or replace function public.can_view_round_submission_config(target_round_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.competition_rounds r join public.competitions c on c.id = r.competition_id
    where r.id = target_round_id and (
      public.can_manage_competition(c.id)
      or (c.status = 'published' and (
        exists (select 1 from public.individual_registrations i
          where i.competition_id = c.id and i.participant_id = auth.uid()
            and public.round_entry_eligible(r.id,i.participant_id,null))
        or exists (select 1 from public.competition_team_members m
          join public.competition_teams t on t.id = m.team_id and t.registered_at is not null
          where m.competition_id = c.id and m.participant_id = auth.uid()
            and public.round_entry_eligible(r.id,null,t.id))
      ))
    )
  );
$$;

create or replace function public.can_upload_round_submission_file(object_name text, object_size bigint, object_mime text)
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
      or (object_size is not null and (object_size < 1 or object_size > 26214400)) then
    return false;
  end if;
  target_round_id := round_text::uuid;
  return exists (
    select 1 from public.round_submission_configs cfg
    join public.competition_rounds r on r.id = cfg.round_id
    join public.competitions c on c.id = r.competition_id
    where cfg.round_id = target_round_id and cfg.enabled and cfg.mode in ('file','mixed')
      and c.status = 'published' and now() >= cfg.opens_at and now() < cfg.closes_at
      and (object_size is null or object_size <= cfg.max_file_bytes)
      and (object_mime is null or object_mime = any(cfg.allowed_mime_types))
      and (
        exists (select 1 from public.individual_registrations i
          where i.competition_id = c.id and i.participant_id = actor
            and public.round_entry_eligible(r.id,actor,null))
        or exists (select 1 from public.competition_teams t
          where t.competition_id = c.id and t.captain_id = actor and t.registered_at is not null
            and public.round_entry_eligible(r.id,null,t.id))
      )
  );
end;
$$;

create or replace function public.save_round_submission(
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
  if not public.round_entry_eligible(r.id,case when target_team_id is null then actor end,target_team_id) then
    raise exception 'Entry is not active in this round.' using errcode = '42501';
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

create or replace function public.organiser_round_submission_review(
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
    where i.competition_id = comp_id and public.round_entry_eligible(target_round_id,i.participant_id,null)
    union all
    select 'team', null::uuid, t.id, t.name, null::text, t.registered_at
    from public.competition_teams t where t.competition_id = comp_id and t.registered_at is not null
      and public.round_entry_eligible(target_round_id,null,t.id)
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
    where i.competition_id = comp_id and public.round_entry_eligible(target_round_id,i.participant_id,null)
    union all
    select 'team', null::uuid, t.id, t.name, null::text, t.registered_at
    from public.competition_teams t where t.competition_id = comp_id and t.registered_at is not null
      and public.round_entry_eligible(target_round_id,null,t.id)
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

create function public.my_round_entry_eligible(target_round_id uuid)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); r public.competition_rounds;
begin
  if actor is null then return false; end if;
  select * into r from public.competition_rounds where id=target_round_id;
  if r.id is null then return false; end if;
  return public.round_entry_eligible(r.id,actor,null)
    or exists(select 1 from public.competition_team_members m
      where m.competition_id=r.competition_id and m.participant_id=actor
        and public.round_entry_eligible(r.id,null,m.team_id));
end;
$$;
revoke all on function public.my_round_entry_eligible(uuid) from public,anon;
grant execute on function public.my_round_entry_eligible(uuid) to authenticated;

-- Direct inserts and updates remain protected if a caller bypasses the RPC.
create function vertex_private.guard_round_submission_eligibility()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.round_entry_eligible(new.round_id,new.participant_id,new.team_id) then
    raise exception 'Entry is not active in this round.' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger guard_round_submission_eligibility before insert or update on public.round_submissions
  for each row execute function vertex_private.guard_round_submission_eligibility();

commit;
