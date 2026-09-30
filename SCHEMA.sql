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

-- Milestone 6: authoritative individual entry and immediate in-app confirmation.
begin;

create table public.individual_registrations (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  participant_id uuid not null references public.profiles(id) on delete cascade,
  category text check (category is null or length(btrim(category)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (competition_id, participant_id)
);
create index individual_registrations_participant_idx on public.individual_registrations (participant_id, created_at desc);
alter table public.individual_registrations enable row level security;
revoke all on public.individual_registrations from anon, authenticated;
grant select on public.individual_registrations to authenticated;
create policy individual_registrations_read on public.individual_registrations for select to authenticated
  using (
    participant_id = (select auth.uid())
    or exists (select 1 from public.competitions c where c.id = competition_id and c.owner_id = (select auth.uid()))
  );

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  competition_id uuid references public.competitions(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z0-9_]{3,50}$'),
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 1000),
  link_path text not null check (left(link_path, 1) = '/' and left(link_path, 2) <> '//' and length(link_path) <= 500),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
create policy notifications_read on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

-- Table writes are private. This endpoint validates persisted roles and dates,
-- then inserts registration and notification in the same transaction.
create function public.register_individual(target_competition_id uuid, chosen_category text default null)
returns public.individual_registrations
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  person public.profiles;
  competition public.competitions;
  registration public.individual_registrations;
  participant_age integer;
  category_name text := nullif(btrim(chosen_category), '');
begin
  if actor is null then
    raise exception 'Log in as a participant to register.' using errcode = '42501';
  end if;
  select * into person from public.profiles where id = actor for share;
  if person.id is null or person.account_type <> 'participant' then
    raise exception 'Only participant accounts can register.' using errcode = '42501';
  end if;
  if person.profile_completed_at is null or person.full_name is null or person.username is null or person.birthday is null then
    raise exception 'Complete your profile and birthday before registering.' using errcode = '23514';
  end if;
  select * into competition from public.competitions where id = target_competition_id for share;
  if competition.id is null or competition.status <> 'published' then
    raise exception 'This competition is not available for registration.' using errcode = '23514';
  end if;
  if competition.team_mode = 'team' then
    raise exception 'This competition accepts teams only.' using errcode = '23514';
  end if;
  if exists (select 1 from public.individual_registrations r where r.competition_id = competition.id and r.participant_id = actor) then
    raise exception 'You are already registered for this competition.' using errcode = '23505';
  end if;
  if competition.registration_opens_at is null or now() < competition.registration_opens_at then
    raise exception 'Registration has not opened yet.' using errcode = '23514';
  end if;
  if competition.registration_closes_at is null or now() >= competition.registration_closes_at then
    raise exception 'The registration deadline has passed.' using errcode = '23514';
  end if;
  participant_age := extract(year from age(current_date, person.birthday))::integer;
  if competition.minimum_age is not null and participant_age < competition.minimum_age then
    raise exception 'You must be at least % years old to register.', competition.minimum_age using errcode = '23514';
  end if;
  if competition.maximum_age is not null and participant_age > competition.maximum_age then
    raise exception 'You must be % years old or younger to register.', competition.maximum_age using errcode = '23514';
  end if;
  if cardinality(competition.categories) > 0 then
    if category_name is null or not (category_name = any(competition.categories)) then
      raise exception 'Choose one of this competition''s categories.' using errcode = '23514';
    end if;
  elsif category_name is not null then
    raise exception 'This competition does not use categories.' using errcode = '23514';
  end if;

  insert into public.individual_registrations (competition_id, participant_id, category)
  values (competition.id, actor, category_name)
  on conflict (competition_id, participant_id) do nothing
  returning * into registration;
  if registration.id is null then
    raise exception 'You are already registered for this competition.' using errcode = '23505';
  end if;
  insert into public.notifications (recipient_id, competition_id, kind, title, body, link_path)
  values (actor, competition.id, 'registration_confirmed', 'Registration confirmed',
    'You are registered for ' || competition.name || '.', '/competition/' || competition.slug || '/register');
  return registration;
end;
$$;
revoke all on function public.register_individual(uuid,text) from public, anon;
grant execute on function public.register_individual(uuid,text) to authenticated;
commit;

-- Milestone 7: private competition teams and transactional team entry.
begin;

create schema if not exists vertex_private;
revoke all on schema vertex_private from public, anon, authenticated;

create table public.competition_teams (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  captain_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (name = btrim(name) and length(name) between 3 and 80 and name !~ '[[:cntrl:]]'),
  category text check (category is null or length(btrim(category)) between 1 and 80),
  registered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, competition_id),
  check (registered_at is not null or category is null)
);
create unique index competition_teams_name_unique on public.competition_teams (competition_id, lower(name));
create index competition_teams_captain_idx on public.competition_teams (captain_id);
alter table public.competition_teams enable row level security;
revoke all on public.competition_teams from anon, authenticated;
grant select on public.competition_teams to authenticated;
create policy competition_teams_read on public.competition_teams for select to authenticated
  using (captain_id = (select auth.uid()) or exists (
    select 1 from public.competitions c where c.id = competition_id and c.owner_id = (select auth.uid())
  ));

create table public.competition_team_members (
  team_id uuid not null,
  competition_id uuid not null,
  participant_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, participant_id),
  unique (competition_id, participant_id),
  foreign key (team_id, competition_id) references public.competition_teams(id, competition_id) on delete cascade
);
create index competition_team_members_participant_idx on public.competition_team_members (participant_id, joined_at desc);
alter table public.competition_team_members enable row level security;
revoke all on public.competition_team_members from anon, authenticated;
grant select on public.competition_team_members to authenticated;
create policy competition_team_members_read on public.competition_team_members for select to authenticated
  using (participant_id = (select auth.uid()) or exists (
    select 1 from public.competition_teams t where t.id = team_id and (
      t.captain_id = (select auth.uid()) or exists (
        select 1 from public.competitions c where c.id = t.competition_id and c.owner_id = (select auth.uid())
      )
    )
  ));

create table public.competition_team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  competition_id uuid not null,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (team_id, competition_id) references public.competition_teams(id, competition_id) on delete cascade,
  check ((status = 'pending' and responded_at is null) or (status <> 'pending' and responded_at is not null))
);
create unique index competition_team_invitations_pending_unique
  on public.competition_team_invitations (team_id, invitee_id) where status = 'pending';
create index competition_team_invitations_inbox_idx
  on public.competition_team_invitations (invitee_id, status, expires_at desc);
create index competition_team_invitations_team_idx
  on public.competition_team_invitations (team_id, created_at desc);
alter table public.competition_team_invitations enable row level security;
revoke all on public.competition_team_invitations from anon, authenticated;
grant select on public.competition_team_invitations to authenticated;
create policy competition_team_invitations_read on public.competition_team_invitations for select to authenticated
  using (invitee_id = (select auth.uid()) or exists (
    select 1 from public.competition_teams t where t.id = team_id and t.captain_id = (select auth.uid())
  ));

create function vertex_private.assert_team_eligible(c public.competitions, p public.profiles, require_open boolean default false)
returns void language plpgsql set search_path = public, pg_temp as $$
declare years integer;
begin
  if c.id is null or c.status <> 'published' or c.team_mode = 'individual' then
    raise exception 'This competition does not accept team entries.' using errcode = '23514';
  end if;
  if p.id is null or p.account_type <> 'participant' or p.profile_completed_at is null
     or p.full_name is null or p.username is null or p.birthday is null then
    raise exception 'Only participants with a completed profile and birthday can join teams.' using errcode = '23514';
  end if;
  if c.registration_closes_at is null or now() >= c.registration_closes_at then
    raise exception 'The registration deadline has passed.' using errcode = '23514';
  end if;
  if require_open and (c.registration_opens_at is null or now() < c.registration_opens_at) then
    raise exception 'Registration has not opened yet.' using errcode = '23514';
  end if;
  years := extract(year from age(current_date, p.birthday))::integer;
  if c.minimum_age is not null and years < c.minimum_age then
    raise exception 'Every team member must be at least % years old.', c.minimum_age using errcode = '23514';
  end if;
  if c.maximum_age is not null and years > c.maximum_age then
    raise exception 'Every team member must be % years old or younger.', c.maximum_age using errcode = '23514';
  end if;
end;
$$;
create function vertex_private.assert_free_identity(target_competition_id uuid, target_participant_id uuid)
returns void language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.individual_registrations r
             where r.competition_id = target_competition_id and r.participant_id = target_participant_id) then
    raise exception 'This participant already has an individual entry.' using errcode = '23505';
  end if;
  if exists (select 1 from public.competition_team_members m
             where m.competition_id = target_competition_id and m.participant_id = target_participant_id) then
    raise exception 'This participant already belongs to a team for this competition.' using errcode = '23505';
  end if;
end;
$$;
revoke all on function vertex_private.assert_team_eligible(public.competitions, public.profiles, boolean) from public, anon, authenticated;
revoke all on function vertex_private.assert_free_identity(uuid, uuid) from public, anon, authenticated;

create function public.create_competition_team(target_competition_id uuid, team_name text)
returns public.competition_teams language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); c public.competitions; p public.profiles; team public.competition_teams; cleaned text := btrim(team_name);
begin
  if actor is null then raise exception 'Log in as a participant to create a team.' using errcode = '42501'; end if;
  if cleaned is null or length(cleaned) not between 3 and 80 or cleaned ~ '[[:cntrl:]]' then
    raise exception 'Choose a team name of 3 to 80 characters.' using errcode = '23514';
  end if;
  select * into p from public.profiles where id = actor for update;
  select * into c from public.competitions where id = target_competition_id for share;
  perform vertex_private.assert_team_eligible(c, p);
  perform vertex_private.assert_free_identity(c.id, actor);
  insert into public.competition_teams (competition_id, captain_id, name)
  values (c.id, actor, cleaned) returning * into team;
  insert into public.competition_team_members (team_id, competition_id, participant_id)
  values (team.id, c.id, actor);
  update public.competition_team_invitations set status = 'cancelled', responded_at = now()
  where competition_id = c.id and invitee_id = actor and status = 'pending';
  return team;
end;
$$;

create function public.invite_competition_team_member(target_team_id uuid, target_username text)
returns public.competition_team_invitations language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); team public.competition_teams; c public.competitions; invitee public.profiles;
  invitation public.competition_team_invitations; username_text text := regexp_replace(btrim(target_username), '^@', ''); occupied integer;
begin
  if actor is null then raise exception 'Log in to invite a participant.' using errcode = '42501'; end if;
  if username_text is null or username_text !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception 'Enter a valid @username.' using errcode = '23514';
  end if;
  select * into team from public.competition_teams where id = target_team_id for update;
  if team.id is null or team.captain_id <> actor then
    raise exception 'Only the team captain can invite members.' using errcode = '42501';
  end if;
  select * into c from public.competitions where id = team.competition_id;
  if team.registered_at is not null then raise exception 'The registered roster is locked.' using errcode = '23514'; end if;
  if now() >= c.registration_closes_at then raise exception 'The registration deadline has passed.' using errcode = '23514'; end if;
  select * into invitee from public.profiles where lower(username::text) = lower(username_text) for update;
  if invitee.id is null then raise exception 'No participant has that @username.' using errcode = '23514'; end if;
  if invitee.id = actor then raise exception 'The captain already belongs to this team.' using errcode = '23514'; end if;
  perform vertex_private.assert_team_eligible(c, invitee);
  perform vertex_private.assert_free_identity(c.id, invitee.id);
  update public.competition_team_invitations set status = 'cancelled', responded_at = now()
  where team_id = team.id and invitee_id = invitee.id and status = 'pending' and expires_at <= now();
  if exists (select 1 from public.competition_team_invitations
             where team_id = team.id and invitee_id = invitee.id and status = 'pending') then
    raise exception 'This participant already has a pending invitation.' using errcode = '23505';
  end if;
  select count(*) into occupied from public.competition_team_members where team_id = team.id;
  occupied := occupied + (select count(*) from public.competition_team_invitations
    where team_id = team.id and status = 'pending' and expires_at > now());
  if occupied >= c.maximum_team_size then
    raise exception 'This team has no open invitation slots (maximum % members).', c.maximum_team_size using errcode = '23514';
  end if;
  insert into public.competition_team_invitations
    (team_id, competition_id, invitee_id, invited_by, expires_at)
  values (team.id, c.id, invitee.id, actor, least(now() + interval '14 days', c.registration_closes_at))
  returning * into invitation;
  insert into public.notifications (recipient_id, competition_id, kind, title, body, link_path)
  values (invitee.id, c.id, 'team_invitation', 'Team invitation',
    'You have been invited to ' || team.name || ' for ' || c.name || '.',
    '/competition/' || c.slug || '/team');
  return invitation;
end;
$$;

create function public.respond_competition_team_invitation(target_invitation_id uuid, accept_invitation boolean)
returns public.competition_team_invitations language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); invitation public.competition_team_invitations; team public.competition_teams;
  c public.competitions; p public.profiles; occupied integer;
begin
  if actor is null then raise exception 'Log in to respond to an invitation.' using errcode = '42501'; end if;
  -- Read the invite first, then lock the team before any participant profile lock.
  select * into invitation from public.competition_team_invitations where id = target_invitation_id;
  if invitation.id is null or invitation.invitee_id <> actor then
    raise exception 'This invitation is not yours.' using errcode = '42501';
  end if;
  select * into team from public.competition_teams where id = invitation.team_id for update;
  select * into invitation from public.competition_team_invitations where id = target_invitation_id for update;
  if invitation.status <> 'pending' then raise exception 'This invitation has already been answered.' using errcode = '23514'; end if;
  if now() >= invitation.expires_at then raise exception 'This invitation has expired.' using errcode = '23514'; end if;
  if accept_invitation is null then raise exception 'Choose accept or decline.' using errcode = '23514'; end if;
  if team.registered_at is not null then raise exception 'The registered roster is locked.' using errcode = '23514'; end if;
  select * into c from public.competitions where id = team.competition_id;
  if not accept_invitation then
    update public.competition_team_invitations set status = 'declined', responded_at = now()
    where id = invitation.id returning * into invitation;
    return invitation;
  end if;
  select * into p from public.profiles where id = actor for update;
  perform vertex_private.assert_team_eligible(c, p);
  perform vertex_private.assert_free_identity(c.id, actor);
  select count(*) into occupied from public.competition_team_members where team_id = team.id;
  if occupied >= c.maximum_team_size then
    raise exception 'This team is full (maximum % members).', c.maximum_team_size using errcode = '23514';
  end if;
  insert into public.competition_team_members (team_id, competition_id, participant_id)
  values (team.id, c.id, actor);
  update public.competition_team_invitations set status = 'accepted', responded_at = now()
  where id = invitation.id returning * into invitation;
  update public.competition_team_invitations set status = 'cancelled', responded_at = now()
  where invitee_id = actor and competition_id = c.id and id <> invitation.id and status = 'pending';
  insert into public.notifications (recipient_id, competition_id, kind, title, body, link_path)
  values (team.captain_id, c.id, 'team_member_joined', 'New team member',
    p.full_name || ' joined ' || team.name || '.', '/competition/' || c.slug || '/team');
  return invitation;
end;
$$;

create function public.cancel_competition_team_invitation(target_invitation_id uuid)
returns public.competition_team_invitations language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); invitation public.competition_team_invitations; team public.competition_teams;
begin
  if actor is null then raise exception 'Log in to cancel an invitation.' using errcode = '42501'; end if;
  select * into invitation from public.competition_team_invitations where id = target_invitation_id;
  if invitation.id is null then raise exception 'Invitation not found.' using errcode = '23514'; end if;
  select * into team from public.competition_teams where id = invitation.team_id for update;
  if team.captain_id <> actor then raise exception 'Only the team captain can cancel invitations.' using errcode = '42501'; end if;
  update public.competition_team_invitations set status = 'cancelled', responded_at = now()
  where id = invitation.id and status = 'pending' returning * into invitation;
  if invitation.id is null then raise exception 'Only pending invitations can be cancelled.' using errcode = '23514'; end if;
  return invitation;
end;
$$;

