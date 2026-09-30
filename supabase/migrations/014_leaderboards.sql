-- Milestone 16: scheduled, historical round leaderboards.
begin;

create extension if not exists pg_cron;

alter table public.competition_rounds
  add column leaderboard_published_at timestamptz,
  add constraint competition_rounds_leaderboard_state_check
    check (leaderboard_state in ('unpublished','scheduled','published'));
create index competition_rounds_due_leaderboard_idx
  on public.competition_rounds(leaderboard_releases_at)
  where leaderboard_state='scheduled';
create index round_advancement_rank_idx
  on public.round_advancement_records(round_id,rank,total desc);

create table public.round_category_winners (
  round_id uuid not null references public.competition_rounds(id) on delete cascade,
  category text not null check (length(btrim(category)) between 1 and 80),
  participant_id uuid references public.profiles(id) on delete cascade,
  team_id uuid references public.competition_teams(id) on delete cascade,
  chosen_by uuid references public.profiles(id) on delete set null,
  chosen_at timestamptz not null default now(),
  primary key(round_id,category),
  check ((participant_id is null) <> (team_id is null))
);
create index round_category_winners_participant_idx on public.round_category_winners(participant_id) where participant_id is not null;
create index round_category_winners_team_idx on public.round_category_winners(team_id) where team_id is not null;
create index round_category_winners_chosen_by_idx on public.round_category_winners(chosen_by);
alter table public.round_category_winners enable row level security;
revoke all on public.round_category_winners from public,anon,authenticated;
grant select on public.round_category_winners to anon,authenticated;
create policy round_category_winners_read on public.round_category_winners for select to anon,authenticated
  using (public.can_manage_competition((select competition_id from public.competition_rounds where id=round_id))
    or exists(select 1 from public.competition_rounds r join public.competitions c on c.id=r.competition_id
      where r.id=round_id and c.status='published' and r.leaderboard_state='published'
        and r.leaderboard_published_at is not null));

-- This roster reads saved round results, never current score entries.
create function vertex_private.leaderboard_roster(target_round_id uuid)
returns table(record_id uuid,participant_id uuid,team_id uuid,display_name text,username text,
  category text,rank integer,total numeric,status text,tags text[])
language sql stable security definer set search_path=public,pg_temp as $$
  select a.id,a.participant_id,a.team_id,
    coalesce(p.full_name,t.name)::text, p.username::text,
    coalesce(i.category,t.category),a.rank,a.total,a.status,a.tags
  from public.round_advancement_records a
  join public.competition_rounds r on r.id=a.round_id
  left join public.profiles p on p.id=a.participant_id
  left join public.individual_registrations i on i.competition_id=r.competition_id and i.participant_id=a.participant_id
  left join public.competition_teams t on t.id=a.team_id
  where a.round_id=target_round_id;
$$;
revoke all on function vertex_private.leaderboard_roster(uuid) from public,anon,authenticated;

