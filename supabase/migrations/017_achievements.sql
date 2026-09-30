-- Milestone 19: immutable activity receipts, authoritative awards and private progress.
begin;
alter table public.profiles add column achievements_public boolean not null default false;

create table public.achievement_definitions (
  code text primary key,
  title text not null,
  description text not null,
  metric text not null check (metric in ('competitions','team','individual','submissions','advanced','finalist','winner','category_winner','fields')),
  target integer not null check (target > 0),
  icon text not null check (icon ~ '^[a-z-]+$'),
  position integer not null unique
);
insert into public.achievement_definitions values
  ('first_competition','First competition','Register for your first competition.','competitions',1,'flag-checkered',1),
  ('three_competitions','Keep exploring','Register for three different competitions.','competitions',3,'compass',2),
  ('five_competitions','Build momentum','Register for five different competitions.','competitions',5,'layer-group',3),
  ('ten_competitions','Sustained curiosity','Register for ten different competitions.','competitions',10,'mountain',4),
  ('first_individual','Your own path','Complete your first individual registration.','individual',1,'user',5),
  ('first_team','Better together','Register with a team for the first time.','team',1,'user-group',6),
  ('first_submission','First submission','Submit your first round entry, individually or with your team.','submissions',1,'paper-plane',7),
  ('five_submissions','Show your work','Submit entries in five different rounds.','submissions',5,'folder-open',8),
  ('first_advancement','First advancement','Advance to another round in published results.','advanced',1,'arrow-trend-up',9),
  ('finalist','Finalist','Earn finalist eligibility in published results.','finalist',1,'medal',10),
  ('winner','Winner','Earn an overall winner result in a final round.','winner',1,'trophy',11),
  ('category_winner','Category winner','Receive a category award in published results.','category_winner',1,'award',12),
  ('field_explorer','Across the fields','Register in competitions covering three different fields.','fields',3,'seedling',13);

