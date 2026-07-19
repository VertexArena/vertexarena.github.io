-- Vertex complete Supabase setup. Run once in SQL Editor.
create extension if not exists pgcrypto;
create type public.account_type as enum ('participant','organiser','organisation');
create type public.competition_status as enum ('draft','published','ongoing','completed','archived');
create type public.team_mode as enum ('individual','team','both');
create type public.registration_status as enum ('pending','confirmed','eliminated','withdrawn');
create type public.submission_mode as enum ('files','links','mixed');

create table public.profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check(username ~ '^[a-zA-Z0-9_]{3,24}$'),
 full_name text not null, account_type public.account_type not null default 'participant',
 bio text, avatar_url text, social_links jsonb not null default '[]', organisation_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organisations(id uuid primary key default gen_random_uuid(),name text not null,slug text not null unique,description text,logo_url text,owner_id uuid references public.profiles(id),created_at timestamptz default now());
alter table public.profiles add constraint profiles_organisation_fk foreign key(organisation_id) references public.organisations(id) on delete set null;
create table public.competitions(
 id uuid primary key default gen_random_uuid(),name text not null,slug text not null unique,description text not null default '',
 organisation_id uuid references public.organisations(id),created_by uuid not null references public.profiles(id),
 status public.competition_status not null default 'draft',team_mode public.team_mode not null default 'individual',
 prize_summary text,prize_details text,age_min int check(age_min>=5),age_max int check(age_max<=30 and age_max>=age_min),
 banner_url text,banner_color text default '#2563EB',structure_type text not null default 'direct',
 registration_deadline timestamptz not null,start_at timestamptz,end_at timestamptz,certificate_release_at timestamptz,
 scores_public boolean not null default false,created_at timestamptz default now(),updated_at timestamptz default now()
);
create table public.tags(id bigint generated always as identity primary key,name text not null unique,slug text not null unique);
insert into public.tags(name,slug) values ('Mathematics','mathematics'),('Physics','physics'),('Programming','programming'),('Research','research'),('Writing','writing'),('Design','design'),('Business','business'),('Science','science');
create table public.competition_tags(competition_id uuid references public.competitions on delete cascade,tag_id bigint references public.tags on delete cascade,primary key(competition_id,tag_id));
create table public.rounds(id uuid primary key default gen_random_uuid(),competition_id uuid not null references public.competitions on delete cascade,name text not null,slug text not null,position int not null,advance_count int,submission_deadline timestamptz,results_release_at timestamptz,results_released boolean default false,unique(competition_id,slug),unique(competition_id,position));
create table public.categories(id uuid primary key default gen_random_uuid(),competition_id uuid not null references public.competitions on delete cascade,name text not null,unique(competition_id,name));
create table public.competition_organisers(competition_id uuid references public.competitions on delete cascade,profile_id uuid references public.profiles on delete cascade,role text not null default 'organiser',accepted boolean default false,primary key(competition_id,profile_id));
create table public.registrations(id uuid primary key default gen_random_uuid(),competition_id uuid not null references public.competitions on delete cascade,participant_id uuid not null references public.profiles on delete cascade,category_id uuid references public.categories,status public.registration_status not null default 'confirmed',registered_name text not null default '',created_at timestamptz default now(),unique(competition_id,participant_id));
create table public.teams(id uuid primary key default gen_random_uuid(),competition_id uuid not null references public.competitions on delete cascade,name text not null,created_by uuid not null references public.profiles,category_id uuid references public.categories,created_at timestamptz default now(),unique(competition_id,name));
create table public.team_members(team_id uuid references public.teams on delete cascade,participant_id uuid references public.profiles on delete cascade,invite_status text not null default 'pending',is_captain boolean default false,primary key(team_id,participant_id));
create table public.announcements(id uuid primary key default gen_random_uuid(),competition_id uuid not null references public.competitions on delete cascade,author_id uuid not null references public.profiles,title text not null,body text not null,push_enabled boolean default true,created_at timestamptz default now());
create table public.questions(id uuid primary key default gen_random_uuid(),competition_id uuid not null references public.competitions on delete cascade,author_id uuid not null references public.profiles,body text not null,created_at timestamptz default now());
create table public.answers(id uuid primary key default gen_random_uuid(),question_id uuid not null references public.questions on delete cascade,author_id uuid not null references public.profiles,body text not null,created_at timestamptz default now());
create table public.meetings(id uuid primary key default gen_random_uuid(),competition_id uuid not null references public.competitions on delete cascade,name text not null,slug text not null,jitsi_room text not null,starts_at timestamptz,created_by uuid references public.profiles,unique(competition_id,slug),unique(competition_id,name));
create table public.meeting_assignments(meeting_id uuid references public.meetings on delete cascade,participant_id uuid references public.profiles on delete cascade,team_id uuid references public.teams on delete cascade,check((participant_id is null)<>(team_id is null)));
create table public.submission_boxes(id uuid primary key default gen_random_uuid(),round_id uuid not null references public.rounds on delete cascade,mode public.submission_mode not null,allowed_types text[] default '{}',size_limit_mb numeric not null default 25 check(size_limit_mb>0 and size_limit_mb<=25),instructions text,is_open boolean default true,unique(round_id));
create table public.submissions(id uuid primary key default gen_random_uuid(),box_id uuid not null references public.submission_boxes on delete cascade,participant_id uuid references public.profiles,team_id uuid references public.teams,file_paths text[] default '{}',links text[] default '{}',submitted_at timestamptz default now(),check((participant_id is null)<>(team_id is null)),unique(box_id,participant_id),unique(box_id,team_id));
create table public.scoring_criteria(id uuid primary key default gen_random_uuid(),round_id uuid not null references public.rounds on delete cascade,name text not null,max_score numeric not null check(max_score>0),weight numeric not null default 1,position int not null,unique(round_id,name));
create table public.scores(id uuid primary key default gen_random_uuid(),criterion_id uuid not null references public.scoring_criteria on delete cascade,registration_id uuid references public.registrations on delete cascade,team_id uuid references public.teams on delete cascade,score numeric not null check(score>=0),scored_by uuid references public.profiles,updated_at timestamptz default now(),check((registration_id is null)<>(team_id is null)),unique(criterion_id,registration_id),unique(criterion_id,team_id));
create table public.leaderboards(id uuid primary key default gen_random_uuid(),round_id uuid not null references public.rounds on delete cascade,release_at timestamptz not null,published_at timestamptz,show_scores boolean default false,unique(round_id));
create table public.leaderboard_entries(id uuid primary key default gen_random_uuid(),leaderboard_id uuid not null references public.leaderboards on delete cascade,registration_id uuid references public.registrations,team_id uuid references public.teams,rank int not null,score numeric,placement text,category_id uuid references public.categories,advances boolean default false,check((registration_id is null)<>(team_id is null)),unique(leaderboard_id,rank));
create table public.qualifications(id uuid primary key default gen_random_uuid(),competition_id uuid not null references public.competitions on delete cascade,participant_id uuid not null references public.profiles on delete cascade,round_id uuid references public.rounds,tag text not null,awarded_at timestamptz default now(),unique(competition_id,participant_id,tag));
create table public.certificate_templates(id uuid primary key default gen_random_uuid(),competition_id uuid not null references public.competitions on delete cascade,name text not null,image_path text not null,eligibility_tags text[] default '{"participant"}',dynamic_fields jsonb not null default '[]',output_format text default 'pdf',enabled boolean default false,created_at timestamptz default now());
create table public.notifications(id uuid primary key default gen_random_uuid(),recipient_id uuid not null references public.profiles on delete cascade,type text not null,title text not null,body text,link text,read_at timestamptz,created_at timestamptz default now());
create table public.push_subscriptions(id uuid primary key default gen_random_uuid(),profile_id uuid not null references public.profiles on delete cascade,endpoint text not null unique,p256dh text not null,auth text not null,created_at timestamptz default now());
create table public.achievements(id bigint generated always as identity primary key,code text not null unique,name text not null,description text not null,icon text not null,threshold int not null);
create table public.profile_achievements(profile_id uuid references public.profiles on delete cascade,achievement_id bigint references public.achievements on delete cascade,unlocked_at timestamptz default now(),primary key(profile_id,achievement_id));
create table public.bookmarks(profile_id uuid references public.profiles on delete cascade,competition_id uuid references public.competitions on delete cascade,created_at timestamptz default now(),primary key(profile_id,competition_id));
insert into public.achievements(code,name,description,icon,threshold) values('first_step','First step','Enter your first competition','flag',1),('momentum','Momentum','Complete five competitions','bolt',5),('team_player','Team player','Enter three team competitions','users',3);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$begin insert into public.profiles(id,username,full_name,account_type) values(new.id,lower(coalesce(new.raw_user_meta_data->>'username',split_part(new.email,'@',1)))||case when exists(select 1 from public.profiles where username=lower(coalesce(new.raw_user_meta_data->>'username',split_part(new.email,'@',1)))) then '_'||substr(new.id::text,1,6) else '' end,coalesce(new.raw_user_meta_data->>'full_name','Vertex member'),coalesce((new.raw_user_meta_data->>'account_type')::public.account_type,'participant'));return new;end$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
create or replace function public.is_comp_organiser(cid uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from competitions c where c.id=cid and c.created_by=auth.uid()) or exists(select 1 from competition_organisers co where co.competition_id=cid and co.profile_id=auth.uid() and co.accepted)$$;
create or replace function public.set_registered_name() returns trigger language plpgsql security definer set search_path=public as $$begin select full_name into new.registered_name from profiles where id=new.participant_id;return new;end$$;
create trigger registration_name before insert on public.registrations for each row execute procedure public.set_registered_name();

