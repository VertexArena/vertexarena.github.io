-- Finalised rounds no longer have outstanding submission work.
begin;
create or replace function vertex_private.generate_deadline_reminders()
returns void language plpgsql security definer set search_path='' as $$
declare item record; created uuid;
begin
  -- A single reminder in the last 24 hours for eligible bookmarked registration
  -- deadlines and unfinished, active round work. Changed deadlines get a new receipt.
  for item in
    select b.participant_id actor,c.id competition,c.id source,'registration'::text kind,
      c.registration_closes_at due_at,'Registration closes soon'::text title,
      'Registration for '||c.name||' closes within 24 hours.' body,
      '/competition/'||c.slug||'/register' path
    from public.competition_bookmarks b join public.competitions c on c.id=b.competition_id
      join public.profiles p on p.id=b.participant_id
    where c.status='published' and c.registration_closes_at>now() and c.registration_closes_at<=now()+interval '24 hours'
      and (c.minimum_age is null or extract(year from age(current_date,p.birthday))>=c.minimum_age)
      and (c.maximum_age is null or extract(year from age(current_date,p.birthday))<=c.maximum_age)
      and not exists(select 1 from public.individual_registrations i where i.competition_id=c.id and i.participant_id=b.participant_id)
      and not exists(select 1 from public.competition_team_members m join public.competition_teams t on t.id=m.team_id
        where m.competition_id=c.id and m.participant_id=b.participant_id and t.registered_at is not null)
    union all
    select roster.actor,c.id,r.id,'submission',cfg.closes_at,'Submission closes soon',
      case when roster.team_id is null then 'Your ' else 'Your team’s ' end||r.name||' submission for '||c.name||' closes within 24 hours.',
      '/competition/'||c.slug||'/submissions/'||r.slug
    from public.round_submission_configs cfg join public.competition_rounds r on r.id=cfg.round_id
      join public.competitions c on c.id=r.competition_id
      join lateral (
        select i.participant_id actor,null::uuid team_id from public.individual_registrations i where i.competition_id=c.id
        union all select m.participant_id,t.id from public.competition_team_members m
          join public.competition_teams t on t.id=m.team_id where t.competition_id=c.id and t.registered_at is not null
      ) roster on true
    where c.status='published' and r.judging_state<>'finalised' and cfg.enabled and cfg.opens_at<=now() and cfg.closes_at>now()
      and cfg.closes_at<=now()+interval '24 hours'
      and (r.sequence=1 or exists(select 1 from public.competition_rounds prev where prev.competition_id=c.id
        and prev.sequence=r.sequence-1 and prev.leaderboard_state='published'))
      and public.round_entry_eligible(r.id,case when roster.team_id is null then roster.actor end,roster.team_id)
      and not exists(select 1 from public.round_submissions sub where sub.round_id=r.id
        and ((roster.team_id is null and sub.participant_id=roster.actor) or sub.team_id=roster.team_id))
  loop
    created:=null;
    insert into vertex_private.deadline_reminders(user_id,competition_id,source_id,source_kind,due_at)
      values(item.actor,item.competition,item.source,item.kind,item.due_at) on conflict do nothing returning user_id into created;
    if created is not null then
      insert into public.notifications(recipient_id,competition_id,kind,title,body,link_path)
        values(item.actor,item.competition,'deadline_reminder',item.title,item.body,item.path);
    end if;
  end loop;
end;
$$;
commit;
