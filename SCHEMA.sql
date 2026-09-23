-- Vertex complete clean-install bootstrap. Do not run against an existing installation.
-- Immutable migrations remain the historical source of truth.
-- Ordered sections preserve dependency and policy changes, yielding the current schema.
begin;

-- Source: 001_auth_profiles_and_organisations.sql
-- Milestone 2: authentication profiles, public identity, organisation foundations,
-- and profile-picture Storage. Hosted Auth must use email/password with email
-- confirmation disabled; that dashboard setting cannot be enforced through SQL.

create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create type public.account_type as enum ('participant', 'organiser', 'organisation');
create type public.organisation_member_role as enum ('owner', 'admin', 'member');
create type public.organisation_member_status as enum ('pending', 'accepted', 'declined');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_type public.account_type not null,
  full_name text,
  username extensions.citext,
  avatar_path text,
  bio text,
  birthday date,
  affiliation text,
  location text,
  social_links jsonb not null default '[]'::jsonb,
  profile_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (full_name is null or char_length(btrim(full_name)) between 2 and 100),
  constraint profiles_username_format check (username is null or username::text ~ '^[A-Za-z0-9_]{3,24}$'),
  constraint profiles_username_unique unique (username),
  constraint profiles_avatar_owner_path check (avatar_path is null or avatar_path like id::text || '/%'),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 1000),
  constraint profiles_affiliation_length check (affiliation is null or char_length(affiliation) <= 160),
  constraint profiles_location_length check (location is null or char_length(location) <= 120),
  constraint profiles_social_links_array check (jsonb_typeof(social_links) = 'array'),
  constraint profiles_social_links_limit check (jsonb_array_length(social_links) <= 8)
);

create index profiles_username_lower_idx on public.profiles (lower(username::text));
create index profiles_username_trgm_idx on public.profiles using gin (lower(username::text) extensions.gin_trgm_ops);
create index profiles_account_type_idx on public.profiles (account_type);

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  management_profile_id uuid not null unique references public.profiles(id) on delete restrict,
  name text not null,
  slug extensions.citext not null unique,
  logo_path text,
  description text,
  website_url text,
  social_links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisations_name_length check (char_length(btrim(name)) between 2 and 140),
  constraint organisations_slug_format check (slug::text ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint organisations_description_length check (description is null or char_length(description) <= 3000),
  constraint organisations_social_links_array check (jsonb_typeof(social_links) = 'array'),
  constraint organisations_social_links_limit check (jsonb_array_length(social_links) <= 8)
);

create table public.organisation_memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  organiser_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  role public.organisation_member_role not null default 'member',
  status public.organisation_member_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (organisation_id, organiser_id)
);