alter table public.profiles enable row level security;alter table public.organisations enable row level security;alter table public.competitions enable row level security;alter table public.competition_tags enable row level security;alter table public.rounds enable row level security;alter table public.categories enable row level security;alter table public.competition_organisers enable row level security;alter table public.registrations enable row level security;alter table public.teams enable row level security;alter table public.team_members enable row level security;alter table public.announcements enable row level security;alter table public.questions enable row level security;alter table public.answers enable row level security;alter table public.meetings enable row level security;alter table public.meeting_assignments enable row level security;alter table public.submission_boxes enable row level security;alter table public.submissions enable row level security;alter table public.scoring_criteria enable row level security;alter table public.scores enable row level security;alter table public.leaderboards enable row level security;alter table public.leaderboard_entries enable row level security;alter table public.qualifications enable row level security;alter table public.certificate_templates enable row level security;alter table public.notifications enable row level security;alter table public.push_subscriptions enable row level security;alter table public.profile_achievements enable row level security;alter table public.bookmarks enable row level security;

create policy "profiles public read" on public.profiles for select using(true);create policy "profile owner update" on public.profiles for update using(id=auth.uid());
create policy "organisations public read" on public.organisations for select using(true);create policy "organisation owner manage" on public.organisations for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy "published competitions public read" on public.competitions for select using(status<>'draft' or public.is_comp_organiser(id));create policy "organisers create competitions" on public.competitions for insert with check(created_by=auth.uid() and exists(select 1 from profiles where id=auth.uid() and account_type='organiser'));create policy "organisers update competitions" on public.competitions for update using(public.is_comp_organiser(id));
create policy "tags public read" on public.competition_tags for select using(true);create policy "rounds public read" on public.rounds for select using(true);create policy "categories public read" on public.categories for select using(true);
create policy "organiser team visible" on public.competition_organisers for select using(true);create policy "organiser team manage" on public.competition_organisers for all using(public.is_comp_organiser(competition_id)) with check(public.is_comp_organiser(competition_id));
create policy "registrations own or organiser read" on public.registrations for select using(participant_id=auth.uid() or public.is_comp_organiser(competition_id));create policy "participants register" on public.registrations for insert with check(participant_id=auth.uid());
create policy "teams competition visible" on public.teams for select using(true);create policy "participants create teams" on public.teams for insert with check(created_by=auth.uid());create policy "team membership visible" on public.team_members for select using(true);create policy "team membership manage" on public.team_members for all using(participant_id=auth.uid() or exists(select 1 from teams where id=team_id and created_by=auth.uid()));
create policy "announcements public read" on public.announcements for select using(true);create policy "announcements organiser write" on public.announcements for insert with check(public.is_comp_organiser(competition_id));
create policy "questions public read" on public.questions for select using(true);create policy "participants ask" on public.questions for insert with check(author_id=auth.uid());create policy "answers public read" on public.answers for select using(true);create policy "authenticated answer" on public.answers for insert with check(author_id=auth.uid());
create policy "assigned meetings read" on public.meetings for select using(public.is_comp_organiser(competition_id) or exists(select 1 from meeting_assignments ma where ma.meeting_id=id and (ma.participant_id=auth.uid() or ma.team_id in(select team_id from team_members where participant_id=auth.uid() and invite_status='accepted'))));create policy "meetings organiser manage" on public.meetings for all using(public.is_comp_organiser(competition_id)) with check(public.is_comp_organiser(competition_id));
create policy "submission boxes read" on public.submission_boxes for select using(true);create policy "own submissions" on public.submissions for select using(participant_id=auth.uid() or exists(select 1 from team_members where team_id=submissions.team_id and participant_id=auth.uid()) or public.is_comp_organiser((select r.competition_id from submission_boxes b join rounds r on r.id=b.round_id where b.id=box_id)));create policy "submit own entry" on public.submissions for insert with check(participant_id=auth.uid() or exists(select 1 from team_members where team_id=submissions.team_id and participant_id=auth.uid() and invite_status='accepted'));
create policy "criteria participants read" on public.scoring_criteria for select using(true);create policy "scores controlled read" on public.scores for select using(exists(select 1 from scoring_criteria sc join rounds r on r.id=sc.round_id join competitions c on c.id=r.competition_id where sc.id=criterion_id and (c.scores_public or public.is_comp_organiser(c.id))));
create policy "released leaderboards read" on public.leaderboards for select using(published_at<=now() or public.is_comp_organiser((select competition_id from rounds where id=round_id)));create policy "released entries read" on public.leaderboard_entries for select using(exists(select 1 from leaderboards l where l.id=leaderboard_id and l.published_at<=now()));
create policy "own qualifications" on public.qualifications for select using(participant_id=auth.uid() or public.is_comp_organiser(competition_id));create policy "certificate templates eligible read" on public.certificate_templates for select using(enabled or public.is_comp_organiser(competition_id));create policy "own notifications" on public.notifications for select using(recipient_id=auth.uid());create policy "own notification update" on public.notifications for update using(recipient_id=auth.uid());create policy "own push subscriptions" on public.push_subscriptions for all using(profile_id=auth.uid()) with check(profile_id=auth.uid());create policy "own achievements" on public.profile_achievements for select using(profile_id=auth.uid());create policy "own bookmarks" on public.bookmarks for all using(profile_id=auth.uid()) with check(profile_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit) values('banners','banners',true,26214400),('avatars','avatars',true,5242880),('submissions','submissions',false,26214400),('certificate-templates','certificate-templates',false,26214400) on conflict(id) do nothing;
create policy "public media read" on storage.objects for select using(bucket_id in('banners','avatars'));create policy "authenticated media upload" on storage.objects for insert to authenticated with check(bucket_id in('banners','avatars','submissions','certificate-templates') and (storage.foldername(name))[1]=auth.uid()::text);create policy "owner media update" on storage.objects for update to authenticated using(owner_id=auth.uid()::text);create policy "owner private media read" on storage.objects for select to authenticated using(owner_id=auth.uid()::text or bucket_id in('banners','avatars'));