create table vertex_private.achievement_events (
  participant_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('registration','submission','result')),
  source_id uuid not null,
  happened_at timestamptz not null,
  format text check (format in ('individual','team')),
  fields text[] not null default '{}',
  tags text[] not null default '{}',
  primary key (participant_id,kind,source_id)
);
-- Receipts retain earned lifetime milestones if an organiser later deletes a
-- competition. They contain no competition names, submission content or scores.
create table public.participant_achievements (
  participant_id uuid not null references public.profiles(id) on delete cascade,
  achievement_code text not null references public.achievement_definitions(code),
  earned_at timestamptz not null,
  primary key (participant_id,achievement_code)
);
create index participant_achievements_code_idx on public.participant_achievements(achievement_code);
create table public.participant_achievement_progress (
  participant_id uuid primary key references public.profiles(id) on delete cascade,
  counts jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.achievement_definitions enable row level security;
alter table vertex_private.achievement_events enable row level security;
alter table public.participant_achievements enable row level security;
alter table public.participant_achievement_progress enable row level security;
revoke all on public.achievement_definitions, public.participant_achievements,
  public.participant_achievement_progress, vertex_private.achievement_events from public,anon,authenticated;
grant select on public.achievement_definitions,public.participant_achievements to anon,authenticated;
grant select on public.participant_achievement_progress to authenticated;
create policy achievement_definitions_read on public.achievement_definitions for select to anon,authenticated using (true);
create policy achievement_progress_own on public.participant_achievement_progress for select to authenticated
  using (participant_id=(select auth.uid()));

create function public.achievements_visible(target_participant_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=target_participant_id and p.account_type='participant'
    and (p.id=auth.uid() or (p.achievements_public and p.profile_completed_at is not null)));
$$;
revoke all on function public.achievements_visible(uuid) from public;
grant execute on function public.achievements_visible(uuid) to anon,authenticated;
create policy achievement_awards_read on public.participant_achievements for select to anon,authenticated
  using (public.achievements_visible(participant_id));

create function vertex_private.achievement_progress(target_actor uuid)
returns table(code text,metric text,progress integer,earned_at timestamptz)
language sql stable security definer set search_path='' as $$
  with receipts as materialized (
    select * from vertex_private.achievement_events where participant_id=target_actor
  ), activity as (
    select 'competitions'::text metric,source_id::text source,happened_at from receipts where kind='registration'
    union all select format,source_id::text,happened_at from receipts where kind='registration'
    union all select 'submissions',source_id::text,happened_at from receipts where kind='submission'
    union all select tag,source_id::text,happened_at from receipts
      cross join lateral unnest(tags) tag where kind='result' and tag in ('advanced','finalist','winner','category_winner')
    union all select 'fields',field,min(happened_at) from receipts cross join lateral unnest(fields) field
      where kind='registration' group by field
  ), numbered as (
    select *,row_number() over(partition by metric order by happened_at,source) sequence from activity
  )
  select d.code,d.metric,count(n.metric)::integer,
    max(n.happened_at) filter(where n.sequence=d.target)
  from public.achievement_definitions d left join numbered n on n.metric=d.metric group by d.code;
$$;

create function vertex_private.record_achievement_event(target_actor uuid,event_kind text,event_source uuid,
  event_time timestamptz,event_format text default null,event_fields text[] default '{}',event_tags text[] default '{}',notify boolean default true)
returns void language plpgsql security definer set search_path='' as $$
declare inserted uuid; earned text; award record; counts jsonb; person public.profiles;
begin
  select * into person from public.profiles where id=target_actor and account_type='participant';
  if person.id is null then return; end if;
  -- Serialise receipts and awards for concurrent registrations/submissions.
  perform pg_advisory_xact_lock(hashtextextended(target_actor::text,19));
  insert into vertex_private.achievement_events(participant_id,kind,source_id,happened_at,format,fields,tags)
    values(target_actor,event_kind,event_source,event_time,event_format,event_fields,event_tags)
    on conflict do nothing returning participant_id into inserted;
  if inserted is null then return; end if;
  for award in select p.*,d.title,d.description from vertex_private.achievement_progress(target_actor) p
    join public.achievement_definitions d on d.code=p.code where p.earned_at is not null loop
    earned:=null;
    insert into public.participant_achievements(participant_id,achievement_code,earned_at)
      values(target_actor,award.code,award.earned_at) on conflict do nothing returning achievement_code into earned;
    if earned is not null and notify then
      insert into public.notifications(recipient_id,kind,title,body,link_path)
        values(target_actor,'achievement_earned','Achievement earned: '||award.title,award.description,
          '/profile/@'||person.username);
    elsif earned is null then
      update public.participant_achievements set earned_at=least(earned_at,award.earned_at)
        where participant_id=target_actor and achievement_code=award.code;
    end if;
  end loop;
  select coalesce(jsonb_object_agg(metric,progress),'{}'::jsonb) into counts
    from (select distinct metric,progress from vertex_private.achievement_progress(target_actor)) metrics;
  insert into public.participant_achievement_progress(participant_id,counts) values(target_actor,counts)
    on conflict(participant_id) do update set counts=excluded.counts,updated_at=now();
end;
$$;

create function vertex_private.on_achievement_registration()
returns trigger language plpgsql security definer set search_path='' as $$
declare c public.competitions; actor uuid;
begin
  select * into c from public.competitions where id=new.competition_id;
  if tg_table_name='individual_registrations' then
    perform vertex_private.record_achievement_event(new.participant_id,'registration',c.id,new.created_at,'individual',c.field_tags);
  elsif new.registered_at is not null and old.registered_at is null then
    for actor in select participant_id from public.competition_team_members where team_id=new.id order by participant_id loop
      perform vertex_private.record_achievement_event(actor,'registration',c.id,new.registered_at,'team',c.field_tags);
    end loop;
  end if;
  return new;
end;
$$;
create trigger achievement_individual_entry after insert on public.individual_registrations
  for each row execute function vertex_private.on_achievement_registration();
create trigger achievement_team_entry after update of registered_at on public.competition_teams
  for each row execute function vertex_private.on_achievement_registration();

create function vertex_private.on_achievement_submission()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  if new.participant_id is not null then
    perform vertex_private.record_achievement_event(new.participant_id,'submission',new.id,new.first_submitted_at);
  else
    for actor in select participant_id from public.competition_team_members where team_id=new.team_id order by participant_id loop
      perform vertex_private.record_achievement_event(actor,'submission',new.id,new.first_submitted_at);
    end loop;
  end if;
  return new;
end;
$$;
create trigger achievement_submission after insert on public.round_submissions
  for each row execute function vertex_private.on_achievement_submission();

create function vertex_private.on_achievement_publication()
returns trigger language plpgsql security definer set search_path='' as $$
declare outcome record; labels text[];
begin
  if new.leaderboard_state<>'published' or old.leaderboard_state='published' then return new; end if;
  for outcome in select * from public.round_participant_eligibility where round_id=new.id order by participant_id loop
    labels:=outcome.tags || array[outcome.status];
    if exists(select 1 from public.round_category_winners w where w.round_id=new.id
      and (w.participant_id=outcome.participant_id or w.team_id=outcome.source_team_id)) then
      labels:=array_append(labels,'category_winner');
    end if;
    select array_agg(distinct label) into labels from unnest(labels) label;
    perform vertex_private.record_achievement_event(outcome.participant_id,'result',new.id,
      new.leaderboard_published_at,null,'{}',labels);
  end loop;
  return new;
end;
$$;
create trigger zz_achievement_publication after update of leaderboard_state on public.competition_rounds
  for each row execute function vertex_private.on_achievement_publication();

create function public.my_achievements()
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); shared boolean; items jsonb;
begin
  select achievements_public into shared from public.profiles where id=actor and account_type='participant';
  if shared is null then raise exception 'Log in as a participant to view achievement progress.' using errcode='42501'; end if;
  select jsonb_agg(jsonb_build_object('code',d.code,'title',d.title,'description',d.description,'icon',d.icon,
    'target',d.target,'progress',least(d.target,coalesce((p.counts->>d.metric)::integer,0)),
    'earned_at',a.earned_at) order by d.position) into items
  from public.achievement_definitions d
  left join public.participant_achievement_progress p on p.participant_id=actor
  left join public.participant_achievements a on a.participant_id=actor and a.achievement_code=d.code;
  return jsonb_build_object('publicly_visible',shared,'items',items);