create function public.leave_competition_team(target_team_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); team public.competition_teams; c public.competitions; p public.profiles;
begin
  if actor is null then raise exception 'Log in to leave a team.' using errcode = '42501'; end if;
  select * into team from public.competition_teams where id = target_team_id for update;
  if team.id is null then raise exception 'Team not found.' using errcode = '23514'; end if;
  if team.captain_id = actor then
    raise exception 'The captain cannot leave. Remove members and disband an unregistered team instead.' using errcode = '23514';
  end if;
  if team.registered_at is not null then raise exception 'The registered roster is locked.' using errcode = '23514'; end if;
  delete from public.competition_team_members where team_id = team.id and participant_id = actor
  returning participant_id into actor;
  if actor is null then raise exception 'You do not belong to this team.' using errcode = '42501'; end if;
  select * into c from public.competitions where id = team.competition_id;
  select * into p from public.profiles where id = actor;
  insert into public.notifications (recipient_id, competition_id, kind, title, body, link_path)
  values (team.captain_id, c.id, 'team_member_left', 'Team member left',
    p.full_name || ' left ' || team.name || '.', '/competition/' || c.slug || '/team');
end;
$$;

create function public.remove_competition_team_member(target_team_id uuid, target_participant_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); team public.competition_teams; c public.competitions;
begin
  if actor is null then raise exception 'Log in to manage your team.' using errcode = '42501'; end if;
  select * into team from public.competition_teams where id = target_team_id for update;
  if team.id is null or team.captain_id <> actor then
    raise exception 'Only the team captain can remove members.' using errcode = '42501';
  end if;
  if target_participant_id = actor then
    raise exception 'The captain cannot remove themselves.' using errcode = '23514';
  end if;
  if team.registered_at is not null then raise exception 'The registered roster is locked.' using errcode = '23514'; end if;
  delete from public.competition_team_members
  where team_id = team.id and participant_id = target_participant_id;
  if not found then raise exception 'This participant is not on the team.' using errcode = '23514'; end if;
  select * into c from public.competitions where id = team.competition_id;
  insert into public.notifications (recipient_id, competition_id, kind, title, body, link_path)
  values (target_participant_id, c.id, 'team_member_removed', 'Team membership changed',
    'You were removed from ' || team.name || '.', '/competition/' || c.slug || '/team');
end;
$$;

create function public.disband_competition_team(target_team_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); team public.competition_teams;
begin
  if actor is null then raise exception 'Log in to manage your team.' using errcode = '42501'; end if;
  select * into team from public.competition_teams where id = target_team_id for update;
  if team.id is null or team.captain_id <> actor then
    raise exception 'Only the team captain can disband this team.' using errcode = '42501';
  end if;
  if team.registered_at is not null then raise exception 'Registered teams cannot be disbanded.' using errcode = '23514'; end if;
  if exists (select 1 from public.competition_team_members where team_id = team.id and participant_id <> actor) then
    raise exception 'Remove other members before disbanding this team.' using errcode = '23514';
  end if;
  if exists (select 1 from public.competition_team_invitations where team_id = team.id and status = 'pending') then
    raise exception 'Cancel pending invitations before disbanding this team.' using errcode = '23514';
  end if;
  delete from public.competition_teams where id = team.id;
end;
$$;

create function public.register_competition_team(target_team_id uuid, chosen_category text default null)
returns public.competition_teams language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); team public.competition_teams; c public.competitions; person public.profiles;
  member_count integer; category_name text := nullif(btrim(chosen_category), '');
begin
  if actor is null then raise exception 'Log in to register a team.' using errcode = '42501'; end if;
  select * into team from public.competition_teams where id = target_team_id for update;
  if team.id is null or team.captain_id <> actor then
    raise exception 'Only the team captain can register this team.' using errcode = '42501';
  end if;
  if team.registered_at is not null then raise exception 'This team is already registered.' using errcode = '23505'; end if;
  select * into c from public.competitions where id = team.competition_id;
  if c.status <> 'published' or c.team_mode = 'individual' then
    raise exception 'This competition does not accept team entries.' using errcode = '23514';
  end if;
  if c.registration_opens_at is null or now() < c.registration_opens_at then
    raise exception 'Registration has not opened yet.' using errcode = '23514';
  end if;
  if c.registration_closes_at is null or now() >= c.registration_closes_at then
    raise exception 'The registration deadline has passed.' using errcode = '23514';
  end if;
  select count(*) into member_count from public.competition_team_members where team_id = team.id;
  if member_count < c.minimum_team_size or member_count > c.maximum_team_size then
    raise exception 'Team size must be between % and % members; currently %.', c.minimum_team_size, c.maximum_team_size, member_count using errcode = '23514';
  end if;
  if cardinality(c.categories) > 0 then
    if category_name is null or not (category_name = any(c.categories)) then
      raise exception 'Choose one of this competition''s categories.' using errcode = '23514';
    end if;
  elsif category_name is not null then
    raise exception 'This competition does not use categories.' using errcode = '23514';
  end if;
  -- Team row serializes roster mutations; profile rows serialize individual entry races.
  for person in select p.* from public.profiles p join public.competition_team_members m
    on m.participant_id = p.id where m.team_id = team.id order by p.id for update of p
  loop
    perform vertex_private.assert_team_eligible(c, person, true);
    if exists (select 1 from public.individual_registrations r
               where r.competition_id = c.id and r.participant_id = person.id) then
      raise exception 'A team member already has an individual entry.' using errcode = '23505';
    end if;
  end loop;
  update public.competition_teams set registered_at = now(), category = category_name
  where id = team.id returning * into team;
  update public.competition_team_invitations set status = 'cancelled', responded_at = now()
  where team_id = team.id and status = 'pending';
  insert into public.notifications (recipient_id, competition_id, kind, title, body, link_path)
  select m.participant_id, c.id, 'team_registration_confirmed', 'Team entry confirmed',
    team.name || ' is registered for ' || c.name || '.', '/competition/' || c.slug || '/team'
  from public.competition_team_members m where m.team_id = team.id;
  return team;
end;
$$;

create function public.get_competition_team_workspace(target_competition_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); c public.competitions; team public.competition_teams;
  members jsonb := '[]'::jsonb; sent jsonb := '[]'::jsonb; incoming jsonb := '[]'::jsonb;
begin
  if actor is null then raise exception 'Log in to open your team.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = actor and account_type = 'participant') then
    raise exception 'Only participants can use team entry.' using errcode = '42501';
  end if;
  select * into c from public.competitions where id = target_competition_id and status = 'published';
  if c.id is null then raise exception 'Competition not found.' using errcode = '23514'; end if;
  select t.* into team from public.competition_teams t
  join public.competition_team_members m on m.team_id = t.id
  where t.competition_id = c.id and m.participant_id = actor;
  if team.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'full_name', p.full_name, 'username', p.username,
      'joined_at', m.joined_at, 'captain', p.id = team.captain_id
    ) order by (p.id <> team.captain_id), m.joined_at), '[]'::jsonb)
    into members from public.competition_team_members m
    join public.profiles p on p.id = m.participant_id where m.team_id = team.id;
    if team.captain_id = actor then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'invitee_id', i.invitee_id, 'full_name', p.full_name,
        'username', p.username, 'status', case when i.status = 'pending' and i.expires_at <= now()
          then 'expired' else i.status end, 'expires_at', i.expires_at
      ) order by i.created_at desc), '[]'::jsonb)
      into sent from public.competition_team_invitations i
      join public.profiles p on p.id = i.invitee_id
      where i.team_id = team.id;
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'team_id', t.id, 'team_name', t.name,
    'captain_name', p.full_name, 'captain_username', p.username,
    'expires_at', i.expires_at
  ) order by i.created_at desc), '[]'::jsonb)
  into incoming from public.competition_team_invitations i
  join public.competition_teams t on t.id = i.team_id
  join public.profiles p on p.id = t.captain_id
  where i.competition_id = c.id and i.invitee_id = actor and i.status = 'pending'
    and i.expires_at > now() and t.registered_at is null;
  return jsonb_build_object(
    'team', case when team.id is null then null else jsonb_build_object(
      'id', team.id, 'name', team.name, 'captain_id', team.captain_id,
      'category', team.category, 'registered_at', team.registered_at,
      'created_at', team.created_at
    ) end,
    'members', members, 'sent_invitations', sent, 'incoming_invitations', incoming,
    'individual_registered', exists (
      select 1 from public.individual_registrations r
      where r.competition_id = c.id and r.participant_id = actor
    )
  );
end;
$$;

create function public.my_competition_team_dashboard()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); teams jsonb; invitations jsonb;
begin
  if actor is null then raise exception 'Log in to view your teams.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = actor and account_type = 'participant') then
    raise exception 'Only participants can view team entries.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'captain_id', t.captain_id,
    'category', t.category, 'registered_at', t.registered_at,
    'competition_name', c.name, 'competition_slug', c.slug, 'starts_at', c.starts_at,
    'member_count', (select count(*) from public.competition_team_members m2 where m2.team_id = t.id)
  ) order by t.created_at desc), '[]'::jsonb)
  into teams from public.competition_team_members m
  join public.competition_teams t on t.id = m.team_id
  join public.competitions c on c.id = t.competition_id
  where m.participant_id = actor;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'team_name', t.name, 'competition_name', c.name,
    'competition_slug', c.slug, 'expires_at', i.expires_at
  ) order by i.created_at desc), '[]'::jsonb)
  into invitations from public.competition_team_invitations i
  join public.competition_teams t on t.id = i.team_id
  join public.competitions c on c.id = i.competition_id
  where i.invitee_id = actor and i.status = 'pending' and i.expires_at > now()
    and t.registered_at is null;
  return jsonb_build_object('teams', teams, 'invitations', invitations);
end;
$$;

create function public.organiser_competition_entries(
  target_competition_id uuid, team_page integer default 0, individual_page integer default 0
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); c public.competitions; teams jsonb; individuals jsonb;
  team_total integer; individual_total integer; t_page integer := greatest(0, least(coalesce(team_page, 0), 100000));
  i_page integer := greatest(0, least(coalesce(individual_page, 0), 100000));
begin
  if actor is null then raise exception 'Log in as the competition owner.' using errcode = '42501'; end if;
  select * into c from public.competitions where id = target_competition_id;
  if c.id is null or c.owner_id <> actor then
    raise exception 'Only the competition owner can view participants.' using errcode = '42501';
  end if;
  select count(*) into team_total from public.competition_teams
  where competition_id = c.id and registered_at is not null;
  select count(*) into individual_total from public.individual_registrations where competition_id = c.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'category', t.category, 'registered_at', t.registered_at,
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'full_name', p.full_name, 'username', p.username,
      'captain', p.id = t.captain_id
    ) order by (p.id <> t.captain_id), m.joined_at), '[]'::jsonb)
      from public.competition_team_members m join public.profiles p on p.id = m.participant_id
      where m.team_id = t.id)
  ) order by t.registered_at desc, t.id), '[]'::jsonb) into teams
  from (select * from public.competition_teams
    where competition_id = c.id and registered_at is not null
    order by registered_at desc, id limit 25 offset t_page * 25) t;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'category', r.category, 'created_at', r.created_at,
    'full_name', p.full_name, 'username', p.username
  ) order by r.created_at desc, r.id), '[]'::jsonb) into individuals
  from (select * from public.individual_registrations
    where competition_id = c.id order by created_at desc, id
    limit 25 offset i_page * 25) r
  join public.profiles p on p.id = r.participant_id;
  return jsonb_build_object('teams', teams, 'individuals', individuals,
    'team_total', team_total, 'individual_total', individual_total,
    'team_page', t_page, 'individual_page', i_page);
end;
$$;

-- Replace Milestone 6 entry RPC so an individual entry cannot race team membership.
create or replace function public.register_individual(target_competition_id uuid, chosen_category text default null)
returns public.individual_registrations
language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); person public.profiles; competition public.competitions;
  registration public.individual_registrations; participant_age integer;
  category_name text := nullif(btrim(chosen_category), '');
begin
  if actor is null then raise exception 'Log in as a participant to register.' using errcode = '42501'; end if;
  select * into person from public.profiles where id = actor for update;
  if person.id is null or person.account_type <> 'participant' then
    raise exception 'Only participant accounts can register.' using errcode = '42501';
  end if;
  if person.profile_completed_at is null or person.full_name is null or person.username is null or person.birthday is null then
    raise exception 'Complete your profile and birthday before registering.' using errcode = '23514';
  end if;
  select * into competition from public.competitions where id = target_competition_id for share;
  if competition.id is null or competition.status <> 'published' then
    raise exception 'This competition is not available for registration.' using errcode = '23514';
  end if;
  if competition.team_mode = 'team' then
    raise exception 'This competition accepts teams only.' using errcode = '23514';
  end if;
  if exists (select 1 from public.individual_registrations r
             where r.competition_id = competition.id and r.participant_id = actor) then
    raise exception 'You are already registered for this competition.' using errcode = '23505';
  end if;
  if exists (select 1 from public.competition_team_members m
             where m.competition_id = competition.id and m.participant_id = actor) then
    raise exception 'You already belong to a team for this competition.' using errcode = '23505';
  end if;
  if competition.registration_opens_at is null or now() < competition.registration_opens_at then
    raise exception 'Registration has not opened yet.' using errcode = '23514';
  end if;
  if competition.registration_closes_at is null or now() >= competition.registration_closes_at then
    raise exception 'The registration deadline has passed.' using errcode = '23514';
  end if;
  participant_age := extract(year from age(current_date, person.birthday))::integer;
  if competition.minimum_age is not null and participant_age < competition.minimum_age then
    raise exception 'You must be at least % years old to register.', competition.minimum_age using errcode = '23514';
  end if;
  if competition.maximum_age is not null and participant_age > competition.maximum_age then
    raise exception 'You must be % years old or younger to register.', competition.maximum_age using errcode = '23514';
  end if;
  if cardinality(competition.categories) > 0 then
    if category_name is null or not (category_name = any(competition.categories)) then
      raise exception 'Choose one of this competition''s categories.' using errcode = '23514';
    end if;
  elsif category_name is not null then
    raise exception 'This competition does not use categories.' using errcode = '23514';
  end if;
  insert into public.individual_registrations (competition_id, participant_id, category)
  values (competition.id, actor, category_name)
  on conflict (competition_id, participant_id) do nothing returning * into registration;
  if registration.id is null then
    raise exception 'You are already registered for this competition.' using errcode = '23505';
  end if;
  insert into public.notifications (recipient_id, competition_id, kind, title, body, link_path)
  values (actor, competition.id, 'registration_confirmed', 'Registration confirmed',
    'You are registered for ' || competition.name || '.', '/competition/' || competition.slug || '/register');
  return registration;
end;
$$;

revoke all on function public.create_competition_team(uuid, text) from public, anon;
revoke all on function public.invite_competition_team_member(uuid, text) from public, anon;
revoke all on function public.respond_competition_team_invitation(uuid, boolean) from public, anon;
revoke all on function public.cancel_competition_team_invitation(uuid) from public, anon;
revoke all on function public.leave_competition_team(uuid) from public, anon;
revoke all on function public.remove_competition_team_member(uuid, uuid) from public, anon;
revoke all on function public.disband_competition_team(uuid) from public, anon;
revoke all on function public.register_competition_team(uuid, text) from public, anon;
revoke all on function public.get_competition_team_workspace(uuid) from public, anon;
revoke all on function public.my_competition_team_dashboard() from public, anon;
revoke all on function public.organiser_competition_entries(uuid, integer, integer) from public, anon;
grant execute on function public.create_competition_team(uuid, text) to authenticated;
grant execute on function public.invite_competition_team_member(uuid, text) to authenticated;
grant execute on function public.respond_competition_team_invitation(uuid, boolean) to authenticated;
grant execute on function public.cancel_competition_team_invitation(uuid) to authenticated;
grant execute on function public.leave_competition_team(uuid) to authenticated;
grant execute on function public.remove_competition_team_member(uuid, uuid) to authenticated;
grant execute on function public.disband_competition_team(uuid) to authenticated;
grant execute on function public.register_competition_team(uuid, text) to authenticated;
grant execute on function public.get_competition_team_workspace(uuid) to authenticated;
grant execute on function public.my_competition_team_dashboard() to authenticated;
grant execute on function public.organiser_competition_entries(uuid, integer, integer) to authenticated;

alter publication supabase_realtime add table
  public.competition_teams, public.competition_team_members,
  public.competition_team_invitations, public.notifications;
commit;

-- Milestone 7 follow-up: cover team and notification foreign keys.
begin;
create index competition_team_members_team_comp_idx
  on public.competition_team_members (team_id, competition_id);
create index competition_team_invitations_team_comp_idx
  on public.competition_team_invitations (team_id, competition_id);
create index competition_team_invitations_invited_by_idx
  on public.competition_team_invitations (invited_by);
create index notifications_competition_idx
  on public.notifications (competition_id);
commit;

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

-- Milestone 9: competition-specific organiser collaboration.
begin;