do $$begin alter publication supabase_realtime add table public.announcements,public.questions,public.answers,public.leaderboards,public.leaderboard_entries,public.notifications;exception when duplicate_object then null;end$$;

-- Minimum PostgREST privileges approved for Vertex web clients. RLS remains authoritative.
alter table public.tags enable row level security;
create policy "tags public read" on public.tags for select using(true);
grant usage on schema public to anon, authenticated;
grant select on public.competitions,public.organisations,public.competition_tags,public.tags,public.rounds,public.categories,public.competition_organisers,public.profiles to anon;
grant select on public.competitions,public.organisations,public.competition_tags,public.tags,public.rounds,public.categories,public.competition_organisers,public.profiles,public.registrations,public.bookmarks,public.notifications,public.announcements,public.questions,public.answers to authenticated;
grant update on public.profiles,public.competitions,public.notifications to authenticated;
grant insert on public.competitions,public.registrations,public.bookmarks,public.announcements,public.questions,public.answers to authenticated;
grant delete on public.bookmarks to authenticated;
-- Vertex feature migration: atomic creation and organisation membership.
alter table public.competitions add column if not exists banner_style text not null default 'solid' check(banner_style in('solid','gradient'));
alter table public.competitions add column if not exists banner_secondary_color text default '#7C3AED';

