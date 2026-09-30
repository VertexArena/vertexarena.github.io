-- Milestone 18: private, on-demand recommendations from existing activity.
-- No browsing events, shared participant model, or duplicated preference state.
begin;

create function public.competition_recommendations()
returns jsonb language plpgsql stable security definer
set search_path = '' as $$
declare
  actor uuid := auth.uid();
  person public.profiles;
  years integer;
  recommendations jsonb;
begin
  select * into person from public.profiles where id = actor;
  if actor is null or person.account_type is distinct from 'participant' then
    raise exception 'Log in as a participant to see your recommendations.' using errcode = '42501';
  end if;
  if person.birthday is null then
    return jsonb_build_object('has_history', false, 'needs_birthday', true, 'for_you', '[]'::jsonb, 'new_to_you', '[]'::jsonb);
  end if;
  years := extract(year from age(current_date, person.birthday))::integer;

  with entries as materialized (
    select r.competition_id, 'individual'::text as format, r.created_at as happened_at
    from public.individual_registrations r where r.participant_id = actor
    union all
    select m.competition_id, 'team', t.registered_at
    from public.competition_team_members m
    join public.competition_teams t on t.id = m.team_id
    where m.participant_id = actor and t.registered_at is not null
  ), activity as materialized (
    select e.competition_id, e.format, 6.0 * (1 + exp(-greatest(0, extract(epoch from (now() - e.happened_at))) / 7776000.0)) as weight
    from entries e
    union all
    select b.competition_id, c.team_mode::text,
      3.0 * (1 + exp(-greatest(0, extract(epoch from (now() - b.created_at))) / 7776000.0))
    from public.competition_bookmarks b join public.competitions c on c.id = b.competition_id
    where b.participant_id = actor
  ), interests as materialized (
    select tag, sum(a.weight) as weight
    from activity a join public.competitions c on c.id = a.competition_id
    cross join lateral unnest(c.field_tags) tag
    group by tag
  ), formats as (
    select coalesce(sum(weight) filter (where format = 'team'), 0) as team,
      coalesce(sum(weight) filter (where format = 'individual'), 0) as individual
    from activity
  ), candidates as materialized (
    select c.id, c.registration_closes_at, c.field_tags,
      exists(select 1 from activity) as has_history,
      coalesce(affinity.weight, 0) as affinity,
      affinity.favourite,
      not exists(select 1 from interests i where i.tag = any(c.field_tags)) as unfamiliar,
      exists(select 1 from public.competition_bookmarks b where b.participant_id = actor and b.competition_id = c.id) as saved,
      case when f.team > f.individual and c.team_mode in ('team', 'both') then 'Team options, like your past entries and saves'
           when f.individual > f.team and c.team_mode in ('individual', 'both') then 'Individual options, like your past entries and saves' end as format_reason,
      coalesce(affinity.weight, 0) / greatest(cardinality(c.field_tags), 1)
        + case when (f.team > f.individual and c.team_mode in ('team', 'both'))
                    or (f.individual > f.team and c.team_mode in ('individual', 'both')) then 8 else 0 end
        + case when exists(select 1 from public.competition_bookmarks b where b.participant_id = actor and b.competition_id = c.id) then 5 else 0 end
        + 2.0 / (1 + greatest(0, extract(epoch from (c.registration_closes_at - now()))) / 604800.0)
        + case when c.registration_opens_at <= now() then 0.5 else 0 end as score
    from public.competitions c cross join formats f
    left join lateral (
      select sum(i.weight) as weight, (array_agg(i.tag order by i.weight desc, i.tag))[1] as favourite
      from interests i where i.tag = any(c.field_tags)
    ) affinity on true
    where c.status = 'published' and c.registration_closes_at > now()
      and (c.minimum_age is null or years >= c.minimum_age)
      and (c.maximum_age is null or years <= c.maximum_age)
      and not exists(select 1 from entries e where e.competition_id = c.id)
  ), diverse as (
    select c.*, row_number() over (partition by field_tags[1] order by score desc, registration_closes_at, id) as field_order
    from candidates c
  ), primary_picks as materialized (
    select * from diverse
    order by case when has_history then 0 else field_order end, score desc, registration_closes_at, id limit 3
  ), exploratory_picks as (
    select d.* from diverse d where not exists(select 1 from primary_picks p where p.id = d.id)
      and (not d.has_history or d.unfamiliar)
      and (d.has_history or not exists(select 1 from primary_picks p where p.field_tags && d.field_tags))
    order by field_order, registration_closes_at, id limit 3
  )
  select jsonb_build_object(
    'has_history', exists(select 1 from activity), 'needs_birthday', false,
    'for_you', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'reasons',
      to_jsonb(array_remove(array[
        case when p.favourite is not null then 'More ' || p.favourite || ', based on your entries and saves' end,
        p.format_reason, case when p.saved then 'Saved by you' end,
        case when p.registration_closes_at <= now() + interval '7 days' then 'Registration closes within 7 days'
             when not p.has_history then 'An eligible opportunity to get started' end
      ]::text[], null))) order by case when p.has_history then 0 else p.field_order end, p.score desc, p.registration_closes_at, p.id)
      from primary_picks p), '[]'::jsonb),
    'new_to_you', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'reasons',
      jsonb_build_array(case when p.has_history then 'Explore ' || p.field_tags[1] || ' beyond your usual fields'
                       else 'Try a different field: ' || p.field_tags[1] end))
      order by p.field_order, p.registration_closes_at, p.id) from exploratory_picks p), '[]'::jsonb)
  ) into recommendations;
  return recommendations;
end;
$$;
revoke all on function public.competition_recommendations() from public, anon;
grant execute on function public.competition_recommendations() to authenticated;
comment on function public.competition_recommendations() is
  'Own participant history only. Recent entries and bookmarks receive a 90-day exponential recency boost. Returns at most six public competition IDs and explanations; no birthdays or other users'' activity.';

commit;
