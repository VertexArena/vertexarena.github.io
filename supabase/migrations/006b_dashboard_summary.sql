-- Milestone 8: owner-scoped dashboard counts and recent registration activity.
begin;

create function public.organiser_dashboard_summary()
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
    'id', c.id, 'name', c.name, 'slug', c.slug, 'status', c.status,
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
  from public.competitions c where c.owner_id = actor;

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
    where c.owner_id = actor
    union all
    select 'team_registration', c.name, c.slug, t.name, t.registered_at
    from public.competition_teams t
    join public.competitions c on c.id = t.competition_id
    where c.owner_id = actor and t.registered_at is not null
    union all
    select 'competition_updated', c.name, c.slug, c.name, c.updated_at
    from public.competitions c where c.owner_id = actor
    order by occurred_at desc limit 12
  ) activity;

  return jsonb_build_object('competitions', competitions_json, 'recent_activity', activity_json);
end;
$$;

revoke all on function public.organiser_dashboard_summary() from public, anon;
grant execute on function public.organiser_dashboard_summary() to authenticated;

commit;