create table if not exists public.organisation_invites(
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations on delete cascade,
 organiser_id uuid not null references public.profiles on delete cascade,
 invited_by uuid not null references public.profiles on delete cascade,
 status text not null default 'pending' check(status in('pending','accepted','declined')),
 created_at timestamptz not null default now(),
 responded_at timestamptz,
 unique(organisation_id,organiser_id)
);
alter table public.organisation_invites enable row level security;
create policy "organisation invite participants read" on public.organisation_invites for select using(
 organiser_id=auth.uid() or organisation_id=(select organisation_id from public.profiles where id=auth.uid() and account_type='organisation')
);
grant select on public.organisation_invites to authenticated;

create or replace function public.vertex_slug(value text) returns text language sql immutable as $$
 select btrim(lower(regexp_replace(coalesce(value,''),'[^a-zA-Z0-9]+','-','g')),'-')
$$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare
 new_type public.account_type:=coalesce((new.raw_user_meta_data->>'account_type')::public.account_type,'participant');
 new_name text:=coalesce(new.raw_user_meta_data->>'full_name','Vertex member');
 new_username text:=lower(coalesce(new.raw_user_meta_data->>'username',split_part(new.email,'@',1)));
 org_id uuid;
 org_slug text;
begin
 if exists(select 1 from public.profiles where username=new_username) then new_username:=new_username||'_'||substr(new.id::text,1,6); end if;
 insert into public.profiles(id,username,full_name,account_type) values(new.id,new_username,new_name,new_type);
 if new_type='organisation' then
  org_slug:=public.vertex_slug(new_name);
  if exists(select 1 from public.organisations where slug=org_slug) then org_slug:=org_slug||'-'||substr(new.id::text,1,6); end if;
  insert into public.organisations(name,slug,owner_id) values(new_name,org_slug,new.id) returning id into org_id;
  update public.profiles set organisation_id=org_id where id=new.id;
 end if;
 return new;