create table public.competition_organisers (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  organiser_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'manager' check (role = 'manager'),
  joined_at timestamptz not null default now(),
  primary key (competition_id, organiser_id)
);
create index competition_organisers_person_idx on public.competition_organisers(organiser_id, competition_id);
alter table public.competition_organisers enable row level security;
revoke all on public.competition_organisers from public, anon, authenticated;
grant select on public.competition_organisers to authenticated;

create table public.competition_organiser_invitations (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  organiser_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  unique (competition_id, organiser_id),
  check (expires_at > created_at)
);
create index competition_organiser_invitations_person_idx on public.competition_organiser_invitations(organiser_id, status, expires_at);
alter table public.competition_organiser_invitations enable row level security;
revoke all on public.competition_organiser_invitations from public, anon, authenticated;
grant select on public.competition_organiser_invitations to authenticated;

create function public.can_manage_competition(target_competition_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.competitions c where c.id = target_competition_id
      and (c.owner_id = auth.uid() or exists (
        select 1 from public.competition_organisers m
        where m.competition_id = c.id and m.organiser_id = auth.uid() and m.role = 'manager'
      ))
  );
$$;
revoke all on function public.can_manage_competition(uuid) from public, anon;
grant execute on function public.can_manage_competition(uuid) to authenticated;

create policy competition_organisers_read on public.competition_organisers
  for select to authenticated using (public.can_manage_competition(competition_id));
create policy competition_organiser_invitations_read on public.competition_organiser_invitations
  for select to authenticated using (
    organiser_id = (select auth.uid()) or exists (
      select 1 from public.competitions c
      where c.id = competition_id and c.owner_id = (select auth.uid())
    )
  );
drop policy competitions_read on public.competitions;
create policy competitions_read_public on public.competitions for select to anon
  using (status = 'published');
create policy competitions_read_authenticated on public.competitions for select to authenticated
  using (status = 'published' or owner_id = (select auth.uid())
    or public.can_manage_competition(id));

create function public.invite_competition_organiser(target_competition_id uuid, target_username text)
returns public.competition_organiser_invitations language plpgsql security definer
set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); c public.competitions; invitee public.profiles;
  invitation public.competition_organiser_invitations; cleaned text := lower(regexp_replace(btrim(target_username), '^@', ''));
begin
  if actor is null then raise exception 'Log in as the competition owner.' using errcode = '42501'; end if;
  select * into c from public.competitions where id = target_competition_id for update;
  if c.id is null or c.owner_id <> actor then
    raise exception 'Only the competition owner can invite organisers.' using errcode = '42501';
  end if;
  if cleaned !~ '^[a-z0-9_]{3,24}$' then raise exception 'Enter a valid organiser @username.'; end if;
  select * into invitee from public.profiles where lower(username::text) = cleaned;
  if invitee.id is null or invitee.account_type <> 'organiser' or invitee.profile_completed_at is null then
    raise exception 'Choose a completed organiser account, not a participant account.';
  end if;
  if invitee.id = actor then raise exception 'You already own this competition.'; end if;
  if exists (select 1 from public.competition_organisers m where m.competition_id = c.id and m.organiser_id = invitee.id) then
    raise exception 'This organiser already manages the competition.';
  end if;
  select * into invitation from public.competition_organiser_invitations
    where competition_id = c.id and organiser_id = invitee.id for update;
  if invitation.id is not null and invitation.status = 'pending' and invitation.expires_at > now() then
    raise exception 'An invitation is already waiting for this organiser.';
  end if;
  insert into public.competition_organiser_invitations
    (competition_id, organiser_id, invited_by, status, expires_at)
  values (c.id, invitee.id, actor, 'pending', now() + interval '14 days')
  on conflict (competition_id, organiser_id) do update
    set invited_by = excluded.invited_by, status = 'pending', created_at = now(),
      expires_at = excluded.expires_at, responded_at = null
  returning * into invitation;
  insert into public.notifications(recipient_id, competition_id, kind, title, body, link_path)
  values(invitee.id, c.id, 'competition_organiser_invitation', 'Competition organiser invitation',
    'You were invited to manage ' || c.name || '. Respond within 14 days.',
    '/organiser');
  return invitation;
end;
$$;

create function public.respond_competition_organiser_invitation(invitation_id uuid, accept_invitation boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); invitation public.competition_organiser_invitations; c public.competitions;
begin
  if actor is null then raise exception 'Log in to respond.' using errcode = '42501'; end if;
  select * into invitation from public.competition_organiser_invitations where id = invitation_id for update;
  if invitation.id is null or invitation.organiser_id <> actor then
    raise exception 'This invitation is not addressed to your account.' using errcode = '42501';
  end if;
  if invitation.status <> 'pending' then raise exception 'This invitation has already been answered.'; end if;
  if invitation.expires_at <= now() then raise exception 'This invitation has expired. Ask the owner to invite you again.'; end if;
  if accept_invitation is null then raise exception 'Choose accept or decline.'; end if;
  if not exists (select 1 from public.profiles p where p.id = actor and p.account_type = 'organiser' and p.profile_completed_at is not null) then
    raise exception 'Only completed organiser accounts can accept invitations.' using errcode = '42501';
  end if;
  select * into c from public.competitions where id = invitation.competition_id for update;
  if c.id is null then raise exception 'Competition no longer exists.'; end if;
  if accept_invitation then
    if c.owner_id = actor then raise exception 'You already own this competition.'; end if;
    insert into public.competition_organisers(competition_id, organiser_id)
      values(c.id, actor) on conflict do nothing;
  end if;
  update public.competition_organiser_invitations
    set status = case when accept_invitation then 'accepted' else 'declined' end,
      responded_at = now()
    where id = invitation.id;
  insert into public.notifications(recipient_id, competition_id, kind, title, body, link_path)
  values(c.owner_id, c.id, 'competition_organiser_response', 'Organiser invitation answered',
    (select full_name from public.profiles where id = actor) ||
      case when accept_invitation then ' joined ' else ' declined the invitation to ' end || c.name || '.',
    '/organiser/competition/' || c.slug || '/workspace');
end;
$$;

create function public.remove_competition_organiser(target_competition_id uuid, target_organiser_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); c public.competitions;
begin
  if actor is null then raise exception 'Log in to change organiser access.' using errcode = '42501'; end if;
  select * into c from public.competitions where id = target_competition_id for update;
  if c.id is null then raise exception 'Competition not found.'; end if;
  if target_organiser_id = c.owner_id then
    raise exception 'The competition owner cannot be removed.' using errcode = '42501';
  end if;
  if actor <> c.owner_id and actor <> target_organiser_id then
    raise exception 'Only the owner can remove another organiser.' using errcode = '42501';
  end if;
  delete from public.competition_organisers
    where competition_id = c.id and organiser_id = target_organiser_id;
  if not found then raise exception 'This organiser is not on the team.'; end if;
  insert into public.notifications(recipient_id, competition_id, kind, title, body, link_path)
  values(target_organiser_id, c.id, 'competition_organiser_removed', 'Competition access ended',
    'You no longer manage ' || c.name || '.', '/organiser');
end;
$$;

create function public.cancel_competition_organiser_invitation(invitation_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); invitation public.competition_organiser_invitations;
begin
  if actor is null then raise exception 'Log in as the competition owner.' using errcode = '42501'; end if;
  select i.* into invitation from public.competition_organiser_invitations i
  join public.competitions c on c.id = i.competition_id
  where i.id = invitation_id and c.owner_id = actor for update of i;
  if invitation.id is null or invitation.status <> 'pending' then
    raise exception 'No pending invitation can be cancelled.' using errcode = '42501';
  end if;
  update public.competition_organiser_invitations
    set status = 'cancelled', responded_at = now() where id = invitation.id;
end;
$$;

create function public.my_competition_organiser_invitations()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'competition_name', c.name, 'competition_slug', c.slug,
    'owner_name', p.full_name, 'owner_username', p.username,
    'expires_at', i.expires_at, 'created_at', i.created_at
  ) order by i.created_at desc), '[]'::jsonb)
  from public.competition_organiser_invitations i
  join public.competitions c on c.id = i.competition_id
  join public.profiles p on p.id = c.owner_id
  where i.organiser_id = auth.uid() and i.status = 'pending' and i.expires_at > now()
    and exists (select 1 from public.profiles mine
      where mine.id = auth.uid() and mine.account_type = 'organiser');
$$;

revoke all on function public.invite_competition_organiser(uuid,text),
  public.respond_competition_organiser_invitation(uuid,boolean),
  public.remove_competition_organiser(uuid,uuid),
  public.cancel_competition_organiser_invitation(uuid),
  public.my_competition_organiser_invitations() from public, anon;
grant execute on function public.invite_competition_organiser(uuid,text),
  public.respond_competition_organiser_invitation(uuid,boolean),
  public.remove_competition_organiser(uuid,uuid),
  public.cancel_competition_organiser_invitation(uuid),
  public.my_competition_organiser_invitations() to authenticated;

-- Existing owner checks in three RPCs are replaced below with owner-or-manager checks.

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
    if not public.can_manage_competition(candidate.id) then raise exception 'You cannot edit this competition.' using errcode = '42501'; end if;
    if expected_version is distinct from previous.version then raise exception 'This competition changed in another tab. Reload before saving.' using errcode = 'PT409'; end if;
  elsif expected_version is not null then raise exception 'Competition no longer exists. Reload before saving.'; end if;
  candidate.owner_id := coalesce(previous.owner_id, actor);
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
  if candidate.banner_kind = 'image' and (previous.id is null or candidate.banner_path is distinct from previous.banner_path) and (candidate.banner_path is null or split_part(candidate.banner_path,'/',1) <> actor::text or split_part(candidate.banner_path,'/',2) <> candidate.id::text or not exists (
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

create or replace function public.organiser_competition_entries(
  target_competition_id uuid, team_page integer default 0, individual_page integer default 0
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); c public.competitions; teams jsonb; individuals jsonb;
  team_total integer; individual_total integer; t_page integer := greatest(0, least(coalesce(team_page, 0), 100000));
  i_page integer := greatest(0, least(coalesce(individual_page, 0), 100000));
begin
  if actor is null then raise exception 'Log in as the competition owner.' using errcode = '42501'; end if;
  select * into c from public.competitions where id = target_competition_id;
  if c.id is null or not public.can_manage_competition(c.id) then
    raise exception 'Only competition organisers can view participants.' using errcode = '42501';
  end if;
  select count(*) into team_total from public.competition_teams
  where competition_id = c.id and registered_at is not null;
  select count(*) into individual_total from public.individual_registrations where competition_id = c.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'category', t.category, 'registered_at', t.registered_at,
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'full_name', p.full_name, 'username', p.username,
      'captain', p.id = t.captain_id
    ) order by (p.id <> t.captain_id), m.joined_at), '[]'::jsonb)
      from public.competition_team_members m join public.profiles p on p.id = m.participant_id
      where m.team_id = t.id)
  ) order by t.registered_at desc, t.id), '[]'::jsonb) into teams
  from (select * from public.competition_teams
    where competition_id = c.id and registered_at is not null
    order by registered_at desc, id limit 25 offset t_page * 25) t;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'category', r.category, 'created_at', r.created_at,
    'full_name', p.full_name, 'username', p.username
  ) order by r.created_at desc, r.id), '[]'::jsonb) into individuals
  from (select * from public.individual_registrations
    where competition_id = c.id order by created_at desc, id
    limit 25 offset i_page * 25) r
  join public.profiles p on p.id = r.participant_id;
  return jsonb_build_object('teams', teams, 'individuals', individuals,
    'team_total', team_total, 'individual_total', individual_total,
    'team_page', t_page, 'individual_page', i_page);
end;
$$;

create or replace function public.organiser_dashboard_summary()
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
    'id', c.id, 'owner_id', c.owner_id, 'access_role', case when c.owner_id = actor then 'owner' else 'manager' end, 'name', c.name, 'slug', c.slug, 'status', c.status,
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
  from public.competitions c where public.can_manage_competition(c.id);

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
    where public.can_manage_competition(c.id)
    union all
    select 'team_registration', c.name, c.slug, t.name, t.registered_at
    from public.competition_teams t
    join public.competitions c on c.id = t.competition_id
    where public.can_manage_competition(c.id) and t.registered_at is not null
    union all
    select 'competition_updated', c.name, c.slug, c.name, c.updated_at
    from public.competitions c where public.can_manage_competition(c.id)
    order by occurred_at desc limit 12
  ) activity;

  return jsonb_build_object('competitions', competitions_json, 'recent_activity', activity_json);
end;
$$;

create policy competition_banners_read_managers on storage.objects for select to authenticated using (
  bucket_id = 'competition-banners' and exists (
    select 1 from public.competitions c
    where c.banner_path = name and public.can_manage_competition(c.id)
  )
);
create policy competition_banners_delete_managers on storage.objects for delete to authenticated using (
  bucket_id = 'competition-banners' and exists (
    select 1 from public.competitions c
    where c.id::text = split_part(name, '/', 2)
      and c.banner_path is distinct from name
      and public.can_manage_competition(c.id)
  )
);
commit;

-- Follow-up to 007: cover the invitation author foreign key.
begin;
create index competition_organiser_invitations_inviter_idx
  on public.competition_organiser_invitations(invited_by);
commit;
begin;

