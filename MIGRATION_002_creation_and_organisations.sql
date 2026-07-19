-- Vertex feature migration: atomic creation and organisation membership.
alter table public.competitions add column if not exists banner_style text not null default 'solid' check(banner_style in('solid','gradient'));
alter table public.competitions add column if not exists banner_secondary_color text default '#7C3AED';
alter table public.competitions add column if not exists banner_shape text not null default 'circle' check(banner_shape in('circle','orbit','grid','diagonal','none'));

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
drop policy if exists "organisation invite participants read" on public.organisation_invites;
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
 insert into public.competitions(name,slug,description,organisation_id,created_by,status,team_mode,prize_summary,prize_details,age_min,age_max,banner_url,banner_color,banner_secondary_color,banner_style,banner_shape,structure_type,registration_deadline,start_at,end_at,certificate_release_at,scores_public)
 values(payload->>'name',final_slug,coalesce(payload->>'description',''),creator.organisation_id,creator.id,'draft',(payload->>'team_mode')::public.team_mode,payload->>'prize_summary',payload->>'prize_details',(payload->>'age_min')::int,(payload->>'age_max')::int,payload->>'banner_url',coalesce(payload->>'banner_color','#2563EB'),coalesce(payload->>'banner_secondary_color','#7C3AED'),coalesce(payload->>'banner_style','solid'),coalesce(payload->>'banner_shape','circle'),coalesce(payload->>'structure_type','direct'),(payload->>'registration_deadline')::timestamptz,(payload->>'start_at')::timestamptz,(payload->>'end_at')::timestamptz,(payload->>'certificate_release_at')::timestamptz,coalesce((payload->>'scores_public')::boolean,false))
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
notify pgrst, 'reload schema';