end$$;

do $$
declare p record; oid uuid; candidate text;
begin
 for p in select id,full_name,username from public.profiles where account_type='organisation' and organisation_id is null loop
  candidate:=public.vertex_slug(p.full_name);
  if exists(select 1 from public.organisations where slug=candidate) then candidate:=candidate||'-'||p.username; end if;
  insert into public.organisations(name,slug,owner_id) values(p.full_name,candidate,p.id) returning id into oid;
  update public.profiles set organisation_id=oid where id=p.id;
 end loop;
end$$;

create or replace function public.invite_organiser_to_organisation(target_username text) returns uuid language plpgsql security definer set search_path=public as $$
declare caller public.profiles%rowtype; target public.profiles%rowtype; result_id uuid;
begin
 select * into caller from public.profiles where id=auth.uid();
 if caller.account_type<>'organisation' or caller.organisation_id is null then raise exception 'Organisation account required'; end if;
 select * into target from public.profiles where lower(username)=lower(regexp_replace(target_username,'^@',''));
 if target.id is null or target.account_type<>'organiser' then raise exception 'Organiser account not found'; end if;
 insert into public.organisation_invites(organisation_id,organiser_id,invited_by,status)
 values(caller.organisation_id,target.id,caller.id,'pending')
 on conflict(organisation_id,organiser_id) do update set status='pending',invited_by=excluded.invited_by,created_at=now(),responded_at=null
 returning id into result_id;
 insert into public.notifications(recipient_id,type,title,body,link)
 values(target.id,'organisation_invite','Organisation invitation',caller.full_name||' invited you to connect as an organiser.','/dashboard');
 return result_id;
end$$;

