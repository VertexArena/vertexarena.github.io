-- Vertex migration 007: competition taxonomy and private participant eligibility.
begin;

insert into public.tags(name,slug) values
 ('Mathematics','mathematics'),('Physics','physics'),('Programming','programming'),('Research','research'),
 ('Writing','writing'),('Design','design'),('Business','business'),('Science','science')
on conflict (slug) do update set name=excluded.name;
grant select on public.tags to anon, authenticated;

create table if not exists public.participant_details(
 profile_id uuid primary key references public.profiles(id) on delete cascade,
 date_of_birth date not null check(date_of_birth<=current_date),
 updated_at timestamptz not null default now()
);
alter table public.participant_details enable row level security;
drop policy if exists "participant owns eligibility details" on public.participant_details;
create policy "participant owns eligibility details" on public.participant_details for all
 using(profile_id=auth.uid()) with check(profile_id=auth.uid());
grant select,insert,update on public.participant_details to authenticated;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare
 new_type public.account_type:=coalesce((new.raw_user_meta_data->>'account_type')::public.account_type,'participant');
 new_name text:=coalesce(new.raw_user_meta_data->>'full_name','Vertex member');
 new_username text:=lower(coalesce(new.raw_user_meta_data->>'username',split_part(new.email,'@',1)));
 new_birthday date;
 org_id uuid;
 org_slug text;
begin
 if exists(select 1 from public.profiles where username=new_username) then new_username:=new_username||'_'||substr(new.id::text,1,6); end if;
 if new_type='participant' then
  new_birthday:=nullif(new.raw_user_meta_data->>'date_of_birth','')::date;
  if new_birthday is null then raise exception 'Date of birth is required for participant accounts'; end if;
  if new_birthday>current_date then raise exception 'Date of birth cannot be in the future'; end if;
 end if;
 insert into public.profiles(id,username,full_name,account_type) values(new.id,new_username,new_name,new_type);
 if new_type='participant' then insert into public.participant_details(profile_id,date_of_birth) values(new.id,new_birthday); end if;
 if new_type='organisation' then
  org_slug:=public.vertex_slug(new_name);
  if exists(select 1 from public.organisations where slug=org_slug) then org_slug:=org_slug||'-'||substr(new.id::text,1,6); end if;
  insert into public.organisations(name,slug,owner_id) values(new_name,org_slug,new.id) returning id into org_id;
  update public.profiles set organisation_id=org_id where id=new.id;
 end if;
 return new;
end$$;

create or replace function public.set_registered_name() returns trigger language plpgsql security definer set search_path=public as $$
declare
 entrant_name text;
 birthday date;
 minimum_age int;
 maximum_age int;
 event_date date;
 entrant_age int;
begin
 select p.full_name,d.date_of_birth into entrant_name,birthday
 from public.profiles p left join public.participant_details d on d.profile_id=p.id
 where p.id=new.participant_id and p.account_type='participant';
 if entrant_name is null then raise exception 'Participant account required'; end if;
 select c.age_min,c.age_max,coalesce(c.start_at::date,current_date) into minimum_age,maximum_age,event_date
 from public.competitions c where c.id=new.competition_id;
 if birthday is null and (minimum_age is not null or maximum_age is not null) then
  raise exception 'Add your date of birth in Profile before registering for this competition';
 end if;
 if birthday is not null then
  entrant_age:=extract(year from age(event_date,birthday));
  if minimum_age is not null and entrant_age<minimum_age then raise exception 'You do not meet this competition''s minimum age'; end if;
  if maximum_age is not null and entrant_age>maximum_age then raise exception 'You exceed this competition''s maximum age'; end if;
 end if;
 new.registered_name:=entrant_name;
 return new;
end$$;

commit;