-- Category winners are explicit organiser choices from finalised round entries.
create function public.set_round_category_winner(target_round_id uuid,target_category text,
  target_participant_id uuid default null,target_team_id uuid default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.competition_rounds; c public.competitions; clean_category text:=btrim(coalesce(target_category,''));
begin
  select * into r from public.competition_rounds where id=target_round_id for update;
  select * into c from public.competitions where id=r.competition_id;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can choose category winners.' using errcode='42501';
  end if;
  if r.judging_state<>'finalised' or r.leaderboard_state='published' then
    raise exception 'Finalise scoring first; published winners cannot be changed.' using errcode='23514';
  end if;
  if not clean_category=any(c.categories) then
    raise exception 'Choose a competition category.' using errcode='23514';
  end if;
  if target_participant_id is null and target_team_id is null then
    if r.leaderboard_state='scheduled' then
      raise exception 'Return leaderboard to draft before removing a category winner.' using errcode='23514';
    end if;
    delete from public.round_category_winners where round_id=r.id and category=clean_category;
    return;
  end if;
  if (target_participant_id is null)=(target_team_id is null) or not exists (
    select 1 from vertex_private.leaderboard_roster(r.id) entry
    where entry.category=clean_category and entry.participant_id is not distinct from target_participant_id
      and entry.team_id is not distinct from target_team_id
  ) then raise exception 'Winner must be an entry in this round and category.' using errcode='23514'; end if;
  insert into public.round_category_winners(round_id,category,participant_id,team_id,chosen_by)
    values(r.id,clean_category,target_participant_id,target_team_id,auth.uid())
  on conflict(round_id,category) do update set participant_id=excluded.participant_id,
    team_id=excluded.team_id,chosen_by=excluded.chosen_by,chosen_at=now();
end;
$$;

-- Existing publication guard gains timestamp and category integrity checks.
create or replace function vertex_private.guard_round_publication()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare next_open timestamptz; missing_categories integer;
begin
  if old.leaderboard_state='published' and (new.leaderboard_state is distinct from old.leaderboard_state
      or new.leaderboard_releases_at is distinct from old.leaderboard_releases_at) then
    raise exception 'Published round results are immutable.' using errcode='23514';
  end if;
  if new.leaderboard_state in ('scheduled','published') then
    if new.judging_state<>'finalised' or not exists (
      select 1 from public.round_advancement_decisions d where d.round_id=new.id and d.finalised_at is not null
    ) then raise exception 'Finalise advancement before releasing results.' using errcode='23514'; end if;
    select count(*) into missing_categories from (
      select distinct entry.category from vertex_private.leaderboard_roster(new.id) entry
      where entry.category is not null
    ) categories where not exists (
      select 1 from public.round_category_winners w where w.round_id=new.id and w.category=categories.category
    );
    if missing_categories>0 then
      raise exception 'Choose a winner for every represented category before release.' using errcode='23514';
    end if;
  end if;
  if new.leaderboard_state='scheduled' then
    if new.leaderboard_releases_at is null or new.leaderboard_releases_at<=now()
        or new.leaderboard_releases_at<new.submission_deadline then
      raise exception 'Choose a future release after the submission deadline.' using errcode='23514';
    end if;
    select opens_at into next_open from public.competition_rounds
      where competition_id=new.competition_id and sequence=new.sequence+1;
    if next_open is not null and new.leaderboard_releases_at>next_open then
      raise exception 'Release results before the next round opens.' using errcode='23514';
    end if;
  elsif new.leaderboard_state='published' and old.leaderboard_state<>'published' then
    if now()<new.submission_deadline then
      raise exception 'The submission deadline must pass before publication.' using errcode='23514';
    end if;
    new.leaderboard_published_at:=now();
  end if;
  return new;
end;
$$;
drop trigger guard_round_publication on public.competition_rounds;
create trigger guard_round_publication before update of leaderboard_state,leaderboard_releases_at
  on public.competition_rounds for each row execute function vertex_private.guard_round_publication();

-- Atomic notification and internal award tagging on first publication.
create function vertex_private.on_round_leaderboard_published()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.competitions;
begin
  if new.leaderboard_state<>'published' or old.leaderboard_state='published' then return new; end if;
  select * into c from public.competitions where id=new.competition_id;
  update public.round_advancement_records a set tags=array_append(a.tags,'category_winner')
    from public.round_category_winners w
    where w.round_id=new.id and a.round_id=new.id and 'category_winner'<>all(a.tags)
      and a.participant_id is not distinct from w.participant_id
      and a.team_id is not distinct from w.team_id;
  update public.round_participant_eligibility e set tags=array_append(e.tags,'category_winner')
    from public.round_category_winners w
    where w.round_id=new.id and e.round_id=new.id and 'category_winner'<>all(e.tags)
      and (e.participant_id=w.participant_id or e.source_team_id=w.team_id);
  insert into public.notifications(recipient_id,competition_id,kind,title,body,link_path)
    select e.participant_id,new.competition_id,'leaderboard_published',
      new.name || ' results released',
      case e.status when 'advanced' then 'You advanced in ' || c.name || '.'
        when 'winner' then 'You won in ' || c.name || '.'
        else 'Your run in ' || c.name || ' ended after this round.' end,
      '/competition/' || c.slug || '/leaderboard/' || new.slug
    from public.round_participant_eligibility e where e.round_id=new.id;
  return new;
end;
$$;
create trigger round_leaderboard_published after update of leaderboard_state on public.competition_rounds
  for each row execute function vertex_private.on_round_leaderboard_published();

create function public.configure_round_leaderboard(target_round_id uuid,publish_mode text,
  release_at timestamptz default null,score_visible boolean default null)
returns public.competition_rounds language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.competition_rounds;
begin
  select * into r from public.competition_rounds where id=target_round_id for update;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can manage leaderboards.' using errcode='42501';
  end if;
  if r.leaderboard_state='published' then
    raise exception 'Published results cannot be changed.' using errcode='23514';
  end if;
  if publish_mode not in ('draft','scheduled','published') then
    raise exception 'Choose draft, schedule, or publish.' using errcode='23514';
  end if;
  if score_visible is not null then
    insert into public.round_scoring_settings(round_id,show_scores_public,updated_by,updated_at)
      values(r.id,score_visible,auth.uid(),now())
    on conflict(round_id) do update set show_scores_public=excluded.show_scores_public,
      updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  end if;
  if publish_mode='scheduled' then
    update public.competition_rounds set leaderboard_releases_at=release_at,
      leaderboard_state='scheduled' where id=r.id returning * into r;
  else
    update public.competition_rounds set leaderboard_state=case when publish_mode='draft' then 'unpublished' else 'published' end
      where id=r.id returning * into r;
  end if;
  return r;
end;
$$;

-- Cron and due page reads share the same idempotent publication path.
create function vertex_private.publish_due_round_leaderboards()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;
begin
  update public.competition_rounds set leaderboard_state='published'
    where leaderboard_state='scheduled' and leaderboard_releases_at<=now();
  get diagnostics changed=row_count;
  return changed;
end;
$$;
revoke all on function vertex_private.publish_due_round_leaderboards() from public,anon,authenticated;

-- Public endpoint reveals entries only after publication. Organisers can preview.
create function public.round_leaderboard_data(target_round_id uuid,search_term text default '',
  result_page integer default 0,result_limit integer default 25)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.competition_rounds; c public.competitions; manager boolean;
  visible boolean; needle text:=lower(btrim(coalesce(search_term,'')));
  page_number integer:=greatest(coalesce(result_page,0),0); page_size integer:=least(greatest(coalesce(result_limit,25),1),50);
  entries jsonb:='[]'; podium jsonb:='[]'; categories jsonb:='[]'; own_result jsonb;
  count_entries integer:=0; missing_categories integer:=0;
begin
  if length(needle)>100 or page_number>100000 then
    raise exception 'Invalid leaderboard search.' using errcode='23514';
  end if;
  select * into r from public.competition_rounds where id=target_round_id;
  select * into c from public.competitions where id=r.competition_id;
  if r.id is null or c.status<>'published' then
    raise exception 'Leaderboard not found.' using errcode='42501';
  end if;
  manager:=auth.uid() is not null and public.can_manage_competition(c.id);
  if r.leaderboard_state='scheduled' and r.leaderboard_releases_at<=now() then
    update public.competition_rounds set leaderboard_state='published'
      where id=r.id and leaderboard_state='scheduled' and leaderboard_releases_at<=now();
    select * into r from public.competition_rounds where id=target_round_id;
  end if;
  visible:=coalesce((select show_scores_public from public.round_scoring_settings where round_id=r.id),false);
  if manager or r.leaderboard_state='published' then
    select count(*) into count_entries from vertex_private.leaderboard_roster(r.id) entry
      where needle='' or position(needle in lower(entry.display_name))>0
        or position(needle in lower(coalesce(entry.username,'')))>0;
    select coalesce(jsonb_agg(jsonb_build_object('id',record_id,'name',display_name,
      'username',username,'entry_type',case when team_id is null then 'individual' else 'team' end,
      'category',category,'rank',rank,'total',case when manager or visible then total end,
      'status',status,'category_winner',winner) order by rank,lower(display_name),record_id),'[]'::jsonb)
      into entries from (
        select entry.*,exists(select 1 from public.round_category_winners w where w.round_id=r.id
          and w.participant_id is not distinct from entry.participant_id
          and w.team_id is not distinct from entry.team_id) winner
        from vertex_private.leaderboard_roster(r.id) entry
        where needle='' or position(needle in lower(entry.display_name))>0
          or position(needle in lower(coalesce(entry.username,'')))>0
        order by rank,lower(display_name),record_id limit page_size offset page_number*page_size
      ) page_rows;
    select coalesce(jsonb_agg(jsonb_build_object('name',display_name,'username',username,
      'entry_type',case when team_id is null then 'individual' else 'team' end,
      'rank',rank,'total',case when manager or visible then total end,'category',category)
      order by rank,lower(display_name),record_id),'[]'::jsonb)
      into podium from vertex_private.leaderboard_roster(r.id) where rank<=3;
    select coalesce(jsonb_agg(jsonb_build_object('category',w.category,'name',entry.display_name,
      'username',entry.username,'entry_type',case when w.team_id is null then 'individual' else 'team' end)
      order by lower(w.category)),'[]'::jsonb) into categories
      from public.round_category_winners w join vertex_private.leaderboard_roster(r.id) entry
        on entry.participant_id is not distinct from w.participant_id
          and entry.team_id is not distinct from w.team_id
      where w.round_id=r.id;
    if manager then
      select count(*) into missing_categories from (
        select distinct category from vertex_private.leaderboard_roster(r.id) where category is not null
      ) represented where not exists (
        select 1 from public.round_category_winners w where w.round_id=r.id and w.category=represented.category
      );
    elsif auth.uid() is not null then
      select jsonb_build_object('status',e.status,'tags',e.tags,'team_id',e.source_team_id)
        into own_result from public.round_participant_eligibility e
        where e.round_id=r.id and e.participant_id=auth.uid();
    end if;
  end if;
  return jsonb_build_object('state',r.leaderboard_state,'release_at',r.leaderboard_releases_at,
    'published_at',r.leaderboard_published_at,'manager',manager,
    'show_scores',visible,'entries',entries,'podium',podium,'categories',categories,
    'missing_categories',missing_categories,'own_result',own_result,
    'total',count_entries,'page',page_number,'page_size',page_size);
end;
$$;

-- Prevent scheduled countdowns from leaking the separate public score page.
create or replace function public.public_round_scores(target_round_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.competition_rounds; criteria_count integer; max_total numeric; entries jsonb;
begin
  select * into r from public.competition_rounds where id = target_round_id;
  if r.id is null or not exists (select 1 from public.competitions c where c.id = r.competition_id and c.status = 'published') then
    raise exception 'Round not found.' using errcode = '23514';
  end if;
  if (r.judging_state='finalised' and r.leaderboard_state<>'published')
      or not coalesce((select show_scores_public from public.round_scoring_settings where round_id = r.id),false) then
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

-- Personal round outcomes become visible only with the published result.
drop policy advancement_records_read on public.round_advancement_records;
create policy advancement_records_read on public.round_advancement_records for select to authenticated
  using (public.can_manage_competition((select competition_id from public.competition_rounds where id=round_id))
    or (exists(select 1 from public.competition_rounds r where r.id=round_id and r.leaderboard_state='published')
      and (participant_id=(select auth.uid()) or exists(select 1 from public.competition_team_members m
        where m.team_id=round_advancement_records.team_id and m.participant_id=(select auth.uid())))));
drop policy advancement_eligibility_read on public.round_participant_eligibility;
create policy advancement_eligibility_read on public.round_participant_eligibility for select to authenticated
  using (public.can_manage_competition((select competition_id from public.competition_rounds where id=round_id))
    or (participant_id=(select auth.uid()) and exists(select 1 from public.competition_rounds r
      where r.id=round_id and r.leaderboard_state='published')));
create or replace function public.my_round_progress(target_competition_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); rows jsonb;
begin
  if actor is null then raise exception 'Sign in to view your round progress.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('round_id',r.id,'round_name',r.name,'round_slug',r.slug,
    'sequence',r.sequence,'status',e.status,'tags',e.tags,'team_id',e.source_team_id,
    'finalised_at',e.finalised_at) order by r.sequence),'[]'::jsonb) into rows
  from public.round_participant_eligibility e join public.competition_rounds r on r.id=e.round_id
  where r.competition_id=target_competition_id and e.participant_id=actor and r.leaderboard_state='published';
  return rows;