create or replace function public.accept_organisation_invite(invite_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare invitation public.organisation_invites%rowtype;
begin
 select * into invitation from public.organisation_invites where id=invite_id and organiser_id=auth.uid() and status='pending';
 if invitation.id is null then raise exception 'Invitation not found'; end if;
 update public.profiles set organisation_id=invitation.organisation_id,updated_at=now() where id=auth.uid() and account_type='organiser';
 update public.organisation_invites set status='accepted',responded_at=now() where id=invite_id;
 update public.organisation_invites set status='declined',responded_at=now() where organiser_id=auth.uid() and id<>invite_id and status='pending';
 return true;
end$$;

create or replace function public.create_competition_full(payload jsonb) returns table(id uuid,slug text) language plpgsql security definer set search_path=public as $$
declare
 creator public.profiles%rowtype; comp_id uuid; base_slug text; final_slug text; prefix text; suffix int:=2;
 round_data jsonb; round_id uuid; round_slug text; criterion jsonb; template_tags text[];
begin
 select * into creator from public.profiles where profiles.id=auth.uid();
 if creator.id is null or creator.account_type<>'organiser' then raise exception 'Organiser account required'; end if;
 if nullif(btrim(payload->>'name'),'') is null then raise exception 'Competition name is required'; end if;
 base_slug:=public.vertex_slug(payload->>'name'); final_slug:=base_slug;
 if exists(select 1 from public.competitions where competitions.slug=final_slug) then
  select coalesce(o.slug,creator.username) into prefix from public.organisations o where o.id=creator.organisation_id;
  prefix:=coalesce(prefix,creator.username);
  final_slug:=public.vertex_slug(prefix||'-'||base_slug);
 end if;
 while exists(select 1 from public.competitions where competitions.slug=final_slug) loop final_slug:=public.vertex_slug(coalesce(prefix,creator.username)||'-'||base_slug||'-'||suffix);suffix:=suffix+1;end loop;
 insert into public.competitions(name,slug,description,organisation_id,created_by,status,team_mode,prize_summary,prize_details,age_min,age_max,banner_url,banner_color,banner_secondary_color,banner_style,structure_type,registration_deadline,start_at,end_at,certificate_release_at,scores_public)
 values(payload->>'name',final_slug,coalesce(payload->>'description',''),creator.organisation_id,creator.id,'draft',(payload->>'team_mode')::public.team_mode,payload->>'prize_summary',payload->>'prize_details',(payload->>'age_min')::int,(payload->>'age_max')::int,payload->>'banner_url',coalesce(payload->>'banner_color','#2563EB'),coalesce(payload->>'banner_secondary_color','#7C3AED'),coalesce(payload->>'banner_style','solid'),coalesce(payload->>'structure_type','direct'),(payload->>'registration_deadline')::timestamptz,(payload->>'start_at')::timestamptz,(payload->>'end_at')::timestamptz,(payload->>'certificate_release_at')::timestamptz,coalesce((payload->>'scores_public')::boolean,false))
 returning competitions.id into comp_id;
 insert into public.competition_tags(competition_id,tag_id) select comp_id,t.id from public.tags t where t.slug in(select jsonb_array_elements_text(coalesce(payload->'tags','[]'::jsonb)));
 insert into public.categories(competition_id,name) select comp_id,value from jsonb_array_elements_text(coalesce(payload->'categories','[]'::jsonb)) where btrim(value)<>'';
 for round_data in select value from jsonb_array_elements(coalesce(payload->'rounds','[]'::jsonb)) loop
  round_slug:=public.vertex_slug(round_data->>'name');
  if exists(select 1 from public.rounds where competition_id=comp_id and rounds.slug=round_slug) then round_slug:=round_slug||'-'||(round_data->>'position'); end if;
  insert into public.rounds(competition_id,name,slug,position,advance_count,submission_deadline)
  values(comp_id,round_data->>'name',round_slug,(round_data->>'position')::int,(round_data->>'advance_count')::int,(round_data->>'submission_deadline')::timestamptz) returning rounds.id into round_id;
  insert into public.submission_boxes(round_id,mode,allowed_types,size_limit_mb)
  values(round_id,(round_data->'submission'->>'mode')::public.submission_mode,array(select jsonb_array_elements_text(coalesce(round_data->'submission'->'allowed_types','[]'::jsonb))),least(25,coalesce((round_data->'submission'->>'size_limit_mb')::numeric,25)));
  for criterion in select value from jsonb_array_elements(coalesce(payload->'criteria','[]'::jsonb)) loop
   insert into public.scoring_criteria(round_id,name,max_score,position) values(round_id,criterion->>'name',(criterion->>'max_score')::numeric,(criterion->>'position')::int);
  end loop;
 end loop;
 if nullif(payload->>'certificate_path','') is not null then
  select array_agg(value) into template_tags from jsonb_array_elements_text(coalesce(payload->'certificate_tags','["participant"]'::jsonb));
  insert into public.certificate_templates(competition_id,name,image_path,eligibility_tags,dynamic_fields)
  values(comp_id,'Default certificate',payload->>'certificate_path',coalesce(template_tags,array['participant']),jsonb_build_array(jsonb_build_object('value','{participant_name}','x',50,'y',50,'font','Geist','size',32,'color','#0F172A')));
 end if;
 return query select comp_id,final_slug;
end$$;

revoke all on function public.invite_organiser_to_organisation(text) from public;
revoke all on function public.accept_organisation_invite(uuid) from public;
revoke all on function public.create_competition_full(jsonb) from public;
grant execute on function public.invite_organiser_to_organisation(text) to authenticated;
grant execute on function public.accept_organisation_invite(uuid) to authenticated;
grant execute on function public.create_competition_full(jsonb) to authenticated;
