-- Organiser category assignment needs complete round candidate lists.
begin;
create function public.round_category_candidates(target_round_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r public.competition_rounds; rows jsonb;
begin
  select * into r from public.competition_rounds where id=target_round_id;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can review category winners.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('category',category,'winner_id',winner_id,
    'entries',entries) order by lower(category)),'[]'::jsonb) into rows from (
    select roster.category,
      (select coalesce(w.participant_id,w.team_id) from public.round_category_winners w
        where w.round_id=r.id and w.category=roster.category) winner_id,
      jsonb_agg(jsonb_build_object('id',coalesce(roster.participant_id,roster.team_id),
        'participant_id',roster.participant_id,'team_id',roster.team_id,
        'name',roster.display_name,'username',roster.username,'rank',roster.rank,
        'total',roster.total) order by roster.rank,lower(roster.display_name)) entries
    from vertex_private.leaderboard_roster(r.id) roster
    where roster.category is not null
    group by roster.category
  ) grouped;
  return rows;
end;
$$;
revoke all on function public.round_category_candidates(uuid) from public,anon,authenticated;
grant execute on function public.round_category_candidates(uuid) to authenticated;
commit;
