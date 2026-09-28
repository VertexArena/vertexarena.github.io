-- Correct PL/pgSQL variable collision found in browser scoring flow.
begin;
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
commit;