end;
$$;

-- A participant cannot use next-round work before previous results release.
create function vertex_private.previous_round_published(target_round_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.competition_rounds r where r.id=target_round_id
    and (r.sequence=1 or exists(select 1 from public.competition_rounds previous
      where previous.competition_id=r.competition_id and previous.sequence=r.sequence-1
        and previous.leaderboard_state='published')));
$$;
revoke all on function vertex_private.previous_round_published(uuid) from public,anon,authenticated;

create or replace function public.my_round_entry_eligible(target_round_id uuid)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); r public.competition_rounds;
begin
  if actor is null then return false; end if;
  select * into r from public.competition_rounds where id=target_round_id;
  if r.id is null or not vertex_private.previous_round_published(r.id) then return false; end if;
  return public.round_entry_eligible(r.id,actor,null)
    or exists(select 1 from public.competition_team_members m
      where m.competition_id=r.competition_id and m.participant_id=actor
        and public.round_entry_eligible(r.id,null,m.team_id));
end;
$$;


-- Existing submission APIs keep server-side access aligned with release.
create or replace function public.can_view_round_submission_config(target_round_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.competition_rounds r join public.competitions c on c.id = r.competition_id
    where r.id = target_round_id and (
      public.can_manage_competition(c.id)
      or (c.status = 'published' and vertex_private.previous_round_published(r.id) and (
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
      and c.status = 'published' and vertex_private.previous_round_published(r.id) and now() >= cfg.opens_at and now() < cfg.closes_at
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
  if not vertex_private.previous_round_published(r.id) then
    raise exception 'Previous round results must be released before this round opens.' using errcode='42501';
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

create or replace function vertex_private.guard_round_submission_eligibility()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.round_entry_eligible(new.round_id,new.participant_id,new.team_id)
      or not vertex_private.previous_round_published(new.round_id) then
    raise exception 'Entry is not active in this round.' using errcode='42501';
  end if;
  return new;
end;
$$;

revoke all on function public.set_round_category_winner(uuid,text,uuid,uuid),
  public.configure_round_leaderboard(uuid,text,timestamptz,boolean),
  public.round_leaderboard_data(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.set_round_category_winner(uuid,text,uuid,uuid),
  public.configure_round_leaderboard(uuid,text,timestamptz,boolean) to authenticated;
grant execute on function public.round_leaderboard_data(uuid,text,integer,integer) to anon,authenticated;

alter publication supabase_realtime add table public.competition_rounds;
select cron.schedule('vertex-publish-round-leaderboards','* * * * *',
  'select vertex_private.publish_due_round_leaderboards()');

commit;