create index organisation_memberships_organiser_idx on public.organisation_memberships (organiser_id, status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prepare_profile_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    new.id = old.id;
    new.account_type = old.account_type;
    new.created_at = old.created_at;
  end if;

  new.full_name = nullif(btrim(new.full_name), '');
  new.username = nullif(btrim(new.username::text), '')::extensions.citext;
  new.bio = nullif(btrim(new.bio), '');
  new.affiliation = nullif(btrim(new.affiliation), '');
  new.location = nullif(btrim(new.location), '');

  if new.birthday is not null and new.birthday > current_date then
    raise exception using errcode = '22007', message = 'Birthday cannot be in the future.';
  end if;

  if new.account_type = 'participant' and new.birthday is not null and new.birthday < date '1900-01-01' then
    raise exception using errcode = '22007', message = 'Birthday is outside the supported range.';
  end if;

  if new.full_name is not null and new.username is not null
     and (new.account_type <> 'participant' or new.birthday is not null) then
    new.profile_completed_at = case when tg_op = 'UPDATE' then coalesce(old.profile_completed_at, now()) else now() end;
  else
    new.profile_completed_at = null;
  end if;

  return new;
end;
$$;

create trigger profiles_prepare_write
before insert or update on public.profiles
for each row execute function public.prepare_profile_write();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger organisations_set_updated_at
before update on public.organisations
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_type text := new.raw_user_meta_data ->> 'account_type';
  safe_type public.account_type;
begin
  safe_type := case requested_type
    when 'organiser' then 'organiser'::public.account_type
    else 'participant'::public.account_type
  end;

  insert into public.profiles (id, account_type, full_name, username, birthday)
  values (
    new.id,
    safe_type,
    new.raw_user_meta_data ->> 'full_name',
    nullif(new.raw_user_meta_data ->> 'username', '')::extensions.citext,
    case
      when safe_type = 'participant'
       and coalesce(new.raw_user_meta_data ->> 'birthday', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then (new.raw_user_meta_data ->> 'birthday')::date
      else null
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace view public.public_profiles
with (security_barrier = true, security_invoker = false)
as
select
  id,
  full_name,
  username,
  account_type,
  avatar_path,
  bio,
  affiliation,
  location,
  social_links,
  created_at
from public.profiles
where profile_completed_at is not null
  and username is not null;

create or replace function public.search_profiles(search_term text, result_limit integer default 12)
returns table (
  id uuid,
  full_name text,
  username extensions.citext,
  account_type public.account_type,
  avatar_path text,
  bio text,
  affiliation text,
  location text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.full_name, p.username, p.account_type, p.avatar_path, p.bio, p.affiliation, p.location
  from public.profiles p
  where p.profile_completed_at is not null
    and p.username is not null
    and nullif(btrim(search_term), '') is not null
    and (
      lower(p.username::text) like '%' || lower(regexp_replace(btrim(search_term), '^@', '')) || '%'
      or lower(p.full_name) like '%' || lower(btrim(search_term)) || '%'
    )
  order by
    case when lower(p.username::text) = lower(regexp_replace(btrim(search_term), '^@', '')) then 0 else 1 end,
    p.username
  limit least(greatest(coalesce(result_limit, 12), 1), 25);
$$;

alter table public.profiles enable row level security;
alter table public.organisations enable row level security;
alter table public.organisation_memberships enable row level security;

create policy profiles_select_own
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy profiles_update_own
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy organisations_public_read
on public.organisations for select
to anon, authenticated
using (true);

create policy organisation_memberships_public_accepted_read
on public.organisation_memberships for select
to anon, authenticated
using (status = 'accepted');

revoke all on public.profiles from anon, authenticated;
revoke all on public.organisations from anon, authenticated;
revoke all on public.organisation_memberships from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.organisations to anon, authenticated;
grant select on public.organisation_memberships to anon, authenticated;
grant select on public.public_profiles to anon, authenticated;
grant execute on function public.search_profiles(text, integer) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-pictures',
  'profile-pictures',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy profile_pictures_insert_own
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = auth.uid()::text
  and owner_id = auth.uid()::text
);

create policy profile_pictures_update_own
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = auth.uid()::text
  and owner_id = auth.uid()::text
)
with check (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = auth.uid()::text
  and owner_id = auth.uid()::text
);

create policy profile_pictures_delete_own
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = auth.uid()::text
  and owner_id = auth.uid()::text
);


-- Source: 001a_profile_search_suggestions.sql
-- CHANGES.md prerequisite: typo-tolerant public profile suggestions.
-- Apply after 001_auth_profiles_and_organisations.sql and before Milestone 3.

create index profiles_full_name_trgm_idx on public.profiles
using gin (lower(full_name) extensions.gin_trgm_ops);

create or replace function public.search_profiles(search_term text, result_limit integer default 12)
returns table (
  id uuid, full_name text, username extensions.citext,
  account_type public.account_type, avatar_path text, bio text,
  affiliation text, location text
)
language sql stable security definer
set search_path = public, extensions, pg_temp
as $$
  with query as (
    select lower(left(regexp_replace(btrim(search_term), '^@', ''), 100)) as term
  )
  select p.id, p.full_name, p.username, p.account_type,
         p.avatar_path, p.bio, p.affiliation, p.location
  from public.profiles p cross join query q
  where p.profile_completed_at is not null and p.username is not null
    and char_length(q.term) >= 2
    and (
      strpos(lower(p.username::text), q.term) > 0
      or strpos(lower(p.full_name), q.term) > 0
      or (char_length(q.term) >= 3 and (
        lower(p.username::text) operator(extensions.%) q.term
        or lower(p.full_name) operator(extensions.%) q.term
      ))
    )
  order by
    case when lower(p.username::text) = q.term then 0
         when starts_with(lower(p.username::text), q.term) then 1
         when starts_with(lower(p.full_name), q.term) then 2
         else 3 end,
    greatest(extensions.similarity(lower(p.username::text), q.term),
             extensions.similarity(lower(p.full_name), q.term)) desc,
    p.username
  limit least(greatest(coalesce(result_limit, 12), 1), 25);
$$;

revoke all on function public.search_profiles(text, integer) from public;
grant execute on function public.search_profiles(text, integer) to anon, authenticated;


-- Source: 002_organisations_and_membership.sql
-- Milestone 3: organisation management accounts and consent-based membership.

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  safe_type public.account_type;
begin
  safe_type := case new.raw_user_meta_data ->> 'account_type'
    when 'organiser' then 'organiser'::public.account_type
    when 'organisation' then 'organisation'::public.account_type
    else 'participant'::public.account_type end;
  insert into public.profiles (id, account_type, full_name, username, birthday)
  values (new.id, safe_type, new.raw_user_meta_data ->> 'full_name',
    nullif(new.raw_user_meta_data ->> 'username', '')::extensions.citext,
    case when safe_type = 'participant'
      and coalesce(new.raw_user_meta_data ->> 'birthday', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then (new.raw_user_meta_data ->> 'birthday')::date else null end);
  return new;
end;
$$;

create or replace function public.valid_organisation_links(links jsonb)
returns boolean language plpgsql immutable
set search_path = public, pg_temp
as $$
declare item jsonb;
begin
  if jsonb_typeof(links) <> 'array' or jsonb_array_length(links) > 8 then return false; end if;
  for item in select value from jsonb_array_elements(links) loop
    if jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item -> 'label') is distinct from 'string'
      or jsonb_typeof(item -> 'url') is distinct from 'string'
      or char_length(btrim(item ->> 'label')) not between 1 and 30
      or char_length(item ->> 'url') > 2048
      or (item ->> 'url') !~ '^https?://[^[:space:]/?#]+[^[:space:]]*$'
    then return false; end if;
  end loop;
  return true;
end;
$$;

alter table public.organisations
  add constraint organisations_slug_length check (char_length(slug::text) between 3 and 80),
  add constraint organisations_slug_reserved check (slug::text not in ('edit', 'new')),
  add constraint organisations_website_safe check (website_url is null or (
    char_length(website_url) <= 2048 and website_url ~ '^https?://[^[:space:]/?#]+[^[:space:]]*$')),
  add constraint organisations_links_valid check (public.valid_organisation_links(social_links)),
  add constraint organisations_logo_path check (logo_path is null or
    logo_path ~ ('^' || management_profile_id::text || '/[a-f0-9-]+\.(jpg|png|webp|gif)$'));

create or replace function public.prepare_organisation_write()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and (new.id <> old.id or new.management_profile_id <> old.management_profile_id) then
    raise exception 'Organisation ownership cannot be changed.';
  end if;
  if not exists (select 1 from public.profiles where id = new.management_profile_id and account_type = 'organisation') then
    raise exception 'An organisation management account is required.';
  end if;
  if tg_op = 'INSERT' then new.created_at = now(); else new.created_at = old.created_at; end if;
  new.name = btrim(new.name);
  new.slug = lower(btrim(new.slug::text))::extensions.citext;
  new.description = nullif(btrim(new.description), '');
  new.website_url = nullif(btrim(new.website_url), '');
  return new;
end;
$$;

create trigger organisations_prepare_write before insert or update on public.organisations
for each row execute function public.prepare_organisation_write();

create policy organisations_insert_management on public.organisations for insert to authenticated
with check (management_profile_id = auth.uid() and exists (
  select 1 from public.profiles where id = auth.uid() and account_type = 'organisation'));
create policy organisations_update_management on public.organisations for update to authenticated
using (management_profile_id = auth.uid()) with check (management_profile_id = auth.uid());
grant insert (management_profile_id, name, slug, logo_path, description, website_url, social_links)
  on public.organisations to authenticated;
grant update (name, slug, logo_path, description, website_url, social_links)
  on public.organisations to authenticated;

alter table public.organisation_memberships add column expires_at timestamptz not null default (now() + interval '14 days');
create policy organisation_memberships_private_read on public.organisation_memberships for select to authenticated
using (organiser_id = auth.uid() or exists (
  select 1 from public.organisations o where o.id = organisation_id and o.management_profile_id = auth.uid()));

create or replace function public.invite_organisation_organiser(organisation_id uuid, username text)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare target_id uuid; invitation_id uuid;
begin
  -- Lock organisation to serialize invitations and changes for this container.
  perform 1 from public.organisations o where o.id = organisation_id and o.management_profile_id = auth.uid() for update;
  if not found then raise exception 'Only the organisation management account can invite organisers.'; end if;
  select p.id into target_id from public.profiles p
  where p.username = regexp_replace(btrim(invite_organisation_organiser.username), '^@', '')::extensions.citext
    and p.account_type = 'organiser' and p.profile_completed_at is not null;
  if target_id is null then raise exception 'Choose an existing organiser by their exact @username.'; end if;
  if exists (select 1 from public.organisation_memberships m
    where m.organisation_id = invite_organisation_organiser.organisation_id and m.organiser_id = target_id
      and (m.status = 'accepted' or (m.status = 'pending' and m.expires_at > now()))) then
    raise exception 'This organiser is already a member or has a pending invitation.';
  end if;
  insert into public.organisation_memberships as m (organisation_id, organiser_id, invited_by, role, status)
  values (organisation_id, target_id, auth.uid(), 'member', 'pending')
  on conflict on constraint organisation_memberships_organisation_id_organiser_id_key
  do update set status = 'pending', role = 'member', invited_by = auth.uid(),
    created_at = now(), responded_at = null, expires_at = now() + interval '14 days'
  returning m.id into invitation_id;
  return invitation_id;
end;
$$;

create or replace function public.respond_organisation_invitation(invitation_id uuid, accept_invitation boolean)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare invitation public.organisation_memberships;
begin
  select * into invitation from public.organisation_memberships where id = invitation_id for update;
  if not found or invitation.organiser_id is distinct from auth.uid() or auth.uid() is null then
    raise exception 'This invitation is not addressed to your account.';
  end if;
  if invitation.status <> 'pending' then raise exception 'This invitation has already been answered.'; end if;
  if invitation.expires_at <= now() then raise exception 'This invitation has expired. Ask the organisation to invite you again.'; end if;
  if accept_invitation is null then raise exception 'Choose accept or decline.'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and account_type = 'organiser') then
    raise exception 'Only organiser accounts can accept membership.';
  end if;
  update public.organisation_memberships
  set status = case when accept_invitation then 'accepted'::public.organisation_member_status else 'declined'::public.organisation_member_status end,
    responded_at = now()
  where id = invitation_id;