end;
$$;
create function public.profile_achievements(target_username text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('code',d.code,'title',d.title,'description',d.description,
    'icon',d.icon,'earned_at',a.earned_at) order by a.earned_at desc,d.position),'[]'::jsonb)
  from public.profiles p join public.participant_achievements a on a.participant_id=p.id
  join public.achievement_definitions d on d.code=a.achievement_code
  where lower(p.username::text)=lower(target_username) and p.account_type='participant'
    and p.achievements_public and p.profile_completed_at is not null;
$$;
revoke all on function public.my_achievements() from public,anon;
grant execute on function public.my_achievements() to authenticated;
revoke all on function public.profile_achievements(text) from public;
grant execute on function public.profile_achievements(text) to anon,authenticated;
revoke all on function vertex_private.achievement_progress(uuid),
  vertex_private.record_achievement_event(uuid,text,uuid,timestamptz,text,text[],text[],boolean),
  vertex_private.on_achievement_registration(),vertex_private.on_achievement_submission(),
  vertex_private.on_achievement_publication() from public,anon,authenticated;

-- Quiet backfill from existing authoritative activity; no retrospective notices.
do $$
declare item record;
begin
  for item in select r.participant_id,r.competition_id,r.created_at,c.field_tags from public.individual_registrations r
    join public.competitions c on c.id=r.competition_id order by r.created_at loop
    perform vertex_private.record_achievement_event(item.participant_id,'registration',item.competition_id,item.created_at,'individual',item.field_tags,'{}',false);
  end loop;
  for item in select m.participant_id,t.competition_id,t.registered_at,c.field_tags from public.competition_team_members m
    join public.competition_teams t on t.id=m.team_id join public.competitions c on c.id=t.competition_id
    where t.registered_at is not null order by t.registered_at loop
    perform vertex_private.record_achievement_event(item.participant_id,'registration',item.competition_id,item.registered_at,'team',item.field_tags,'{}',false);
  end loop;
  for item in select s.id,s.first_submitted_at,s.participant_id actor from public.round_submissions s where s.participant_id is not null
    union all select s.id,s.first_submitted_at,m.participant_id from public.round_submissions s
      join public.competition_team_members m on m.team_id=s.team_id loop
    perform vertex_private.record_achievement_event(item.actor,'submission',item.id,item.first_submitted_at,null,'{}','{}',false);
  end loop;
  for item in select e.*,r.leaderboard_published_at from public.round_participant_eligibility e
    join public.competition_rounds r on r.id=e.round_id where r.leaderboard_state='published' loop
    perform vertex_private.record_achievement_event(item.participant_id,'result',item.round_id,item.leaderboard_published_at,
      null,'{}',(select array_agg(distinct t) from unnest(item.tags||array[item.status]) t),false);
  end loop;
end;
$$;
alter publication supabase_realtime add table public.participant_achievement_progress;
commit;