create table public.competition_announcements (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index competition_announcements_feed_idx on public.competition_announcements (competition_id, created_at desc) where deleted_at is null;
create index competition_announcements_author_idx on public.competition_announcements (author_id);

create function public.can_read_competition_announcements(target_competition_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and (
    public.can_manage_competition(target_competition_id)
    or exists (select 1 from public.individual_registrations r
      where r.competition_id = target_competition_id and r.participant_id = auth.uid())
    or exists (select 1 from public.competition_team_members m
      join public.competition_teams t on t.id = m.team_id and t.competition_id = m.competition_id
      where m.competition_id = target_competition_id and m.participant_id = auth.uid()
        and t.registered_at is not null)
  );
$$;
revoke all on function public.can_read_competition_announcements(uuid) from public, anon;
grant execute on function public.can_read_competition_announcements(uuid) to authenticated;

alter table public.competition_announcements enable row level security;
revoke all on public.competition_announcements from public, anon, authenticated;
grant select on public.competition_announcements to authenticated;
create policy competition_announcements_read on public.competition_announcements
  for select to authenticated using (
    deleted_at is null and public.can_read_competition_announcements(competition_id)
  );

alter table public.notifications add column announcement_id uuid
  references public.competition_announcements(id) on delete cascade;
create index notifications_announcement_idx on public.notifications (announcement_id)
  where announcement_id is not null;
create index notifications_unread_idx on public.notifications (recipient_id, created_at desc)
  where read_at is null;

create function public.publish_competition_announcement(target_competition_id uuid, heading text, message text)
returns public.competition_announcements language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  competition public.competitions;
  created public.competition_announcements;
begin
  if actor is null or not public.can_manage_competition(target_competition_id) then
    raise exception 'Only competition organisers can publish announcements.' using errcode = '42501';
  end if;
  select * into competition from public.competitions where id = target_competition_id for share;
  if competition.status <> 'published' then
    raise exception 'Publish the competition before sending announcements.' using errcode = '23514';
  end if;
  if length(btrim(coalesce(heading, ''))) not between 1 and 160
     or length(btrim(coalesce(message, ''))) not between 1 and 5000 then
    raise exception 'Add a title (1–160 characters) and message (1–5000 characters).' using errcode = '23514';
  end if;
  insert into public.competition_announcements(competition_id, author_id, title, body)
  values (target_competition_id, actor, btrim(heading), btrim(message)) returning * into created;
  insert into public.notifications(recipient_id, competition_id, announcement_id, kind, title, body, link_path)
  select recipients.participant_id, competition.id, created.id, 'announcement', created.title,
    left(created.body, 1000), '/competition/' || competition.slug || '/announcements/' || created.id
  from (
    select r.participant_id from public.individual_registrations r where r.competition_id = competition.id
    union
    select m.participant_id from public.competition_team_members m
      join public.competition_teams t on t.id = m.team_id and t.competition_id = m.competition_id
      where m.competition_id = competition.id and t.registered_at is not null
  ) recipients;
  return created;
end;
$$;

create function public.edit_competition_announcement(target_announcement_id uuid, heading text, message text)
returns public.competition_announcements language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  previous public.competition_announcements;
  changed public.competition_announcements;
begin
  select * into previous from public.competition_announcements
    where id = target_announcement_id and deleted_at is null for update;
  if actor is null or previous.id is null or not public.can_manage_competition(previous.competition_id)
     or (previous.author_id <> actor and not exists (
       select 1 from public.competitions where id = previous.competition_id and owner_id = actor
     )) then
    raise exception 'Only the author or competition owner can edit this announcement.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(heading, ''))) not between 1 and 160
     or length(btrim(coalesce(message, ''))) not between 1 and 5000 then
    raise exception 'Add a title (1–160 characters) and message (1–5000 characters).' using errcode = '23514';
  end if;
  update public.competition_announcements set title = btrim(heading), body = btrim(message),
    updated_at = now() where id = target_announcement_id returning * into changed;
  update public.notifications set title = changed.title, body = left(changed.body, 1000)
    where announcement_id = changed.id;
  return changed;
end;
$$;

create function public.delete_competition_announcement(target_announcement_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  previous public.competition_announcements;
begin
  select * into previous from public.competition_announcements
    where id = target_announcement_id and deleted_at is null for update;
  if actor is null or previous.id is null or not public.can_manage_competition(previous.competition_id)
     or (previous.author_id <> actor and not exists (
       select 1 from public.competitions where id = previous.competition_id and owner_id = actor
     )) then
    raise exception 'Only the author or competition owner can delete this announcement.' using errcode = '42501';
  end if;
  update public.competition_announcements set deleted_at = now(), updated_at = now()
    where id = target_announcement_id;
  delete from public.notifications where announcement_id = target_announcement_id;
end;
$$;

create function public.mark_notification_read(target_notification_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Log in to manage notifications.' using errcode = '42501'; end if;
  update public.notifications set read_at = coalesce(read_at, now())
    where id = target_notification_id and recipient_id = auth.uid();
  if not found then raise exception 'Notification unavailable.' using errcode = '42501'; end if;
end;
$$;

create function public.mark_all_notifications_read()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Log in to manage notifications.' using errcode = '42501'; end if;
  update public.notifications set read_at = now()
    where recipient_id = auth.uid() and read_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.publish_competition_announcement(uuid,text,text),
  public.edit_competition_announcement(uuid,text,text),
  public.delete_competition_announcement(uuid),
  public.mark_notification_read(uuid), public.mark_all_notifications_read()
  from public, anon;
grant execute on function public.publish_competition_announcement(uuid,text,text),
  public.edit_competition_announcement(uuid,text,text),
  public.delete_competition_announcement(uuid),
  public.mark_notification_read(uuid), public.mark_all_notifications_read()
  to authenticated;

alter publication supabase_realtime add table public.competition_announcements;
commit;
begin;

create table public.competition_questions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(btrim(body)) between 1 and 3000),
  status text not null default 'open' check (status in ('open', 'answered', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index competition_questions_feed_idx on public.competition_questions (competition_id, created_at desc);
create index competition_questions_open_idx on public.competition_questions (competition_id, created_at desc) where status = 'open';
create index competition_questions_author_idx on public.competition_questions (author_id);

create table public.competition_question_replies (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.competition_questions(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(btrim(body)) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index competition_question_replies_question_idx on public.competition_question_replies (question_id, created_at);
create index competition_question_replies_author_idx on public.competition_question_replies (author_id);

create function public.can_read_competition_questions(target_competition_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.can_read_competition_announcements(target_competition_id);
$$;
revoke all on function public.can_read_competition_questions(uuid) from public, anon;
grant execute on function public.can_read_competition_questions(uuid) to authenticated;

alter table public.competition_questions enable row level security;
alter table public.competition_question_replies enable row level security;
revoke all on public.competition_questions, public.competition_question_replies from public, anon, authenticated;
grant select on public.competition_questions, public.competition_question_replies to authenticated;
create policy competition_questions_read on public.competition_questions for select to authenticated
  using (public.can_read_competition_questions(competition_id));
create policy competition_question_replies_read on public.competition_question_replies for select to authenticated
  using (exists (select 1 from public.competition_questions q
    where q.id = question_id and public.can_read_competition_questions(q.competition_id)));

alter table public.notifications add column qa_question_id uuid
  references public.competition_questions(id) on delete cascade;
alter table public.notifications add column qa_reply_id uuid
  references public.competition_question_replies(id) on delete cascade;
create index notifications_qa_question_idx on public.notifications (qa_question_id) where qa_question_id is not null;
create index notifications_qa_reply_idx on public.notifications (qa_reply_id) where qa_reply_id is not null;

create function public.ask_competition_question(target_competition_id uuid, message text)
returns public.competition_questions language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  competition public.competitions;
  created public.competition_questions;
begin
  if actor is null or not exists (select 1 from public.profiles
      where id = actor and account_type = 'participant')
     or not public.can_read_competition_questions(target_competition_id) then
    raise exception 'Only registered participants can ask questions.' using errcode = '42501';
  end if;
  select * into competition from public.competitions where id = target_competition_id for share;
  if competition.id is null or competition.status <> 'published' then
    raise exception 'This competition is unavailable.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(message, ''))) not between 1 and 3000 then
    raise exception 'Write a question between 1 and 3000 characters.' using errcode = '23514';
  end if;
  insert into public.competition_questions (competition_id, author_id, body)
    values (competition.id, actor, btrim(message)) returning * into created;
  insert into public.notifications (recipient_id, competition_id, qa_question_id, kind, title, body, link_path)
    select managers.id, competition.id, created.id, 'qa_question',
      'New competition question', left(created.body, 1000),
      '/competition/' || competition.slug || '/questions/' || created.id
    from (
      select competition.owner_id as id
      union
      select co.organiser_id from public.competition_organisers co
        where co.competition_id = competition.id and co.role = 'manager'
    ) managers;
  return created;
end;
$$;

create function public.reply_to_competition_question(target_question_id uuid, message text)
returns public.competition_question_replies language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  question public.competition_questions;
  reply public.competition_question_replies;
  slug text;
begin
  select * into question from public.competition_questions where id = target_question_id for update;
  if actor is null or question.id is null or not public.can_manage_competition(question.competition_id) then
    raise exception 'Only this competition’s organisers can reply.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(message, ''))) not between 1 and 3000 then
    raise exception 'Write a reply between 1 and 3000 characters.' using errcode = '23514';
  end if;
  insert into public.competition_question_replies (question_id, author_id, body)
    values (question.id, actor, btrim(message)) returning * into reply;
  update public.competition_questions set status = 'answered', updated_at = now() where id = question.id;
  select c.slug into slug from public.competitions c where c.id = question.competition_id;
  insert into public.notifications (recipient_id, competition_id, qa_question_id, qa_reply_id, kind, title, body, link_path)
    values (question.author_id, question.competition_id, question.id, reply.id, 'qa_reply',
      'Your question has a reply', left(reply.body, 1000),
      '/competition/' || slug || '/questions/' || question.id);
  return reply;
end;
$$;

create function public.edit_competition_question_reply(target_reply_id uuid, message text)
returns public.competition_question_replies language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  prior public.competition_question_replies;
  question public.competition_questions;
  changed public.competition_question_replies;
begin
  select * into prior from public.competition_question_replies where id = target_reply_id for update;
  select * into question from public.competition_questions where id = prior.question_id;
  if actor is null or prior.id is null or prior.author_id <> actor
     or not public.can_manage_competition(question.competition_id) then
    raise exception 'Only the reply author can edit this reply.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(message, ''))) not between 1 and 3000 then
    raise exception 'Write a reply between 1 and 3000 characters.' using errcode = '23514';
  end if;
  update public.competition_question_replies set body = btrim(message), updated_at = now()
    where id = prior.id returning * into changed;
  update public.notifications set body = left(changed.body, 1000) where qa_reply_id = changed.id;
  return changed;
end;
$$;

create function public.set_competition_question_resolved(target_question_id uuid, resolved boolean)
returns public.competition_questions language plpgsql security definer set search_path = public, pg_temp as $$
declare
  question public.competition_questions;
  changed public.competition_questions;
begin
  select * into question from public.competition_questions where id = target_question_id for update;
  if auth.uid() is null or question.id is null or not public.can_manage_competition(question.competition_id) then
    raise exception 'Only this competition’s organisers can change question status.' using errcode = '42501';
  end if;
  update public.competition_questions set status = case
      when resolved then 'resolved'
      when exists (select 1 from public.competition_question_replies where question_id = question.id) then 'answered'
      else 'open' end,
    updated_at = now() where id = question.id returning * into changed;
  return changed;
end;
$$;

revoke all on function public.ask_competition_question(uuid,text),
  public.reply_to_competition_question(uuid,text),
  public.edit_competition_question_reply(uuid,text),
  public.set_competition_question_resolved(uuid,boolean) from public, anon;
grant execute on function public.ask_competition_question(uuid,text),
  public.reply_to_competition_question(uuid,text),
  public.edit_competition_question_reply(uuid,text),
  public.set_competition_question_resolved(uuid,boolean) to authenticated;

alter publication supabase_realtime add table public.competition_questions;
alter publication supabase_realtime add table public.competition_question_replies;
commit;
begin;

create table public.competition_meetings (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  name text not null check (name = btrim(name) and length(name) between 3 and 100 and name !~ '[[:cntrl:]]'),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  jitsi_room_name text not null unique check (jitsi_room_name ~ '^Vertex[A-Fa-f0-9]{32}$'),
  starts_at timestamptz not null check (starts_at > '-infinity'::timestamptz and starts_at < 'infinity'::timestamptz),
  created_at timestamptz not null default now(),
  unique (id, competition_id),
  unique (competition_id, slug)
);
create unique index competition_meetings_name_unique on public.competition_meetings (competition_id, lower(name));
create index competition_meetings_schedule_idx on public.competition_meetings (competition_id, starts_at);
create index competition_meetings_creator_idx on public.competition_meetings (created_by);

create table public.meeting_participant_assignments (
  meeting_id uuid not null,
  competition_id uuid not null,
  participant_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (meeting_id, participant_id),
  foreign key (meeting_id, competition_id) references public.competition_meetings(id, competition_id) on delete cascade
);
create index meeting_participant_assignments_person_idx on public.meeting_participant_assignments (participant_id, meeting_id);
create index meeting_participant_assignments_comp_idx on public.meeting_participant_assignments (competition_id);

create table public.meeting_team_assignments (
  meeting_id uuid not null,
  competition_id uuid not null,
  team_id uuid not null,
  assigned_at timestamptz not null default now(),
  primary key (meeting_id, team_id),
  foreign key (meeting_id, competition_id) references public.competition_meetings(id, competition_id) on delete cascade,
  foreign key (team_id, competition_id) references public.competition_teams(id, competition_id) on delete cascade
);
create index meeting_team_assignments_team_idx on public.meeting_team_assignments (team_id, meeting_id);
create index meeting_team_assignments_comp_idx on public.meeting_team_assignments (competition_id);

create function public.can_access_competition_meeting(target_meeting_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.competition_meetings meeting
    where meeting.id = target_meeting_id and (
      public.can_manage_competition(meeting.competition_id)
      or exists (
        select 1 from public.meeting_participant_assignments assignment
        where assignment.meeting_id = meeting.id and assignment.participant_id = auth.uid()
          and (
            exists (select 1 from public.individual_registrations r
              where r.competition_id = meeting.competition_id and r.participant_id = auth.uid())
            or exists (select 1 from public.competition_team_members member
              join public.competition_teams team on team.id = member.team_id
              where member.competition_id = meeting.competition_id
                and member.participant_id = auth.uid() and team.registered_at is not null)
          )
      )
      or exists (
        select 1 from public.meeting_team_assignments assignment
        join public.competition_teams team on team.id = assignment.team_id and team.registered_at is not null
        join public.competition_team_members member on member.team_id = team.id
        where assignment.meeting_id = meeting.id and member.participant_id = auth.uid()
      )
    )
  );
$$;
revoke all on function public.can_access_competition_meeting(uuid) from public, anon;
grant execute on function public.can_access_competition_meeting(uuid) to authenticated;

alter table public.competition_meetings enable row level security;
alter table public.meeting_participant_assignments enable row level security;
alter table public.meeting_team_assignments enable row level security;
revoke all on public.competition_meetings, public.meeting_participant_assignments,
  public.meeting_team_assignments from public, anon, authenticated;
grant select on public.competition_meetings, public.meeting_participant_assignments,
  public.meeting_team_assignments to authenticated;
create policy competition_meetings_read on public.competition_meetings for select to authenticated
  using (public.can_access_competition_meeting(id));
create policy meeting_participant_assignments_manage_read on public.meeting_participant_assignments
  for select to authenticated using (public.can_manage_competition(competition_id));
create policy meeting_team_assignments_manage_read on public.meeting_team_assignments
  for select to authenticated using (public.can_manage_competition(competition_id));

alter table public.notifications add column meeting_id uuid
  references public.competition_meetings(id) on delete cascade;
create index notifications_meeting_idx on public.notifications (meeting_id) where meeting_id is not null;

create function public.search_meeting_assignables(target_competition_id uuid, search_term text default '', result_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  needle text := lower(regexp_replace(btrim(coalesce(search_term, '')), '^@', ''));
  capped integer := least(greatest(coalesce(result_limit, 20), 1), 30);
  people jsonb;
  teams jsonb;
begin
  if auth.uid() is null or not public.can_manage_competition(target_competition_id) then
    raise exception 'Only this competition’s organisers can search its roster.' using errcode = '42501';
  end if;
  if length(needle) > 100 then
    raise exception 'Search text is too long.' using errcode = '23514';
  end if;
  select coalesce(jsonb_agg(to_jsonb(person)), '[]'::jsonb) into people from (
    select profile.id, profile.full_name, profile.username::text as username
    from public.profiles profile
    where profile.account_type = 'participant'
      and (
        exists (select 1 from public.individual_registrations r
          where r.competition_id = target_competition_id and r.participant_id = profile.id)
        or exists (select 1 from public.competition_team_members member
          join public.competition_teams team on team.id = member.team_id and team.registered_at is not null
          where member.competition_id = target_competition_id and member.participant_id = profile.id)
      )
      and (needle = '' or lower(profile.full_name) like '%' || needle || '%'
        or lower(profile.username::text) like '%' || needle || '%')
    order by profile.full_name, profile.id limit capped
  ) person;
  select coalesce(jsonb_agg(to_jsonb(team_row)), '[]'::jsonb) into teams from (
    select team.id, team.name,
      (select count(*) from public.competition_team_members member where member.team_id = team.id) as member_count
    from public.competition_teams team
    where team.competition_id = target_competition_id and team.registered_at is not null
      and (needle = '' or lower(team.name) like '%' || needle || '%')
    order by team.name, team.id limit capped
  ) team_row;
  return jsonb_build_object('participants', people, 'teams', teams);
end;
$$;

create function public.create_competition_meeting(
  target_competition_id uuid, meeting_name text, meeting_starts_at timestamptz,
  participant_ids uuid[] default '{}'::uuid[], team_ids uuid[] default '{}'::uuid[]
)
returns public.competition_meetings language plpgsql security definer set search_path = public, pg_temp as $$
declare
  competition public.competitions;
  created public.competition_meetings;
  chosen_participants uuid[] := array(select distinct unnest(coalesce(participant_ids, '{}'::uuid[])));
  chosen_teams uuid[] := array(select distinct unnest(coalesce(team_ids, '{}'::uuid[])));
  base_slug text;
  valid_count integer;
begin
  if auth.uid() is null or not public.can_manage_competition(target_competition_id) then
    raise exception 'Only this competition’s organisers can create meetings.' using errcode = '42501';
  end if;
  select * into competition from public.competitions where id = target_competition_id for share;
  if competition.id is null or competition.status <> 'published' then
    raise exception 'Publish the competition before creating meetings.' using errcode = '23514';
  end if;
  if length(btrim(coalesce(meeting_name, ''))) not between 3 and 100
     or btrim(meeting_name) ~ '[[:cntrl:]]' then
    raise exception 'Enter a meeting name between 3 and 100 characters.' using errcode = '23514';
  end if;
  if exists (select 1 from public.competition_meetings m
      where m.competition_id = target_competition_id and lower(m.name) = lower(btrim(meeting_name))) then
    raise exception 'A meeting with this name already exists in the competition.' using errcode = '23505';
  end if;
  if meeting_starts_at is null or not isfinite(meeting_starts_at) then
    raise exception 'Choose a valid meeting start date and time.' using errcode = '23514';
  end if;
  if cardinality(chosen_participants) + cardinality(chosen_teams) = 0
     or cardinality(chosen_participants) + cardinality(chosen_teams) > 1000
     or array_position(chosen_participants, null) is not null
     or array_position(chosen_teams, null) is not null then
    raise exception 'Assign at least one registered participant or team.' using errcode = '23514';
  end if;
  select count(*) into valid_count from unnest(chosen_participants) requested(id)
  where exists (select 1 from public.profiles p where p.id = requested.id and p.account_type = 'participant')
    and (
      exists (select 1 from public.individual_registrations r
        where r.competition_id = target_competition_id and r.participant_id = requested.id)
      or exists (select 1 from public.competition_team_members member
        join public.competition_teams team on team.id = member.team_id and team.registered_at is not null
        where member.competition_id = target_competition_id and member.participant_id = requested.id)
    );
  if valid_count <> cardinality(chosen_participants) then
    raise exception 'Every selected participant must have a confirmed competition entry.' using errcode = '23514';
  end if;
  select count(*) into valid_count from unnest(chosen_teams) requested(id)
  where exists (select 1 from public.competition_teams team
    where team.id = requested.id and team.competition_id = target_competition_id and team.registered_at is not null);
  if valid_count <> cardinality(chosen_teams) then
    raise exception 'Every selected team must be registered for this competition.' using errcode = '23514';
  end if;
  base_slug := trim(both '-' from lower(regexp_replace(btrim(meeting_name), '[^a-zA-Z0-9]+', '-', 'g')));
  if base_slug = '' then base_slug := 'meeting'; end if;
  created.id := gen_random_uuid();
  insert into public.competition_meetings (id, competition_id, created_by, name, slug, jitsi_room_name, starts_at)
  values (created.id, competition.id, auth.uid(), btrim(meeting_name),
    trim(both '-' from left(base_slug, 75)) || '-' || left(replace(created.id::text, '-', ''), 8),
    'Vertex' || replace(gen_random_uuid()::text, '-', ''), meeting_starts_at)
  returning * into created;
  insert into public.meeting_participant_assignments (meeting_id, competition_id, participant_id)
    select created.id, competition.id, id from unnest(chosen_participants) id;
  insert into public.meeting_team_assignments (meeting_id, competition_id, team_id)
    select created.id, competition.id, id from unnest(chosen_teams) id;
  insert into public.notifications (recipient_id, competition_id, meeting_id, kind, title, body, link_path)
    select recipients.id, competition.id, created.id, 'meeting_assignment',
      'Meeting assigned: ' || left(created.name, 140),
      left('You are invited to ' || created.name || ' for ' || competition.name || '.', 1000),
      '/competition/' || competition.slug || '/meeting/' || created.slug
    from (
      select unnest(chosen_participants) as id
      union
      select member.participant_id from public.meeting_team_assignments assignment
        join public.competition_team_members member on member.team_id = assignment.team_id
        where assignment.meeting_id = created.id
    ) recipients;
  return created;
end;
$$;

revoke all on function public.search_meeting_assignables(uuid,text,integer),
  public.create_competition_meeting(uuid,text,timestamptz,uuid[],uuid[]) from public, anon;
grant execute on function public.search_meeting_assignables(uuid,text,integer),
  public.create_competition_meeting(uuid,text,timestamptz,uuid[],uuid[]) to authenticated;

alter publication supabase_realtime add table public.competition_meetings;
commit;
-- Per-round submission rules, atomic entry records, and private file access.
begin;

create table public.round_submission_configs (
  round_id uuid primary key references public.competition_rounds(id) on delete cascade,
  enabled boolean not null default false,
  mode text not null check (mode in ('file', 'link', 'mixed')),
  allowed_mime_types text[] not null default '{}',
  max_file_bytes bigint not null default 0 check (max_file_bytes between 0 and 26214400),
  instructions text not null default '' check (length(instructions) <= 5000),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  allow_edits boolean not null default true,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  check (opens_at < closes_at),
  check (isfinite(opens_at) and isfinite(closes_at)),
  check (cardinality(allowed_mime_types) <= 20),
  check ((mode = 'link' and cardinality(allowed_mime_types) = 0 and max_file_bytes = 0)
    or (mode in ('file', 'mixed') and cardinality(allowed_mime_types) > 0 and max_file_bytes between 1 and 26214400))
);
create index round_submission_configs_closes_idx on public.round_submission_configs (closes_at) where enabled;

create table public.round_submissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.competition_rounds(id) on delete cascade,
  participant_id uuid references public.profiles(id) on delete cascade,
  team_id uuid references public.competition_teams(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id),
  first_submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  check ((participant_id is null) <> (team_id is null))
);
create unique index round_submissions_person_unique on public.round_submissions (round_id, participant_id) where participant_id is not null;
create unique index round_submissions_team_unique on public.round_submissions (round_id, team_id) where team_id is not null;
create index round_submissions_round_date_idx on public.round_submissions (round_id, updated_at desc);
create index round_submissions_person_idx on public.round_submissions (participant_id) where participant_id is not null;
create index round_submissions_team_idx on public.round_submissions (team_id) where team_id is not null;
create index round_submissions_submitter_idx on public.round_submissions (submitted_by);

create table public.round_submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.round_submissions(id) on delete cascade,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  original_name text not null check (length(btrim(original_name)) between 1 and 255 and original_name !~ '[[:cntrl:]]'),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index round_submission_files_submission_idx on public.round_submission_files (submission_id);
create index round_submission_files_uploader_idx on public.round_submission_files (uploaded_by);

create table public.round_submission_links (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.round_submissions(id) on delete cascade,
  url text not null check (length(url) between 8 and 2048 and url ~ '^https?://[^[:space:]]+$'),
  created_at timestamptz not null default now()
);
create index round_submission_links_submission_idx on public.round_submission_links (submission_id);

create function public.can_view_round_submission_config(target_round_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.competition_rounds r join public.competitions c on c.id = r.competition_id
    where r.id = target_round_id and (
      public.can_manage_competition(c.id)
      or (c.status = 'published' and (
        exists (select 1 from public.individual_registrations i
          where i.competition_id = c.id and i.participant_id = auth.uid())
        or exists (select 1 from public.competition_team_members m
          join public.competition_teams t on t.id = m.team_id and t.registered_at is not null
          where m.competition_id = c.id and m.participant_id = auth.uid())
      ))
    )
  );
$$;

create function public.can_read_round_submission(target_submission_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.round_submissions s
    join public.competition_rounds r on r.id = s.round_id
    where s.id = target_submission_id and (
      public.can_manage_competition(r.competition_id)
      or s.participant_id = auth.uid()
      or exists (select 1 from public.competition_team_members m
        where m.team_id = s.team_id and m.participant_id = auth.uid())
    )
  );
$$;

create function public.can_upload_round_submission_file(object_name text, object_size bigint, object_mime text)
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
      or object_size is null or object_size < 1 or object_size > 26214400 or object_mime is null then
    return false;
  end if;
  target_round_id := round_text::uuid;
  return exists (
    select 1 from public.round_submission_configs cfg
    join public.competition_rounds r on r.id = cfg.round_id
    join public.competitions c on c.id = r.competition_id
    where cfg.round_id = target_round_id and cfg.enabled and cfg.mode in ('file','mixed')
      and c.status = 'published' and now() >= cfg.opens_at and now() < cfg.closes_at
      and object_size <= cfg.max_file_bytes and object_mime = any(cfg.allowed_mime_types)
      and (
        exists (select 1 from public.individual_registrations i
          where i.competition_id = c.id and i.participant_id = actor)
        or exists (select 1 from public.competition_teams t
          where t.competition_id = c.id and t.captain_id = actor and t.registered_at is not null)
      )
  );
end;
$$;

alter table public.round_submission_configs enable row level security;
alter table public.round_submissions enable row level security;
alter table public.round_submission_files enable row level security;
alter table public.round_submission_links enable row level security;
revoke all on public.round_submission_configs, public.round_submissions,
  public.round_submission_files, public.round_submission_links from public, anon, authenticated;
grant select on public.round_submission_configs, public.round_submissions,
  public.round_submission_files, public.round_submission_links to authenticated;
create policy round_submission_configs_read on public.round_submission_configs for select to authenticated
  using (public.can_view_round_submission_config(round_id));
create policy round_submissions_read on public.round_submissions for select to authenticated
  using (public.can_read_round_submission(id));
create policy round_submission_files_read on public.round_submission_files for select to authenticated
  using (public.can_read_round_submission(submission_id));
create policy round_submission_links_read on public.round_submission_links for select to authenticated
  using (public.can_read_round_submission(submission_id));

revoke all on function public.can_view_round_submission_config(uuid),
  public.can_read_round_submission(uuid),
  public.can_upload_round_submission_file(text,bigint,text) from public, anon;
grant execute on function public.can_view_round_submission_config(uuid),
  public.can_read_round_submission(uuid),
  public.can_upload_round_submission_file(text,bigint,text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 26214400, null)
on conflict (id) do update set public = false, file_size_limit = 26214400, allowed_mime_types = null;
create policy submissions_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'submissions' and owner_id = (select auth.uid())::text
  and public.can_upload_round_submission_file(name, (metadata->>'size')::bigint, metadata->>'mimetype')
);
create policy submissions_select on storage.objects for select to authenticated using (
  bucket_id = 'submissions' and (
    (owner_id = (select auth.uid())::text and split_part(name, '/', 2) = (select auth.uid())::text)
    or exists (select 1 from public.round_submission_files f
      where f.storage_path = storage.objects.name and public.can_read_round_submission(f.submission_id))
  )
);
create policy submissions_delete_unreferenced on storage.objects for delete to authenticated using (
  bucket_id = 'submissions' and owner_id = (select auth.uid())::text
  and split_part(name, '/', 2) = (select auth.uid())::text
  and not exists (select 1 from public.round_submission_files f where f.storage_path = storage.objects.name)
);

create function public.save_round_submission_config(
  target_round_id uuid, submission_enabled boolean, submission_mode text,
  mime_types text[], file_limit_bytes bigint, submission_instructions text,
  submission_opens_at timestamptz, submission_closes_at timestamptz, edits_allowed boolean
)
returns public.round_submission_configs language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.competition_rounds;
  old_config public.round_submission_configs;
  saved public.round_submission_configs;
  cleaned_mimes text[] := array(select distinct lower(btrim(v)) from unnest(coalesce(mime_types, '{}'::text[])) v where btrim(v) <> '' order by 1);
begin
  select * into r from public.competition_rounds where id = target_round_id for share;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can configure round submissions.' using errcode = '42501';
  end if;
  if submission_mode not in ('file','link','mixed') or submission_mode is null then
    raise exception 'Choose files, links, or both.' using errcode = '23514';
  end if;
  if submission_opens_at is null or submission_closes_at is null
      or not isfinite(submission_opens_at) or not isfinite(submission_closes_at)
      or submission_opens_at < r.opens_at or submission_closes_at > r.submission_deadline
      or submission_opens_at >= submission_closes_at then
    raise exception 'Submission dates must fit inside the round opening and deadline.' using errcode = '23514';
  end if;
  if length(coalesce(submission_instructions, '')) > 5000 then
    raise exception 'Instructions must be at most 5000 characters.' using errcode = '23514';
  end if;
  if submission_mode = 'link' then
    cleaned_mimes := '{}'::text[];
    file_limit_bytes := 0;
  elsif file_limit_bytes is null or file_limit_bytes < 1 or file_limit_bytes > 26214400
      or cardinality(cleaned_mimes) not between 1 and 20
      or exists (select 1 from unnest(cleaned_mimes) m
        where m !~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$') then
    raise exception 'Set 1–20 valid MIME types and a file limit no higher than 25 MB.' using errcode = '23514';
  end if;
  select * into old_config from public.round_submission_configs where round_id = r.id for update;
  if old_config.round_id is not null and exists (
    select 1 from public.round_submissions s where s.round_id = r.id
  ) and (old_config.mode <> submission_mode or old_config.allowed_mime_types <> cleaned_mimes
      or old_config.max_file_bytes <> file_limit_bytes or old_config.opens_at <> submission_opens_at
      or submission_closes_at < old_config.closes_at) then
    raise exception 'Submitted work locks format, file rules, and opening time. You may extend the close time.' using errcode = '23514';
  end if;
  insert into public.round_submission_configs
    (round_id, enabled, mode, allowed_mime_types, max_file_bytes, instructions, opens_at, closes_at, allow_edits, updated_by)
  values (r.id, coalesce(submission_enabled,false), submission_mode, cleaned_mimes, file_limit_bytes,
    coalesce(submission_instructions,''), submission_opens_at, submission_closes_at, coalesce(edits_allowed,true), auth.uid())
  on conflict (round_id) do update set enabled = excluded.enabled, mode = excluded.mode,
    allowed_mime_types = excluded.allowed_mime_types, max_file_bytes = excluded.max_file_bytes,
    instructions = excluded.instructions, opens_at = excluded.opens_at, closes_at = excluded.closes_at,
    allow_edits = excluded.allow_edits, updated_by = excluded.updated_by, updated_at = now()
  returning * into saved;
  return saved;
end;
$$;

create function public.save_round_submission(
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

create function public.organiser_round_submission_review(
  target_round_id uuid, search_term text default '', status_filter text default 'all',
  entry_filter text default 'all', result_page integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  comp_id uuid;
  needle text := lower(btrim(coalesce(search_term,'')));
  page_number integer := least(greatest(coalesce(result_page,0),0),100000);
  total integer;
  rows jsonb;
begin
  select competition_id into comp_id from public.competition_rounds where id = target_round_id;
  if auth.uid() is null or comp_id is null or not public.can_manage_competition(comp_id) then
    raise exception 'Only competition organisers can review submissions.' using errcode = '42501';
  end if;
  if length(needle) > 100 or status_filter not in ('all','valid','late','missing')
      or entry_filter not in ('all','individual','team') then
    raise exception 'Invalid review filter.' using errcode = '23514';
  end if;
  with entries as (
    select 'individual'::text as entry_type, i.participant_id, null::uuid as team_id,
      p.full_name as name, p.username::text as username, i.created_at as registered_at
    from public.individual_registrations i join public.profiles p on p.id = i.participant_id
    where i.competition_id = comp_id
    union all
    select 'team', null::uuid, t.id, t.name, null::text, t.registered_at
    from public.competition_teams t where t.competition_id = comp_id and t.registered_at is not null
  ), joined as (
    select e.*, s.id as submission_id, s.first_submitted_at, s.updated_at,
      case when s.id is null then 'missing'
        when s.first_submitted_at >= cfg.closes_at then 'late' else 'valid' end as status
    from entries e left join public.round_submissions s on s.round_id = target_round_id
      and ((e.entry_type = 'individual' and s.participant_id = e.participant_id)
        or (e.entry_type = 'team' and s.team_id = e.team_id))
    left join public.round_submission_configs cfg on cfg.round_id = target_round_id
  )
  select count(*) into total from joined j
  where (needle = '' or lower(j.name) like '%' || needle || '%' or lower(coalesce(j.username,'')) like '%' || needle || '%')
    and (status_filter = 'all' or j.status = status_filter)
    and (entry_filter = 'all' or j.entry_type = entry_filter);
  with entries as (
    select 'individual'::text as entry_type, i.participant_id, null::uuid as team_id,
      p.full_name as name, p.username::text as username, i.created_at as registered_at
    from public.individual_registrations i join public.profiles p on p.id = i.participant_id
    where i.competition_id = comp_id
    union all
    select 'team', null::uuid, t.id, t.name, null::text, t.registered_at
    from public.competition_teams t where t.competition_id = comp_id and t.registered_at is not null
  ), joined as (
    select e.*, s.id as submission_id, s.first_submitted_at, s.updated_at,
      case when s.id is null then 'missing'
        when s.first_submitted_at >= cfg.closes_at then 'late' else 'valid' end as status
    from entries e left join public.round_submissions s on s.round_id = target_round_id
      and ((e.entry_type = 'individual' and s.participant_id = e.participant_id)
        or (e.entry_type = 'team' and s.team_id = e.team_id))
    left join public.round_submission_configs cfg on cfg.round_id = target_round_id
  )
  select coalesce(jsonb_agg(to_jsonb(item)), '[]'::jsonb) into rows from (
    select j.*,
      (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'path',f.storage_path,'name',f.original_name,
        'mime_type',f.mime_type,'size_bytes',f.size_bytes) order by f.created_at,f.id), '[]'::jsonb)
        from public.round_submission_files f where f.submission_id = j.submission_id) as files,
      (select coalesce(jsonb_agg(l.url order by l.created_at,l.id), '[]'::jsonb)
        from public.round_submission_links l where l.submission_id = j.submission_id) as links
    from joined j
    where (needle = '' or lower(j.name) like '%' || needle || '%' or lower(coalesce(j.username,'')) like '%' || needle || '%')
      and (status_filter = 'all' or j.status = status_filter)
      and (entry_filter = 'all' or j.entry_type = entry_filter)
    order by lower(j.name), j.participant_id nulls last, j.team_id nulls last
    limit 25 offset page_number * 25
  ) item;
  return jsonb_build_object('entries',rows,'total',total,'page',page_number);
end;
$$;

revoke all on function public.save_round_submission_config(uuid,boolean,text,text[],bigint,text,timestamptz,timestamptz,boolean),
  public.save_round_submission(uuid,uuid,jsonb,text[],integer),
  public.organiser_round_submission_review(uuid,text,text,text,integer) from public, anon;
grant execute on function public.save_round_submission_config(uuid,boolean,text,text[],bigint,text,timestamptz,timestamptz,boolean),
  public.save_round_submission(uuid,uuid,jsonb,text[],integer),
  public.organiser_round_submission_review(uuid,text,text,text,integer) to authenticated;

commit;

-- Storage creates the object row before its final size and MIME metadata are set.
-- Check values when present at upload; final submission RPC always verifies stored metadata.
begin;
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
      and c.status = 'published' and now() >= cfg.opens_at and now() < cfg.closes_at
      and (object_size is null or object_size <= cfg.max_file_bytes)
      and (object_mime is null or object_mime = any(cfg.allowed_mime_types))
      and (
        exists (select 1 from public.individual_registrations i
          where i.competition_id = c.id and i.participant_id = actor)
        or exists (select 1 from public.competition_teams t
          where t.competition_id = c.id and t.captain_id = actor and t.registered_at is not null)
      )
  );
end;
$$;
commit;

-- Cover the submission-rule editor foreign key for profile deletion and joins.
create index round_submission_configs_updated_by_idx
  on public.round_submission_configs (updated_by);

-- Milestone 14: scoring criteria and controlled score entry.

-- Milestone 14: round criteria, authoritative marks, and controlled visibility.
begin;

create table public.round_scoring_settings (
  round_id uuid primary key references public.competition_rounds(id) on delete cascade,
  show_scores_public boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index round_scoring_settings_editor_idx on public.round_scoring_settings(updated_by);

create table public.round_scoring_criteria (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.competition_rounds(id) on delete cascade,
  name text not null check (name = btrim(name) and length(name) between 2 and 100 and name !~ '[[:cntrl:]]'),
  description text not null default '' check (length(description) <= 1000 and description !~ '[[:cntrl:]]'),
  max_marks numeric(8,2) not null check (max_marks > 0 and max_marks <= 100000),
  position integer not null check (position between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, round_id),
  unique (round_id, position) deferrable initially deferred
);
create unique index round_scoring_criteria_name_idx on public.round_scoring_criteria(round_id, lower(name));

create table public.round_scores (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null,
  criterion_id uuid not null,
  participant_id uuid references public.profiles(id) on delete cascade,
  team_id uuid references public.competition_teams(id) on delete cascade,
  marks numeric(8,2) not null check (marks >= 0),
  entered_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (criterion_id, round_id) references public.round_scoring_criteria(id, round_id) on delete cascade,
  check ((participant_id is null) <> (team_id is null))
);
create unique index round_scores_individual_unique on public.round_scores(criterion_id, participant_id) where participant_id is not null;
create unique index round_scores_team_unique on public.round_scores(criterion_id, team_id) where team_id is not null;
create index round_scores_round_entry_idx on public.round_scores(round_id, participant_id, team_id);
create index round_scores_team_idx on public.round_scores(team_id) where team_id is not null;
create index round_scores_entered_by_idx on public.round_scores(entered_by);

alter table public.round_scoring_settings enable row level security;
alter table public.round_scoring_criteria enable row level security;
alter table public.round_scores enable row level security;
revoke all on public.round_scoring_settings, public.round_scoring_criteria, public.round_scores from public, anon, authenticated;
grant select on public.round_scoring_settings, public.round_scoring_criteria, public.round_scores to authenticated;
create policy round_scoring_settings_read on public.round_scoring_settings for select to authenticated
  using (public.can_manage_competition((select competition_id from public.competition_rounds where id = round_id)));
create policy round_scoring_criteria_read on public.round_scoring_criteria for select to authenticated
  using (public.can_manage_competition((select competition_id from public.competition_rounds where id = round_id)));
create policy round_scores_read on public.round_scores for select to authenticated
  using (public.can_manage_competition((select competition_id from public.competition_rounds where id = round_id)));

create function public.save_scoring_criterion(target_round_id uuid, target_criterion_id uuid,
  criterion_name text, criterion_max numeric, criterion_description text default '')
returns public.round_scoring_criteria language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.competition_rounds; saved public.round_scoring_criteria; clean_name text := btrim(coalesce(criterion_name,''));
  clean_description text := btrim(coalesce(criterion_description,''));
begin
  select * into r from public.competition_rounds where id = target_round_id for update;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can edit scoring.' using errcode = '42501';
  end if;
  if r.leaderboard_state <> 'unpublished' or r.judging_state = 'finalised' then
    raise exception 'Scoring is locked after results are finalised.' using errcode = '23514';
  end if;
  if length(clean_name) not between 2 and 100 or clean_name ~ '[[:cntrl:]]'
      or length(clean_description) > 1000 or clean_description ~ '[[:cntrl:]]'
      or criterion_max is null or criterion_max <= 0 or criterion_max > 100000
      or criterion_max <> round(criterion_max,2) then
    raise exception 'Use a name, up to 1000 description characters, and a maximum from 0.01 to 100000 with at most two decimals.' using errcode = '23514';
  end if;
  if target_criterion_id is null then
    insert into public.round_scoring_criteria(round_id,name,max_marks,description,position)
    values (r.id,clean_name,criterion_max,clean_description,
      (select coalesce(max(position),0)+1 from public.round_scoring_criteria where round_id = r.id)) returning * into saved;
  else
    if exists (select 1 from public.round_scores where criterion_id = target_criterion_id and marks > criterion_max) then
      raise exception 'Existing marks exceed this maximum. Edit those scores first.' using errcode = '23514';
    end if;
    update public.round_scoring_criteria set name = clean_name, max_marks = criterion_max,
      description = clean_description, updated_at = now()
    where id = target_criterion_id and round_id = r.id returning * into saved;
    if saved.id is null then raise exception 'Criterion not found in this round.' using errcode = '23514'; end if;
  end if;
  return saved;
end;
$$;

create function public.move_scoring_criterion(target_criterion_id uuid, direction integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare item public.round_scoring_criteria; neighbour public.round_scoring_criteria; r public.competition_rounds;
begin
  select * into item from public.round_scoring_criteria where id = target_criterion_id;
  if item.id is null then raise exception 'Criterion not found.' using errcode = '23514'; end if;
  select * into r from public.competition_rounds where id = item.round_id for update;
  if auth.uid() is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can reorder scoring.' using errcode = '42501';
  end if;
  if r.leaderboard_state <> 'unpublished' or r.judging_state = 'finalised' then
    raise exception 'Scoring is locked after results are finalised.' using errcode = '23514';
  end if;
  if direction not in (-1,1) then raise exception 'Invalid order change.' using errcode = '23514'; end if;
  select * into neighbour from public.round_scoring_criteria
    where round_id = item.round_id and position = item.position + direction;
  if neighbour.id is null then return; end if;
  update public.round_scoring_criteria set position = case when id = item.id then neighbour.position else item.position end,
    updated_at = now() where id in (item.id, neighbour.id);
end;
$$;

create function public.delete_scoring_criterion(target_criterion_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare item public.round_scoring_criteria; r public.competition_rounds;
begin
  select * into item from public.round_scoring_criteria where id = target_criterion_id;
  if item.id is null then raise exception 'Criterion not found.' using errcode = '23514'; end if;
  select * into r from public.competition_rounds where id = item.round_id for update;
  if auth.uid() is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can delete scoring criteria.' using errcode = '42501';
  end if;
  if r.leaderboard_state <> 'unpublished' or r.judging_state = 'finalised' then
    raise exception 'Scoring is locked after results are finalised.' using errcode = '23514';
  end if;
  if exists (select 1 from public.round_scores where criterion_id = item.id) then
    raise exception 'Clear marks for this criterion before deleting it.' using errcode = '23514';
  end if;
  delete from public.round_scoring_criteria where id = item.id;
  update public.round_scoring_criteria set position = position - 1, updated_at = now()
    where round_id = item.round_id and position > item.position;
end;
$$;

create function public.save_round_scores(target_round_id uuid, target_participant_id uuid,
  target_team_id uuid, score_items jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.competition_rounds; item jsonb; criterion public.round_scoring_criteria;
  entered numeric; seen uuid[] := '{}'; criterion_id uuid;
begin
  select * into r from public.competition_rounds where id = target_round_id for update;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can enter scores.' using errcode = '42501';
  end if;
  if r.leaderboard_state <> 'unpublished' or r.judging_state = 'finalised' then
    raise exception 'Scores are locked after results are finalised.' using errcode = '23514';
  end if;
  if (target_participant_id is null) = (target_team_id is null) then
    raise exception 'Choose one individual or team entry.' using errcode = '23514';
  end if;
  if target_participant_id is not null and not exists (
    select 1 from public.individual_registrations where competition_id = r.competition_id and participant_id = target_participant_id
  ) or target_team_id is not null and not exists (
    select 1 from public.competition_teams where competition_id = r.competition_id and id = target_team_id and registered_at is not null
  ) then raise exception 'Entry is not registered for this competition.' using errcode = '23514'; end if;
  if jsonb_typeof(score_items) <> 'array' or jsonb_array_length(score_items) > 100 then
    raise exception 'Scores must be a list of criteria.' using errcode = '23514';
  end if;
  for item in select value from jsonb_array_elements(score_items) loop
    begin criterion_id := (item->>'criterion_id')::uuid; exception when others then
      raise exception 'Invalid criterion.' using errcode = '23514'; end;
    if criterion_id = any(seen) then raise exception 'Criterion repeated.' using errcode = '23514'; end if;
    seen := array_append(seen,criterion_id);
    select * into criterion from public.round_scoring_criteria where id = criterion_id and round_id = r.id;
    if criterion.id is null then raise exception 'Criterion does not belong to this round.' using errcode = '23514'; end if;
    if item->'marks' is null or item->'marks' = 'null'::jsonb then
      delete from public.round_scores where criterion_id = criterion.id
        and ((target_participant_id is not null and participant_id = target_participant_id)
          or (target_team_id is not null and team_id = target_team_id));
    else
      begin entered := (item->>'marks')::numeric; exception when others then
        raise exception 'Marks must be numeric.' using errcode = '23514'; end;
      if entered < 0 or entered > criterion.max_marks or entered <> round(entered,2) then
        raise exception 'Marks for % must be between 0 and %, with at most two decimals.', criterion.name, criterion.max_marks using errcode = '23514';
      end if;
      if target_participant_id is not null then
        insert into public.round_scores(round_id,criterion_id,participant_id,marks,entered_by)
        values (r.id,criterion.id,target_participant_id,entered,auth.uid())
        on conflict (criterion_id,participant_id) where participant_id is not null
        do update set marks = excluded.marks, entered_by = excluded.entered_by, updated_at = now();
      else
        insert into public.round_scores(round_id,criterion_id,team_id,marks,entered_by)
        values (r.id,criterion.id,target_team_id,entered,auth.uid())
        on conflict (criterion_id,team_id) where team_id is not null
        do update set marks = excluded.marks, entered_by = excluded.entered_by, updated_at = now();
      end if;
    end if;
  end loop;
end;
$$;

create function public.set_round_score_visibility(target_round_id uuid, visible boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.competition_rounds;
begin
  select * into r from public.competition_rounds where id = target_round_id for update;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can change score visibility.' using errcode = '42501';
  end if;
  if visible is null then raise exception 'Choose whether scores are public.' using errcode = '23514'; end if;
  insert into public.round_scoring_settings(round_id,show_scores_public,updated_by)
    values (r.id,visible,auth.uid())
  on conflict (round_id) do update set show_scores_public = excluded.show_scores_public,
    updated_by = excluded.updated_by, updated_at = now();
end;
$$;

create function public.round_scoring_roster(target_round_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.competition_rounds; criteria jsonb; entries jsonb; total_max numeric;
begin
  select * into r from public.competition_rounds where id = target_round_id;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can view scoring.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,
    'max_marks',max_marks,'position',position) order by position),'[]'::jsonb), coalesce(sum(max_marks),0)
    into criteria,total_max from public.round_scoring_criteria where round_id = r.id;
  with roster as (
    select 'individual'::text as entry_type, i.participant_id, null::uuid as team_id,
      p.full_name as name, p.username::text as username
    from public.individual_registrations i join public.profiles p on p.id = i.participant_id
    where i.competition_id = r.competition_id
    union all
    select 'team', null::uuid, t.id, t.name, null::text
    from public.competition_teams t where t.competition_id = r.competition_id and t.registered_at is not null
  ), scored as (
    select e.*,
      coalesce((select sum(s.marks) from public.round_scores s where s.round_id = r.id
        and ((e.participant_id is not null and s.participant_id = e.participant_id)
          or (e.team_id is not null and s.team_id = e.team_id))),0) as total,
      (select count(*) from public.round_scores s where s.round_id = r.id
        and ((e.participant_id is not null and s.participant_id = e.participant_id)
          or (e.team_id is not null and s.team_id = e.team_id))) as scored_count,
      (select coalesce(jsonb_object_agg(s.criterion_id::text,s.marks),'{}'::jsonb)
        from public.round_scores s where s.round_id = r.id
        and ((e.participant_id is not null and s.participant_id = e.participant_id)
          or (e.team_id is not null and s.team_id = e.team_id))) as marks
    from roster e
  )
  select coalesce(jsonb_agg(jsonb_build_object('entry_type',entry_type,'participant_id',participant_id,
    'team_id',team_id,'name',name,'username',username,'total',total,
    'scored_count',scored_count,'marks',marks)
    order by (scored_count = jsonb_array_length(criteria)) desc, total desc, lower(name)), '[]'::jsonb)
    into entries from scored;
  return jsonb_build_object('criteria',criteria,'entries',entries,'max_total',total_max,
    'show_scores_public',coalesce((select show_scores_public from public.round_scoring_settings where round_id = r.id),false),
    'locked',r.leaderboard_state <> 'unpublished' or r.judging_state = 'finalised');
end;
$$;

create function public.public_round_scores(target_round_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.competition_rounds; criteria_count integer; max_total numeric; entries jsonb;
begin
  select * into r from public.competition_rounds where id = target_round_id;
  if r.id is null or not exists (select 1 from public.competitions c where c.id = r.competition_id and c.status = 'published') then
    raise exception 'Round not found.' using errcode = '23514';
  end if;
  if not coalesce((select show_scores_public from public.round_scoring_settings where round_id = r.id),false) then
    raise exception 'Scores are private for this round.' using errcode = '42501';
  end if;
  select count(*),coalesce(sum(max_marks),0) into criteria_count,max_total
    from public.round_scoring_criteria where round_id = r.id;
  with roster as (
    select 'individual'::text as entry_type, i.participant_id, null::uuid as team_id,
      p.full_name as name, p.username::text as username
    from public.individual_registrations i join public.profiles p on p.id = i.participant_id
    where i.competition_id = r.competition_id
    union all
    select 'team', null::uuid, t.id, t.name, null::text
    from public.competition_teams t where t.competition_id = r.competition_id and t.registered_at is not null
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

revoke all on function public.save_scoring_criterion(uuid,uuid,text,numeric,text),
  public.move_scoring_criterion(uuid,integer), public.delete_scoring_criterion(uuid),
  public.save_round_scores(uuid,uuid,uuid,jsonb),public.set_round_score_visibility(uuid,boolean),
  public.round_scoring_roster(uuid),public.public_round_scores(uuid) from public, anon;
grant execute on function public.save_scoring_criterion(uuid,uuid,text,numeric,text),
  public.move_scoring_criterion(uuid,integer), public.delete_scoring_criterion(uuid),
  public.save_round_scores(uuid,uuid,uuid,jsonb),public.set_round_score_visibility(uuid,boolean),
  public.round_scoring_roster(uuid) to authenticated;
grant execute on function public.public_round_scores(uuid) to anon,authenticated;

commit;


-- Milestone 14 correction: disambiguate score criterion variable.

-- Correct PL/pgSQL variable collision found in browser scoring flow.
begin;
create or replace function public.save_round_scores(target_round_id uuid, target_participant_id uuid,
  target_team_id uuid, score_items jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.competition_rounds; item jsonb; criterion public.round_scoring_criteria;
  entered numeric; seen uuid[] := '{}'; requested_criterion_id uuid;
begin
  select * into r from public.competition_rounds where id = target_round_id for update;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can enter scores.' using errcode = '42501';
  end if;
  if r.leaderboard_state <> 'unpublished' or r.judging_state = 'finalised' then
    raise exception 'Scores are locked after results are finalised.' using errcode = '23514';
  end if;
  if (target_participant_id is null) = (target_team_id is null) then
    raise exception 'Choose one individual or team entry.' using errcode = '23514';
  end if;
  if target_participant_id is not null and not exists (
    select 1 from public.individual_registrations where competition_id = r.competition_id and participant_id = target_participant_id
  ) or target_team_id is not null and not exists (
    select 1 from public.competition_teams where competition_id = r.competition_id and id = target_team_id and registered_at is not null
  ) then raise exception 'Entry is not registered for this competition.' using errcode = '23514'; end if;
  if jsonb_typeof(score_items) <> 'array' or jsonb_array_length(score_items) > 100 then
    raise exception 'Scores must be a list of criteria.' using errcode = '23514';
  end if;
  for item in select value from jsonb_array_elements(score_items) loop
    begin requested_criterion_id := (item->>'criterion_id')::uuid; exception when others then
      raise exception 'Invalid criterion.' using errcode = '23514'; end;
    if requested_criterion_id = any(seen) then raise exception 'Criterion repeated.' using errcode = '23514'; end if;
    seen := array_append(seen,requested_criterion_id);
    select * into criterion from public.round_scoring_criteria where id = requested_criterion_id and round_id = r.id;
    if criterion.id is null then raise exception 'Criterion does not belong to this round.' using errcode = '23514'; end if;
    if item->'marks' is null or item->'marks' = 'null'::jsonb then
      delete from public.round_scores where criterion_id = criterion.id
        and ((target_participant_id is not null and participant_id = target_participant_id)
          or (target_team_id is not null and team_id = target_team_id));
    else
      begin entered := (item->>'marks')::numeric; exception when others then
        raise exception 'Marks must be numeric.' using errcode = '23514'; end;
      if entered < 0 or entered > criterion.max_marks or entered <> round(entered,2) then
        raise exception 'Marks for % must be between 0 and %, with at most two decimals.', criterion.name, criterion.max_marks using errcode = '23514';
      end if;
      if target_participant_id is not null then
        insert into public.round_scores(round_id,criterion_id,participant_id,marks,entered_by)
        values (r.id,criterion.id,target_participant_id,entered,auth.uid())
        on conflict (criterion_id,participant_id) where participant_id is not null
        do update set marks = excluded.marks, entered_by = excluded.entered_by, updated_at = now();
      else
        insert into public.round_scores(round_id,criterion_id,team_id,marks,entered_by)
        values (r.id,criterion.id,target_team_id,entered,auth.uid())
        on conflict (criterion_id,team_id) where team_id is not null
        do update set marks = excluded.marks, entered_by = excluded.entered_by, updated_at = now();
      end if;
    end if;
  end loop;
end;
$$;
commit;


-- Milestone 14 correction: cover scoring foreign keys.

-- Cover score foreign keys used by criterion edits and participant removal.
begin;
create index round_scores_criterion_round_idx on public.round_scores(criterion_id,round_id);
create index round_scores_participant_idx on public.round_scores(participant_id) where participant_id is not null;
commit;

-- Milestone 15: authoritative round advancement and exact cutoff decisions.
begin;

create table public.round_advancement_decisions (
  round_id uuid primary key references public.competition_rounds(id) on delete cascade,
  mode text not null check (mode in ('unresolved','automatic','include_all','exclude_all','manual')),
  boundary_score numeric(10,2),
  boundary_ids uuid[] not null default '{}',
  selected_ids uuid[] not null default '{}',
  entry_count integer not null default 0,
  cutoff_count integer not null default 0,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  finalised_by uuid references public.profiles(id) on delete set null,
  finalised_at timestamptz,
  check (finalised_at is null or mode <> 'unresolved')
);
create index round_advancement_decisions_decider_idx on public.round_advancement_decisions(decided_by);
create index round_advancement_decisions_finaliser_idx on public.round_advancement_decisions(finalised_by);

create table public.round_advancement_records (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.competition_rounds(id) on delete cascade,
  participant_id uuid references public.profiles(id) on delete cascade,
  team_id uuid references public.competition_teams(id) on delete cascade,
  rank integer not null check (rank > 0),
  total numeric(12,2) not null check (total >= 0),
  status text not null check (status in ('advanced','winner','eliminated')),
  tags text[] not null default '{}',
  finalised_at timestamptz not null default now(),
  check ((participant_id is null) <> (team_id is null))
);
create unique index round_advancement_person_unique on public.round_advancement_records(round_id,participant_id) where participant_id is not null;
create unique index round_advancement_team_unique on public.round_advancement_records(round_id,team_id) where team_id is not null;
create index round_advancement_person_idx on public.round_advancement_records(participant_id) where participant_id is not null;
create index round_advancement_team_idx on public.round_advancement_records(team_id) where team_id is not null;
create index round_advancement_status_idx on public.round_advancement_records(round_id,status);

create table public.round_participant_eligibility (
  round_id uuid not null references public.competition_rounds(id) on delete cascade,
  participant_id uuid not null references public.profiles(id) on delete cascade,
  source_team_id uuid references public.competition_teams(id) on delete cascade,
  status text not null check (status in ('advanced','winner','eliminated')),
  tags text[] not null default '{}',
  finalised_at timestamptz not null default now(),
  primary key(round_id,participant_id)
);
create index round_participant_eligibility_person_idx on public.round_participant_eligibility(participant_id,round_id);
create index round_participant_eligibility_team_idx on public.round_participant_eligibility(source_team_id) where source_team_id is not null;

alter table public.round_advancement_decisions enable row level security;
alter table public.round_advancement_records enable row level security;
alter table public.round_participant_eligibility enable row level security;
revoke all on public.round_advancement_decisions, public.round_advancement_records,
  public.round_participant_eligibility from public,anon,authenticated;
grant select on public.round_advancement_decisions, public.round_advancement_records,
  public.round_participant_eligibility to authenticated;
create policy advancement_decisions_manager_read on public.round_advancement_decisions for select to authenticated
  using (public.can_manage_competition((select competition_id from public.competition_rounds where id=round_id)));
create policy advancement_records_read on public.round_advancement_records for select to authenticated
  using (public.can_manage_competition((select competition_id from public.competition_rounds where id=round_id))
    or participant_id=(select auth.uid())
    or exists(select 1 from public.competition_team_members m where m.team_id=round_advancement_records.team_id and m.participant_id=(select auth.uid())));
create policy advancement_eligibility_read on public.round_participant_eligibility for select to authenticated
  using (participant_id=(select auth.uid())
    or public.can_manage_competition((select competition_id from public.competition_rounds where id=round_id)));

-- Only prior finalised advancement activates a later round entry.
create function public.round_entry_eligible(target_round_id uuid, target_participant_id uuid, target_team_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists (
    select 1 from public.competition_rounds r where r.id=target_round_id
      and ((target_participant_id is not null and target_team_id is null and exists (
        select 1 from public.individual_registrations i
        where i.competition_id=r.competition_id and i.participant_id=target_participant_id))
        or (target_team_id is not null and target_participant_id is null and exists (
          select 1 from public.competition_teams t
          where t.competition_id=r.competition_id and t.id=target_team_id and t.registered_at is not null)))
      and (r.sequence=1 or exists (
        select 1 from public.competition_rounds previous
        join public.round_advancement_decisions d on d.round_id=previous.id and d.finalised_at is not null
        join public.round_advancement_records record on record.round_id=previous.id and record.status='advanced'
        where previous.competition_id=r.competition_id and previous.sequence=r.sequence-1
          and ((target_participant_id is not null and record.participant_id=target_participant_id)
            or (target_team_id is not null and record.team_id=target_team_id))))
  );
$$;
revoke all on function public.round_entry_eligible(uuid,uuid,uuid) from public,anon,authenticated;

-- Internal ranking returns every active entry, including incomplete ones.
create function vertex_private.round_ranking(target_round_id uuid)
returns table(entry_type text, participant_id uuid, team_id uuid, name text, username text,
  total numeric, scored_count bigint, rank bigint, boundary boolean, provisional text)
language sql stable security definer set search_path=public,pg_temp as $$
  with round_info as (select * from public.competition_rounds where id=target_round_id),
  criteria as (select count(*) as n from public.round_scoring_criteria where round_id=target_round_id),
  roster as (
    select 'individual'::text entry_type,i.participant_id,null::uuid team_id,p.full_name name,p.username::text username
    from round_info r join public.individual_registrations i on i.competition_id=r.competition_id
      join public.profiles p on p.id=i.participant_id
    where public.round_entry_eligible(r.id,i.participant_id,null)
    union all
    select 'team'::text,null::uuid,t.id,t.name,null::text
    from round_info r join public.competition_teams t on t.competition_id=r.competition_id and t.registered_at is not null
    where public.round_entry_eligible(r.id,null,t.id)
  ), totals as (
    select e.entry_type,e.participant_id,e.team_id,e.name,e.username,
      coalesce(sum(s.marks),0)::numeric total,count(s.id) scored_count
    from roster e left join public.round_scores s on s.round_id=target_round_id
      and ((e.participant_id is not null and s.participant_id=e.participant_id)
        or (e.team_id is not null and s.team_id=e.team_id))
    group by e.entry_type,e.participant_id,e.team_id,e.name,e.username
  ), complete as (
    select t.*,rank() over(order by t.total desc) place
    from totals t cross join criteria c where c.n>0 and t.scored_count=c.n
  ), cutoff as (
    select (select v.total from complete v order by v.total desc,v.name
      offset greatest(r.advancement_count-1,0) limit 1) value,
      r.advancement_count quota from round_info r
  ), boundary_stats as (
    select cutoff.value,cutoff.quota,
      count(*) filter(where complete.total>cutoff.value) above_count,
      count(*) filter(where complete.total=cutoff.value) tied_count
    from cutoff left join complete on true group by cutoff.value,cutoff.quota
  )
  select t.entry_type,t.participant_id,t.team_id,t.name,t.username,t.total,t.scored_count,
    c.place,
    (c.place is not null and b.value is not null and b.above_count<b.quota
      and b.above_count+b.tied_count>b.quota and t.total=b.value) boundary,
    case when c.place is null then 'incomplete'
      when b.value is null or t.total>b.value then 'advance'
      when t.total<b.value then 'eliminate'
      when b.above_count+b.tied_count>b.quota then 'unresolved'
      else 'advance' end provisional
  from totals t left join complete c on c.entry_type=t.entry_type
    and c.participant_id is not distinct from t.participant_id
    and c.team_id is not distinct from t.team_id
  cross join boundary_stats b;
$$;
revoke all on function vertex_private.round_ranking(uuid) from public,anon,authenticated;

create function public.round_advancement_preview(target_round_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r public.competition_rounds; rows jsonb; tied uuid[]; cutoff numeric;
  above_count integer; entry_count integer; incomplete_count integer; d public.round_advancement_decisions;
  decision_current boolean;
begin
  select * into r from public.competition_rounds where id=target_round_id;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can review advancement.' using errcode='42501';
  end if;
  select * into d from public.round_advancement_decisions where round_id=r.id;
  select coalesce(jsonb_agg(jsonb_build_object('entry_type',entry_type,'participant_id',participant_id,
    'team_id',team_id,'name',name,'username',username,'total',total,'scored_count',scored_count,
    'rank',rank,'boundary',boundary,'provisional',provisional)
    order by (rank is null),rank,total desc,lower(name)),'[]'::jsonb),
    coalesce(array_agg(coalesce(participant_id,team_id) order by coalesce(participant_id,team_id)) filter(where boundary),'{}'::uuid[]),
    max(total) filter(where boundary),count(*) filter(where provisional='advance' and not boundary),
    count(*),count(*) filter(where provisional='incomplete')
    into rows,tied,cutoff,above_count,entry_count,incomplete_count
    from vertex_private.round_ranking(r.id);
  decision_current := d.round_id is not null and d.boundary_ids=tied and d.boundary_score is not distinct from cutoff
    and d.entry_count=entry_count and d.cutoff_count=r.advancement_count;
  return jsonb_build_object('entries',rows,'boundary_ids',to_jsonb(tied),'boundary_score',cutoff,
    'above_count',above_count,'entry_count',entry_count,'incomplete_count',incomplete_count,
    'advancement_count',r.advancement_count,'decision_mode',case when decision_current then d.mode else 'unresolved' end,
    'selected_ids',case when decision_current then to_jsonb(d.selected_ids) else '[]'::jsonb end,
    'decision_stale',d.round_id is not null and not decision_current and d.finalised_at is null,
    'finalised',d.finalised_at is not null,'finalised_at',d.finalised_at,
    'criteria_count',(select count(*) from public.round_scoring_criteria where round_id=r.id),
    'is_final_round',not exists(select 1 from public.competition_rounds next where next.competition_id=r.competition_id and next.sequence=r.sequence+1));
end;
$$;

create function public.set_round_cutoff_decision(target_round_id uuid, decision_mode text, chosen_ids uuid[] default '{}')
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.competition_rounds; snapshot jsonb; boundary_ids uuid[]; selected uuid[] := '{}';
  above_count integer; needed integer;
begin
  select * into r from public.competition_rounds where id=target_round_id for update;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can decide cutoff ties.' using errcode='42501';
  end if;
  if r.judging_state='finalised' then raise exception 'Results are already finalised.' using errcode='23514'; end if;
  snapshot:=public.round_advancement_preview(r.id);
  select coalesce(array_agg(value::uuid order by value::uuid),'{}'::uuid[])
    into boundary_ids from jsonb_array_elements_text(snapshot->'boundary_ids');
  if cardinality(boundary_ids)=0 then raise exception 'No cutoff tie needs a decision.' using errcode='23514'; end if;
  above_count:=(snapshot->>'above_count')::integer;
  needed:=r.advancement_count-above_count;
  if decision_mode not in ('unresolved','include_all','exclude_all','manual') then
    raise exception 'Choose a valid cutoff decision.' using errcode='23514';
  end if;
  if decision_mode='include_all' then selected:=boundary_ids;
  elsif decision_mode='exclude_all' then
    if above_count=0 then raise exception 'Cannot exclude every entrant from advancement.' using errcode='23514'; end if;
  elsif decision_mode='manual' then
    select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into selected from unnest(coalesce(chosen_ids,'{}'::uuid[])) x;
    if cardinality(selected)<>needed or not selected<@boundary_ids then
      raise exception 'Select exactly % entries from the cutoff tie.',needed using errcode='23514';
    end if;
  end if;
  insert into public.round_advancement_decisions(round_id,mode,boundary_score,boundary_ids,selected_ids,
    entry_count,cutoff_count,decided_by,decided_at)
  values(r.id,decision_mode,(snapshot->>'boundary_score')::numeric,boundary_ids,selected,
    (snapshot->>'entry_count')::integer,r.advancement_count,auth.uid(),now())
  on conflict(round_id) do update set mode=excluded.mode,boundary_score=excluded.boundary_score,
    boundary_ids=excluded.boundary_ids,selected_ids=excluded.selected_ids,entry_count=excluded.entry_count,
    cutoff_count=excluded.cutoff_count,decided_by=excluded.decided_by,decided_at=excluded.decided_at;
end;
$$;

create function public.finalise_round_advancement(target_round_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.competition_rounds; snapshot jsonb; d public.round_advancement_decisions;
  item record; chosen boolean; final_round boolean; outcome text; labels text[];
begin
  select * into r from public.competition_rounds where id=target_round_id for update;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can finalise advancement.' using errcode='42501';
  end if;
  if r.judging_state='finalised' then raise exception 'Results are already finalised.' using errcode='23514'; end if;
  snapshot:=public.round_advancement_preview(r.id);
  if (snapshot->>'criteria_count')::integer=0 or (snapshot->>'entry_count')::integer=0
      or (snapshot->>'incomplete_count')::integer>0 then
    raise exception 'Score every active entry against every criterion before finalising.' using errcode='23514';
  end if;
  select * into d from public.round_advancement_decisions where round_id=r.id;
  if jsonb_array_length(snapshot->'boundary_ids')>0 and (snapshot->>'decision_mode')='unresolved' then
    raise exception 'Resolve the cutoff tie before finalising or publishing results.' using errcode='23514';
  end if;
  if jsonb_array_length(snapshot->'boundary_ids')=0 then
    insert into public.round_advancement_decisions(round_id,mode,entry_count,cutoff_count,decided_by,decided_at)
      values(r.id,'automatic',(snapshot->>'entry_count')::integer,r.advancement_count,auth.uid(),now())
    on conflict(round_id) do update set mode='automatic',boundary_score=null,boundary_ids='{}',selected_ids='{}',
      entry_count=excluded.entry_count,cutoff_count=excluded.cutoff_count,decided_by=excluded.decided_by,decided_at=excluded.decided_at;
  end if;
  final_round:=(snapshot->>'is_final_round')::boolean;
  for item in select * from vertex_private.round_ranking(r.id) loop
    chosen:=item.provisional='advance' or (item.boundary and item.provisional='unresolved'
      and coalesce(item.participant_id,item.team_id)=any(d.selected_ids));
    outcome:=case when chosen then case when final_round then 'winner' else 'advanced' end else 'eliminated' end;
    labels:=case when not chosen then '{}'::text[] when final_round then array['winner']
      when r.advancement_count<=3 then array['top_'||r.advancement_count::text,'finalist']
      else array['top_'||r.advancement_count::text] end;
    insert into public.round_advancement_records(round_id,participant_id,team_id,rank,total,status,tags)
      values(r.id,item.participant_id,item.team_id,item.rank,item.total,outcome,labels);
    if item.participant_id is not null then
      insert into public.round_participant_eligibility(round_id,participant_id,status,tags)
        values(r.id,item.participant_id,outcome,labels);
    else
      insert into public.round_participant_eligibility(round_id,participant_id,source_team_id,status,tags)
        select r.id,m.participant_id,item.team_id,outcome,labels
        from public.competition_team_members m where m.team_id=item.team_id;
    end if;
  end loop;
  update public.round_advancement_decisions set finalised_at=now(),finalised_by=auth.uid() where round_id=r.id;
  update public.competition_rounds set judging_state='finalised' where id=r.id;
end;
$$;

create function public.my_round_progress(target_competition_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); rows jsonb;
begin
  if actor is null then raise exception 'Sign in to view your round progress.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('round_id',r.id,'round_name',r.name,'round_slug',r.slug,
    'sequence',r.sequence,'status',e.status,'tags',e.tags,'team_id',e.source_team_id,
    'finalised_at',e.finalised_at) order by r.sequence),'[]'::jsonb) into rows
  from public.round_participant_eligibility e join public.competition_rounds r on r.id=e.round_id
  where r.competition_id=target_competition_id and e.participant_id=actor;
  return rows;
end;
$$;

-- A later milestone can schedule or publish only finalised result state.
create function vertex_private.guard_round_publication()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.leaderboard_state in ('scheduled','published') and old.leaderboard_state is distinct from new.leaderboard_state
    and not exists(select 1 from public.round_advancement_decisions d where d.round_id=new.id and d.finalised_at is not null) then
    raise exception 'Finalise advancement before publishing results.' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger guard_round_publication before update of leaderboard_state on public.competition_rounds
  for each row execute function vertex_private.guard_round_publication();

revoke all on function public.round_advancement_preview(uuid),public.set_round_cutoff_decision(uuid,text,uuid[]),
  public.finalise_round_advancement(uuid),public.my_round_progress(uuid) from public,anon;
grant execute on function public.round_advancement_preview(uuid),public.set_round_cutoff_decision(uuid,text,uuid[]),
  public.finalise_round_advancement(uuid),public.my_round_progress(uuid) to authenticated;


-- Existing scoring and submission APIs use the authoritative round roster.
create or replace function public.round_scoring_roster(target_round_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.competition_rounds; criteria jsonb; entries jsonb; total_max numeric;
begin
  select * into r from public.competition_rounds where id = target_round_id;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can view scoring.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,
    'max_marks',max_marks,'position',position) order by position),'[]'::jsonb), coalesce(sum(max_marks),0)
    into criteria,total_max from public.round_scoring_criteria where round_id = r.id;
  with roster as (
    select 'individual'::text as entry_type, i.participant_id, null::uuid as team_id,
      p.full_name as name, p.username::text as username
    from public.individual_registrations i join public.profiles p on p.id = i.participant_id
    where i.competition_id = r.competition_id and public.round_entry_eligible(r.id,i.participant_id,null)
    union all
    select 'team', null::uuid, t.id, t.name, null::text
    from public.competition_teams t where t.competition_id = r.competition_id and t.registered_at is not null and public.round_entry_eligible(r.id,null,t.id)
  ), scored as (
    select e.*,
      coalesce((select sum(s.marks) from public.round_scores s where s.round_id = r.id
        and ((e.participant_id is not null and s.participant_id = e.participant_id)
          or (e.team_id is not null and s.team_id = e.team_id))),0) as total,
      (select count(*) from public.round_scores s where s.round_id = r.id
        and ((e.participant_id is not null and s.participant_id = e.participant_id)
          or (e.team_id is not null and s.team_id = e.team_id))) as scored_count,
      (select coalesce(jsonb_object_agg(s.criterion_id::text,s.marks),'{}'::jsonb)
        from public.round_scores s where s.round_id = r.id
        and ((e.participant_id is not null and s.participant_id = e.participant_id)
          or (e.team_id is not null and s.team_id = e.team_id))) as marks
    from roster e
  )
  select coalesce(jsonb_agg(jsonb_build_object('entry_type',entry_type,'participant_id',participant_id,
    'team_id',team_id,'name',name,'username',username,'total',total,
    'scored_count',scored_count,'marks',marks)
    order by (scored_count = jsonb_array_length(criteria)) desc, total desc, lower(name)), '[]'::jsonb)
    into entries from scored;
  return jsonb_build_object('criteria',criteria,'entries',entries,'max_total',total_max,
    'show_scores_public',coalesce((select show_scores_public from public.round_scoring_settings where round_id = r.id),false),
    'locked',r.leaderboard_state <> 'unpublished' or r.judging_state = 'finalised');
end;
$$;

create or replace function public.save_round_scores(target_round_id uuid, target_participant_id uuid,
  target_team_id uuid, score_items jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.competition_rounds; item jsonb; criterion public.round_scoring_criteria;
  entered numeric; seen uuid[] := '{}'; requested_criterion_id uuid;
begin
  select * into r from public.competition_rounds where id = target_round_id for update;
  if auth.uid() is null or r.id is null or not public.can_manage_competition(r.competition_id) then
    raise exception 'Only competition organisers can enter scores.' using errcode = '42501';
  end if;
  if r.leaderboard_state <> 'unpublished' or r.judging_state = 'finalised' then
    raise exception 'Scores are locked after results are finalised.' using errcode = '23514';
  end if;
  if (target_participant_id is null) = (target_team_id is null) then
    raise exception 'Choose one individual or team entry.' using errcode = '23514';
  end if;
  if target_participant_id is not null and not exists (
    select 1 from public.individual_registrations where competition_id = r.competition_id and participant_id = target_participant_id
  ) or target_team_id is not null and not exists (
    select 1 from public.competition_teams where competition_id = r.competition_id and id = target_team_id and registered_at is not null
  ) then raise exception 'Entry is not registered for this competition.' using errcode = '23514'; end if;
  if not public.round_entry_eligible(r.id,target_participant_id,target_team_id) then
    raise exception 'Entry is not active in this round.' using errcode = '42501';
  end if;
  if jsonb_typeof(score_items) <> 'array' or jsonb_array_length(score_items) > 100 then
    raise exception 'Scores must be a list of criteria.' using errcode = '23514';
  end if;
  for item in select value from jsonb_array_elements(score_items) loop
    begin requested_criterion_id := (item->>'criterion_id')::uuid; exception when others then
      raise exception 'Invalid criterion.' using errcode = '23514'; end;
    if requested_criterion_id = any(seen) then raise exception 'Criterion repeated.' using errcode = '23514'; end if;
    seen := array_append(seen,requested_criterion_id);
    select * into criterion from public.round_scoring_criteria where id = requested_criterion_id and round_id = r.id;
    if criterion.id is null then raise exception 'Criterion does not belong to this round.' using errcode = '23514'; end if;
    if item->'marks' is null or item->'marks' = 'null'::jsonb then
      delete from public.round_scores where criterion_id = criterion.id
        and ((target_participant_id is not null and participant_id = target_participant_id)
          or (target_team_id is not null and team_id = target_team_id));
    else
      begin entered := (item->>'marks')::numeric; exception when others then
        raise exception 'Marks must be numeric.' using errcode = '23514'; end;
      if entered < 0 or entered > criterion.max_marks or entered <> round(entered,2) then
        raise exception 'Marks for % must be between 0 and %, with at most two decimals.', criterion.name, criterion.max_marks using errcode = '23514';
      end if;
      if target_participant_id is not null then
        insert into public.round_scores(round_id,criterion_id,participant_id,marks,entered_by)
        values (r.id,criterion.id,target_participant_id,entered,auth.uid())
        on conflict (criterion_id,participant_id) where participant_id is not null
        do update set marks = excluded.marks, entered_by = excluded.entered_by, updated_at = now();
      else
        insert into public.round_scores(round_id,criterion_id,team_id,marks,entered_by)
        values (r.id,criterion.id,target_team_id,entered,auth.uid())
        on conflict (criterion_id,team_id) where team_id is not null
        do update set marks = excluded.marks, entered_by = excluded.entered_by, updated_at = now();
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.public_round_scores(target_round_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.competition_rounds; criteria_count integer; max_total numeric; entries jsonb;
begin
  select * into r from public.competition_rounds where id = target_round_id;
  if r.id is null or not exists (select 1 from public.competitions c where c.id = r.competition_id and c.status = 'published') then
    raise exception 'Round not found.' using errcode = '23514';
  end if;
  if not coalesce((select show_scores_public from public.round_scoring_settings where round_id = r.id),false) then
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

create or replace function public.can_view_round_submission_config(target_round_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.competition_rounds r join public.competitions c on c.id = r.competition_id
    where r.id = target_round_id and (
      public.can_manage_competition(c.id)
      or (c.status = 'published' and (
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
      and c.status = 'published' and now() >= cfg.opens_at and now() < cfg.closes_at
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

create or replace function public.organiser_round_submission_review(
  target_round_id uuid, search_term text default '', status_filter text default 'all',
  entry_filter text default 'all', result_page integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  comp_id uuid;
  needle text := lower(btrim(coalesce(search_term,'')));
  page_number integer := least(greatest(coalesce(result_page,0),0),100000);
  total integer;
  rows jsonb;
begin
  select competition_id into comp_id from public.competition_rounds where id = target_round_id;
  if auth.uid() is null or comp_id is null or not public.can_manage_competition(comp_id) then
    raise exception 'Only competition organisers can review submissions.' using errcode = '42501';
  end if;
  if length(needle) > 100 or status_filter not in ('all','valid','late','missing')
      or entry_filter not in ('all','individual','team') then
    raise exception 'Invalid review filter.' using errcode = '23514';
  end if;
  with entries as (
    select 'individual'::text as entry_type, i.participant_id, null::uuid as team_id,
      p.full_name as name, p.username::text as username, i.created_at as registered_at
    from public.individual_registrations i join public.profiles p on p.id = i.participant_id
    where i.competition_id = comp_id and public.round_entry_eligible(target_round_id,i.participant_id,null)
    union all
    select 'team', null::uuid, t.id, t.name, null::text, t.registered_at
    from public.competition_teams t where t.competition_id = comp_id and t.registered_at is not null
      and public.round_entry_eligible(target_round_id,null,t.id)
  ), joined as (
    select e.*, s.id as submission_id, s.first_submitted_at, s.updated_at,
      case when s.id is null then 'missing'
        when s.first_submitted_at >= cfg.closes_at then 'late' else 'valid' end as status
    from entries e left join public.round_submissions s on s.round_id = target_round_id
      and ((e.entry_type = 'individual' and s.participant_id = e.participant_id)
        or (e.entry_type = 'team' and s.team_id = e.team_id))
    left join public.round_submission_configs cfg on cfg.round_id = target_round_id
  )
  select count(*) into total from joined j
  where (needle = '' or lower(j.name) like '%' || needle || '%' or lower(coalesce(j.username,'')) like '%' || needle || '%')
    and (status_filter = 'all' or j.status = status_filter)
    and (entry_filter = 'all' or j.entry_type = entry_filter);
  with entries as (
    select 'individual'::text as entry_type, i.participant_id, null::uuid as team_id,
      p.full_name as name, p.username::text as username, i.created_at as registered_at
    from public.individual_registrations i join public.profiles p on p.id = i.participant_id
    where i.competition_id = comp_id and public.round_entry_eligible(target_round_id,i.participant_id,null)
    union all
    select 'team', null::uuid, t.id, t.name, null::text, t.registered_at
    from public.competition_teams t where t.competition_id = comp_id and t.registered_at is not null
      and public.round_entry_eligible(target_round_id,null,t.id)
  ), joined as (
    select e.*, s.id as submission_id, s.first_submitted_at, s.updated_at,
      case when s.id is null then 'missing'
        when s.first_submitted_at >= cfg.closes_at then 'late' else 'valid' end as status
    from entries e left join public.round_submissions s on s.round_id = target_round_id
      and ((e.entry_type = 'individual' and s.participant_id = e.participant_id)
        or (e.entry_type = 'team' and s.team_id = e.team_id))
    left join public.round_submission_configs cfg on cfg.round_id = target_round_id
  )
  select coalesce(jsonb_agg(to_jsonb(item)), '[]'::jsonb) into rows from (
    select j.*,
      (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'path',f.storage_path,'name',f.original_name,
        'mime_type',f.mime_type,'size_bytes',f.size_bytes) order by f.created_at,f.id), '[]'::jsonb)
        from public.round_submission_files f where f.submission_id = j.submission_id) as files,
      (select coalesce(jsonb_agg(l.url order by l.created_at,l.id), '[]'::jsonb)
        from public.round_submission_links l where l.submission_id = j.submission_id) as links
    from joined j
    where (needle = '' or lower(j.name) like '%' || needle || '%' or lower(coalesce(j.username,'')) like '%' || needle || '%')
      and (status_filter = 'all' or j.status = status_filter)
      and (entry_filter = 'all' or j.entry_type = entry_filter)
    order by lower(j.name), j.participant_id nulls last, j.team_id nulls last
    limit 25 offset page_number * 25
  ) item;
  return jsonb_build_object('entries',rows,'total',total,'page',page_number);
end;
$$;

create function public.my_round_entry_eligible(target_round_id uuid)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); r public.competition_rounds;
begin
  if actor is null then return false; end if;
  select * into r from public.competition_rounds where id=target_round_id;
  if r.id is null then return false; end if;
  return public.round_entry_eligible(r.id,actor,null)
    or exists(select 1 from public.competition_team_members m
      where m.competition_id=r.competition_id and m.participant_id=actor
        and public.round_entry_eligible(r.id,null,m.team_id));
end;
$$;
revoke all on function public.my_round_entry_eligible(uuid) from public,anon;
grant execute on function public.my_round_entry_eligible(uuid) to authenticated;

-- Direct inserts and updates remain protected if a caller bypasses the RPC.
create function vertex_private.guard_round_submission_eligibility()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.round_entry_eligible(new.round_id,new.participant_id,new.team_id) then
    raise exception 'Entry is not active in this round.' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger guard_round_submission_eligibility before insert or update on public.round_submissions
  for each row execute function vertex_private.guard_round_submission_eligibility();

commit;

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

-- Source: 014b_published_competition_edits.sql
-- Milestone 16 correction: keep published descriptive edits working after results are released.
begin;

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
    if not public.can_manage_competition(candidate.id) then raise exception 'You cannot edit this competition.' using errcode = '42501'; end if;
    if expected_version is distinct from previous.version then raise exception 'This competition changed in another tab. Reload before saving.' using errcode = 'PT409'; end if;
  elsif expected_version is not null then raise exception 'Competition no longer exists. Reload before saving.'; end if;
  candidate.owner_id := coalesce(previous.owner_id, actor);
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
  if candidate.banner_kind = 'image' and (previous.id is null or candidate.banner_path is distinct from previous.banner_path) and (candidate.banner_path is null or split_part(candidate.banner_path,'/',1) <> actor::text or split_part(candidate.banner_path,'/',2) <> candidate.id::text or not exists (
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
    select jsonb_agg(to_jsonb(cr) - array['competition_id','status','judging_state','leaderboard_state','leaderboard_published_at'] order by sequence) into saved_rounds from public.competition_rounds cr where competition_id = candidate.id;
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

commit;