end;
$$;

create or replace function public.remove_organisation_membership(membership_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare membership public.organisation_memberships;
begin
  select * into membership from public.organisation_memberships where id = membership_id for update;
  if not found or auth.uid() is null then raise exception 'Membership not found.'; end if;
  if not (membership.organiser_id = auth.uid() or exists (
    select 1 from public.organisations where id = membership.organisation_id and management_profile_id = auth.uid())) then
    raise exception 'You cannot change this membership.';
  end if;
  delete from public.organisation_memberships where id = membership_id;
end;
$$;

-- No direct membership writes: each transition is authenticated and checked above.
revoke all on function public.invite_organisation_organiser(uuid, text) from public, anon;
revoke all on function public.respond_organisation_invitation(uuid, boolean) from public, anon;
revoke all on function public.remove_organisation_membership(uuid) from public, anon;
revoke all on function public.prepare_organisation_write() from public, anon, authenticated;
grant execute on function public.invite_organisation_organiser(uuid, text) to authenticated;
grant execute on function public.respond_organisation_invitation(uuid, boolean) to authenticated;
grant execute on function public.remove_organisation_membership(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('organisation-logos', 'organisation-logos', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

create policy organisation_logos_insert_management on storage.objects for insert to authenticated
with check (bucket_id = 'organisation-logos' and owner_id = auth.uid()::text
  and name ~ ('^' || auth.uid()::text || '/[a-f0-9-]+\.(jpg|png|webp|gif)$')
  and exists (select 1 from public.profiles where id = auth.uid() and account_type = 'organisation'));
create policy organisation_logos_delete_management on storage.objects for delete to authenticated
using (bucket_id = 'organisation-logos' and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text);
create policy organisation_logos_select_management on storage.objects for select to authenticated
using (bucket_id = 'organisation-logos' and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text);
-- Logos are public identity assets. Replacements use new random paths; overwrite is not granted.


-- Source: 002a_directory_suggestions.sql

create or replace function public.search_people(search_term text, organiser_only boolean default false)
returns setof public.public_profiles
language sql stable security invoker set search_path = public, extensions, pg_temp
as $$
 with q as (select lower(left(regexp_replace(btrim(search_term), '^@', ''),100)) term)
 select p.* from public.public_profiles p cross join q
 where p.account_type in ('participant','organiser') and (not organiser_only or p.account_type='organiser')
 and length(q.term)>=2 and (strpos(lower(p.username::text),q.term)>0 or strpos(lower(p.full_name),q.term)>0
 or (length(q.term)>=3 and (lower(p.username::text) operator(extensions.%) q.term or lower(p.full_name) operator(extensions.%) q.term)))
 order by (lower(p.username::text)=q.term) desc, greatest(extensions.similarity(lower(p.username::text),q.term),extensions.similarity(lower(p.full_name),q.term)) desc,p.username limit 12;
$$;
create index organisations_name_trgm_idx on public.organisations using gin(lower(name) extensions.gin_trgm_ops);
create index organisations_slug_trgm_idx on public.organisations using gin(lower(slug::text) extensions.gin_trgm_ops);
create or replace function public.search_organisations(search_term text)
returns setof public.organisations
language sql stable security invoker set search_path = public, extensions, pg_temp
as $$
 with q as (select lower(left(btrim(search_term),100)) term)
 select o.* from public.organisations o cross join q
 where length(q.term)>=2 and (strpos(lower(o.name),q.term)>0 or strpos(lower(o.slug::text),q.term)>0
 or (length(q.term)>=3 and (lower(o.name) operator(extensions.%) q.term or lower(o.slug::text) operator(extensions.%) q.term)))
 order by (lower(o.slug::text)=q.term) desc,greatest(extensions.similarity(lower(o.name),q.term),extensions.similarity(lower(o.slug::text),q.term)) desc,o.name limit 24;
$$;
revoke all on function public.search_people(text,boolean), public.search_organisations(text) from public;
grant execute on function public.search_people(text,boolean), public.search_organisations(text) to anon,authenticated;


-- Source: 003_competitions_rounds_and_timelines.sql
-- Milestone 4: atomic competition authoring, publication and private draft banners.

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  organisation_id uuid references public.organisations(id) on delete restrict,
  name text not null check (length(btrim(name)) between 2 and 160),
  slug text not null unique check (length(slug) between 3 and 100 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and slug not in ('new','edit')),
  status text not null default 'draft' check (status in ('draft','published')),
  field_tags text[] not null default '{}',
  prize_details text not null default '' check (length(prize_details) <= 5000),
  description text not null default '' check (length(description) <= 20000),
  minimum_age integer check (minimum_age between 0 and 120),
  maximum_age integer check (maximum_age between 0 and 120),
  team_mode text not null default 'individual' check (team_mode in ('individual','team','both')),
  minimum_team_size integer check (minimum_team_size between 2 and 100),
  maximum_team_size integer check (maximum_team_size between 2 and 100),
  categories text[] not null default '{}',
  structure text not null default 'direct3' check (structure in ('direct3','directx','100-30-3','custom')),
  banner_kind text not null default 'colour' check (banner_kind in ('colour','gradient','image')),
  banner_colour text not null default '#2563eb' check (banner_colour ~ '^#[0-9a-fA-F]{6}$'),
  banner_colour_end text not null default '#0b1120' check (banner_colour_end ~ '^#[0-9a-fA-F]{6}$'),
  banner_path text,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  starts_at timestamptz,
  certificate_status text not null default 'not_planned' check (certificate_status in ('not_planned','planned','template_ready')),
  certificates_available_at timestamptz,
  version integer not null default 1,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (minimum_age <= maximum_age),
  check (minimum_team_size <= maximum_team_size),
  check ((team_mode = 'individual' and minimum_team_size is null and maximum_team_size is null) or (team_mode <> 'individual' and minimum_team_size is not null and maximum_team_size is not null)),
  check (registration_opens_at < registration_closes_at),
  check (registration_closes_at <= starts_at),
  check (cardinality(field_tags) <= 13 and field_tags <@ array['mathematics','physics','chemistry','biology','programming','robotics','research','writing','design','business','debate','innovation','general STEM']),
  check (cardinality(categories) <= 30),
  check ((banner_kind = 'image' and banner_path is not null and banner_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif)$') or (banner_kind <> 'image' and banner_path is null))
);
create index competitions_owner_idx on public.competitions(owner_id, updated_at desc);
create index competitions_organisation_idx on public.competitions(organisation_id);
create index competitions_published_idx on public.competitions(published_at desc) where status = 'published';

create table public.competition_rounds (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 100),
  slug text not null check (length(slug) between 2 and 100 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sequence integer not null check (sequence between 1 and 20),
  advancement_count integer not null check (advancement_count between 1 and 1000000),
  opens_at timestamptz,
  submission_deadline timestamptz,
  judging_opens_at timestamptz,
  judging_closes_at timestamptz,
  leaderboard_releases_at timestamptz,
  status text not null default 'upcoming' check (status in ('upcoming','active','completed')),
  judging_state text not null default 'not_started',
  leaderboard_state text not null default 'unpublished',
  unique(competition_id, sequence),
  unique(competition_id, slug),
  check (opens_at < submission_deadline),
  check (submission_deadline <= leaderboard_releases_at),
  check ((judging_opens_at is null) = (judging_closes_at is null)),
  check (submission_deadline <= judging_opens_at and judging_opens_at < judging_closes_at and judging_closes_at <= leaderboard_releases_at)
);
alter table public.competitions enable row level security;
alter table public.competition_rounds enable row level security;
revoke all on public.competitions, public.competition_rounds from anon, authenticated;
grant select on public.competitions, public.competition_rounds to anon, authenticated;
create policy competitions_read on public.competitions for select to anon, authenticated
  using (status = 'published' or owner_id = (select auth.uid()));
create policy competition_rounds_read on public.competition_rounds for select to anon, authenticated
  using (exists (select 1 from public.competitions c where c.id = competition_id));

-- Deliberately privileged atomic write boundary; direct table writes are not granted.
-- Every call checks the persisted profile role and the existing row owner.
create function public.save_competition(details jsonb, rounds jsonb, expected_version integer default null)
returns public.competitions language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  candidate public.competitions;
  previous public.competitions;
  item jsonb;
  r public.competition_rounds;
  previous_release timestamptz;
  previous_count integer;
  position integer := 0;
  counts integer[] := '{}';
  saved_rounds jsonb;
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor and account_type = 'organiser' and profile_completed_at is not null) then
    raise exception 'Only an organiser with a complete profile can manage competitions.' using errcode = '42501';
  end if;
  if jsonb_typeof(details) <> 'object' or jsonb_typeof(rounds) <> 'array' or jsonb_array_length(rounds) not between 1 and 20 then
    raise exception 'Provide competition details and between 1 and 20 rounds.';
  end if;
  candidate := jsonb_populate_record(null::public.competitions, details);
  candidate.id := coalesce(candidate.id, gen_random_uuid());
  -- Serialize new IDs and existing edits, including simultaneous first saves.
  perform pg_advisory_xact_lock(hashtextextended(candidate.id::text, 0));
  select * into previous from public.competitions where id = candidate.id for update;
  if found then
    if previous.owner_id <> actor then raise exception 'You cannot edit this competition.' using errcode = '42501'; end if;
    if expected_version is distinct from previous.version then raise exception 'This competition changed in another tab. Reload before saving.' using errcode = '40001'; end if;
  elsif expected_version is not null then raise exception 'Competition no longer exists. Reload before saving.'; end if;
  candidate.owner_id := actor;
  candidate.name := btrim(candidate.name);
  candidate.slug := lower(btrim(candidate.slug));
  candidate.status := coalesce(candidate.status, 'draft');
  candidate.description := coalesce(btrim(candidate.description), '');
  candidate.prize_details := coalesce(btrim(candidate.prize_details), '');
  candidate.field_tags := coalesce(candidate.field_tags, '{}');
  candidate.categories := coalesce(candidate.categories, '{}');
  candidate.created_at := coalesce(previous.created_at, now());
  candidate.updated_at := now();
  candidate.version := coalesce(previous.version, 0) + 1;
  candidate.published_at := case when candidate.status = 'published' then coalesce(previous.published_at, now()) end;
  if previous.id is not null and candidate.slug <> previous.slug then raise exception 'A saved competition address cannot change.'; end if;
  if exists(select 1 from unnest(candidate.categories) category where length(btrim(category)) not between 1 and 80) or
     (select count(distinct lower(btrim(category))) from unnest(candidate.categories) category) <> cardinality(candidate.categories) then
    raise exception 'Categories must be distinct names, each 1–80 characters.';
  end if;
  if candidate.organisation_id is not null and candidate.organisation_id is distinct from previous.organisation_id and not exists (
    select 1 from public.organisation_memberships where organisation_id = candidate.organisation_id and organiser_id = actor and status = 'accepted'
  ) then raise exception 'Accept membership before associating this organisation.' using errcode = '42501'; end if;
  if candidate.banner_kind = 'image' and (split_part(candidate.banner_path,'/',1) <> actor::text or split_part(candidate.banner_path,'/',2) <> candidate.id::text or not exists (
    select 1 from storage.objects where bucket_id = 'competition-banners' and name = candidate.banner_path and owner_id = actor::text
  )) then raise exception 'Upload a banner owned by this competition organiser.'; end if;
  if candidate.status = 'published' and (cardinality(candidate.field_tags) = 0 or candidate.description = '' or candidate.prize_details = '' or candidate.registration_opens_at is null or candidate.registration_closes_at is null or candidate.starts_at is null) then
    raise exception 'Before publishing, add fields, description, prize details, and all registration and competition dates.';
  end if;
  if previous.status = 'published' then
    -- Published participation and result identities are immutable. Descriptive edits remain safe.
    if (to_jsonb(candidate) - array['name','description','prize_details','banner_kind','banner_colour','banner_colour_end','banner_path','updated_at','version']) is distinct from
       (to_jsonb(previous) - array['name','description','prize_details','banner_kind','banner_colour','banner_colour_end','banner_path','updated_at','version']) then
      raise exception 'Published participation rules, organisation, address and timeline are locked. Edit name, description, prizes or banner.';
    end if;
    select jsonb_agg(to_jsonb(cr) - array['competition_id','status','judging_state','leaderboard_state'] order by sequence) into saved_rounds from public.competition_rounds cr where competition_id = candidate.id;
    if rounds is distinct from saved_rounds then raise exception 'Published rounds are locked to preserve participant and result history.'; end if;
  end if;
  previous_release := candidate.starts_at;
  for item in select value from jsonb_array_elements(rounds) loop
    position := position + 1;
    r := jsonb_populate_record(null::public.competition_rounds, item);
    if r.sequence is distinct from position or r.id is null then raise exception 'Round sequence and identity are required.'; end if;
    if r.opens_at < previous_release then raise exception 'Each round must open after the competition start and previous results release.'; end if;
    if r.advancement_count >= previous_count then raise exception 'Each later round must advance fewer entries than the previous round.'; end if;
    if candidate.status = 'published' and (r.opens_at is null or r.submission_deadline is null or r.leaderboard_releases_at is null) then raise exception 'Every round needs an opening, submission deadline and results release.'; end if;
    previous_release := coalesce(r.leaderboard_releases_at, previous_release);
    previous_count := r.advancement_count;
    counts := array_append(counts, r.advancement_count);
  end loop;
  if (candidate.structure = 'direct3' and counts <> array[3]) or (candidate.structure = 'directx' and cardinality(counts) <> 1) or (candidate.structure = '100-30-3' and counts <> array[100,30,3]) then raise exception 'Round advancement must match the selected structure.'; end if;
  if candidate.certificates_available_at < previous_release then raise exception 'Certificates cannot be available before final results.'; end if;
  if candidate.certificate_status = 'not_planned' and candidate.certificates_available_at is not null then raise exception 'Plan certificates before setting their availability.'; end if;
  insert into public.competitions select candidate.*
  on conflict (id) do update set
    name = excluded.name, organisation_id = excluded.organisation_id, status = excluded.status, field_tags = excluded.field_tags,
    prize_details = excluded.prize_details, description = excluded.description, minimum_age = excluded.minimum_age, maximum_age = excluded.maximum_age,
    team_mode = excluded.team_mode, minimum_team_size = excluded.minimum_team_size, maximum_team_size = excluded.maximum_team_size,
    categories = excluded.categories, structure = excluded.structure, banner_kind = excluded.banner_kind, banner_colour = excluded.banner_colour,
    banner_colour_end = excluded.banner_colour_end, banner_path = excluded.banner_path, registration_opens_at = excluded.registration_opens_at,
    registration_closes_at = excluded.registration_closes_at, starts_at = excluded.starts_at, certificate_status = excluded.certificate_status,
    certificates_available_at = excluded.certificates_available_at, published_at = excluded.published_at, updated_at = excluded.updated_at, version = excluded.version;
  if previous.status is distinct from 'published' then
    -- Drafts have no participants or results. Once published, round rows are never replaced.
    delete from public.competition_rounds where competition_id = candidate.id;
    for item in select value from jsonb_array_elements(rounds) loop
      r := jsonb_populate_record(null::public.competition_rounds, item);
      insert into public.competition_rounds(id,competition_id,name,slug,sequence,advancement_count,opens_at,submission_deadline,judging_opens_at,judging_closes_at,leaderboard_releases_at)
      values(r.id,candidate.id,r.name,r.slug,r.sequence,r.advancement_count,r.opens_at,r.submission_deadline,r.judging_opens_at,r.judging_closes_at,r.leaderboard_releases_at);
    end loop;
  end if;
  return candidate;
end;
$$;
revoke all on function public.save_competition(jsonb,jsonb,integer) from public, anon;
grant execute on function public.save_competition(jsonb,jsonb,integer) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('competition-banners','competition-banners',false,5242880,array['image/jpeg','image/png','image/webp','image/gif']);
create policy competition_banners_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'competition-banners' and owner_id = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif)$'
  and split_part(name,'/',1) = (select auth.uid())::text
  and exists(select 1 from public.profiles where id = (select auth.uid()) and account_type = 'organiser')
);
create policy competition_banners_read on storage.objects for select to anon, authenticated using (
  bucket_id = 'competition-banners' and (
    owner_id = (select auth.uid())::text or exists(select 1 from public.competitions c where c.status = 'published' and c.banner_path = name)
  )
);
create policy competition_banners_delete on storage.objects for delete to authenticated using (
  bucket_id = 'competition-banners' and owner_id = (select auth.uid())::text and split_part(name,'/',1) = (select auth.uid())::text
  and not exists(select 1 from public.competitions c where c.banner_path = name)
);


