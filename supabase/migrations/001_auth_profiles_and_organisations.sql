-- Milestone 2: authentication profiles, public identity, organisation foundations,
-- and profile-picture Storage. Hosted Auth must use email/password with email
-- confirmation disabled; that dashboard setting cannot be enforced through SQL.

begin;

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

commit;