-- Source: 003a_competition_conflict_and_date_guards.sql
-- Optimistic edit conflicts are HTTP 409, not retryable transaction failures.

create or replace function public.save_competition(details jsonb, rounds jsonb, expected_version integer default null)
returns public.competitions language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  candidate public.competitions;
  previous public.competitions;
  item jsonb;
  r public.competition_rounds;
  previous_release timestamptz;
  previous_count integer;
  position integer := 0;
  counts integer[] := '{}';
  saved_rounds jsonb;
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor and account_type = 'organiser' and profile_completed_at is not null) then
    raise exception 'Only an organiser with a complete profile can manage competitions.' using errcode = '42501';
  end if;
  if jsonb_typeof(details) <> 'object' or jsonb_typeof(rounds) <> 'array' or jsonb_array_length(rounds) not between 1 and 20 then
    raise exception 'Provide competition details and between 1 and 20 rounds.';
  end if;
  candidate := jsonb_populate_record(null::public.competitions, details);
  candidate.id := coalesce(candidate.id, gen_random_uuid());
  -- Serialize new IDs and existing edits, including simultaneous first saves.
  perform pg_advisory_xact_lock(hashtextextended(candidate.id::text, 0));
  select * into previous from public.competitions where id = candidate.id for update;
  if found then
    if previous.owner_id <> actor then raise exception 'You cannot edit this competition.' using errcode = '42501'; end if;
    if expected_version is distinct from previous.version then raise exception 'This competition changed in another tab. Reload before saving.' using errcode = 'PT409'; end if;
  elsif expected_version is not null then raise exception 'Competition no longer exists. Reload before saving.'; end if;
  candidate.owner_id := actor;
  candidate.name := btrim(candidate.name);
  candidate.slug := lower(btrim(candidate.slug));
  candidate.status := coalesce(candidate.status, 'draft');
  candidate.description := coalesce(btrim(candidate.description), '');
  candidate.prize_details := coalesce(btrim(candidate.prize_details), '');
  candidate.field_tags := coalesce(candidate.field_tags, '{}');
  candidate.categories := coalesce(candidate.categories, '{}');
  candidate.created_at := coalesce(previous.created_at, now());
  candidate.updated_at := now();
  candidate.version := coalesce(previous.version, 0) + 1;
  candidate.published_at := case when candidate.status = 'published' then coalesce(previous.published_at, now()) end;
  if previous.id is not null and candidate.slug <> previous.slug then raise exception 'A saved competition address cannot change.'; end if;
  if exists(select 1 from unnest(candidate.categories) category where length(btrim(category)) not between 1 and 80) or
     (select count(distinct lower(btrim(category))) from unnest(candidate.categories) category) <> cardinality(candidate.categories) then
    raise exception 'Categories must be distinct names, each 1–80 characters.';
  end if;
  if candidate.organisation_id is not null and candidate.organisation_id is distinct from previous.organisation_id and not exists (
    select 1 from public.organisation_memberships where organisation_id = candidate.organisation_id and organiser_id = actor and status = 'accepted'
  ) then raise exception 'Accept membership before associating this organisation.' using errcode = '42501'; end if;
  if candidate.banner_kind = 'image' and (split_part(candidate.banner_path,'/',1) <> actor::text or split_part(candidate.banner_path,'/',2) <> candidate.id::text or not exists (
    select 1 from storage.objects where bucket_id = 'competition-banners' and name = candidate.banner_path and owner_id = actor::text
  )) then raise exception 'Upload a banner owned by this competition organiser.'; end if;
  if candidate.status = 'published' and (cardinality(candidate.field_tags) = 0 or candidate.description = '' or candidate.prize_details = '' or candidate.registration_opens_at is null or candidate.registration_closes_at is null or candidate.starts_at is null) then
    raise exception 'Before publishing, add fields, description, prize details, and all registration and competition dates.';
  end if;
  if previous.status = 'published' then
    -- Published participation and result identities are immutable. Descriptive edits remain safe.
    if (to_jsonb(candidate) - array['name','description','prize_details','banner_kind','banner_colour','banner_colour_end','banner_path','updated_at','version']) is distinct from
       (to_jsonb(previous) - array['name','description','prize_details','banner_kind','banner_colour','banner_colour_end','banner_path','updated_at','version']) then
      raise exception 'Published participation rules, organisation, address and timeline are locked. Edit name, description, prizes or banner.';
    end if;
    select jsonb_agg(to_jsonb(cr) - array['competition_id','status','judging_state','leaderboard_state'] order by sequence) into saved_rounds from public.competition_rounds cr where competition_id = candidate.id;
    if rounds is distinct from saved_rounds then raise exception 'Published rounds are locked to preserve participant and result history.'; end if;
  end if;
  previous_release := candidate.starts_at;
  for item in select value from jsonb_array_elements(rounds) loop
    position := position + 1;
    r := jsonb_populate_record(null::public.competition_rounds, item);
    if r.sequence is distinct from position or r.id is null then raise exception 'Round sequence and identity are required.'; end if;
    if r.opens_at < previous_release then raise exception 'Each round must open after the competition start and previous results release.'; end if;
    if r.advancement_count >= previous_count then raise exception 'Each later round must advance fewer entries than the previous round.'; end if;
    if candidate.status = 'published' and (r.opens_at is null or r.submission_deadline is null or r.leaderboard_releases_at is null) then raise exception 'Every round needs an opening, submission deadline and results release.'; end if;
    previous_release := coalesce(r.leaderboard_releases_at, previous_release);
    previous_count := r.advancement_count;
    counts := array_append(counts, r.advancement_count);
  end loop;
  if (candidate.structure = 'direct3' and counts <> array[3]) or (candidate.structure = 'directx' and cardinality(counts) <> 1) or (candidate.structure = '100-30-3' and counts <> array[100,30,3]) then raise exception 'Round advancement must match the selected structure.'; end if;
  if candidate.certificates_available_at < previous_release then raise exception 'Certificates cannot be available before final results.'; end if;
  if candidate.certificate_status = 'not_planned' and candidate.certificates_available_at is not null then raise exception 'Plan certificates before setting their availability.'; end if;
  insert into public.competitions select candidate.*
  on conflict (id) do update set
    name = excluded.name, organisation_id = excluded.organisation_id, status = excluded.status, field_tags = excluded.field_tags,
    prize_details = excluded.prize_details, description = excluded.description, minimum_age = excluded.minimum_age, maximum_age = excluded.maximum_age,
    team_mode = excluded.team_mode, minimum_team_size = excluded.minimum_team_size, maximum_team_size = excluded.maximum_team_size,
    categories = excluded.categories, structure = excluded.structure, banner_kind = excluded.banner_kind, banner_colour = excluded.banner_colour,
    banner_colour_end = excluded.banner_colour_end, banner_path = excluded.banner_path, registration_opens_at = excluded.registration_opens_at,
    registration_closes_at = excluded.registration_closes_at, starts_at = excluded.starts_at, certificate_status = excluded.certificate_status,
    certificates_available_at = excluded.certificates_available_at, published_at = excluded.published_at, updated_at = excluded.updated_at, version = excluded.version;
  if previous.status is distinct from 'published' then
    -- Drafts have no participants or results. Once published, round rows are never replaced.
    delete from public.competition_rounds where competition_id = candidate.id;
    for item in select value from jsonb_array_elements(rounds) loop
      r := jsonb_populate_record(null::public.competition_rounds, item);
      insert into public.competition_rounds(id,competition_id,name,slug,sequence,advancement_count,opens_at,submission_deadline,judging_opens_at,judging_closes_at,leaderboard_releases_at)
      values(r.id,candidate.id,r.name,r.slug,r.sequence,r.advancement_count,r.opens_at,r.submission_deadline,r.judging_opens_at,r.judging_closes_at,r.leaderboard_releases_at);
    end loop;
  end if;
  return candidate;
end;
$$;
alter table public.competitions add constraint competition_finite_dates check (isfinite(registration_opens_at) and isfinite(registration_closes_at) and isfinite(starts_at) and isfinite(certificates_available_at));
alter table public.competition_rounds add constraint round_finite_dates check (isfinite(opens_at) and isfinite(submission_deadline) and isfinite(judging_opens_at) and isfinite(judging_closes_at) and isfinite(leaderboard_releases_at));
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;


-- Source: 003b_competition_banner_reference_policies.sql
-- Qualify outer Storage names; competitions also has a name column.

alter policy competition_banners_read on storage.objects using (
  bucket_id = 'competition-banners' and (
    owner_id = (select auth.uid())::text or exists(
      select 1 from public.competitions c where c.status = 'published' and c.banner_path = storage.objects.name
    )
  )
);
alter policy competition_banners_delete on storage.objects using (
  bucket_id = 'competition-banners' and owner_id = (select auth.uid())::text
  and split_part(storage.objects.name,'/',1) = (select auth.uid())::text
  and not exists(select 1 from public.competitions c where c.banner_path = storage.objects.name)
);

commit;

-- Milestone 5: indexed public discovery and participant-owned bookmarks.
begin;

create extension if not exists pg_trgm with schema extensions;
create index competitions_discovery_name_idx on public.competitions using gin (name extensions.gin_trgm_ops) where status = 'published';
create index competitions_discovery_fields_idx on public.competitions using gin (field_tags) where status = 'published';
create index competitions_discovery_deadline_idx on public.competitions (registration_closes_at, id) where status = 'published';

create table public.competition_bookmarks (
  participant_id uuid not null references public.profiles(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (participant_id, competition_id)
);
create index competition_bookmarks_competition_idx on public.competition_bookmarks (competition_id);
alter table public.competition_bookmarks enable row level security;
revoke all on public.competition_bookmarks from anon, authenticated;
grant select, insert, delete on public.competition_bookmarks to authenticated;

create policy competition_bookmarks_read on public.competition_bookmarks for select to authenticated
  using (participant_id = (select auth.uid()));
create policy competition_bookmarks_add on public.competition_bookmarks for insert to authenticated
  with check (
    participant_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_type = 'participant')
    and exists (select 1 from public.competitions c where c.id = competition_id and c.status = 'published')
  );
create policy competition_bookmarks_remove on public.competition_bookmarks for delete to authenticated
  using (participant_id = (select auth.uid()));
commit;
