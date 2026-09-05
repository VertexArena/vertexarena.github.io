-- Current bootstrap through Milestone 3: authentication, public identity,
-- organisation accounts, consent-based membership, and identity-image Storage.
-- Hosted Auth must use email/password with email
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
create index profiles_full_name_trgm_idx on public.profiles using gin (lower(full_name) extensions.gin_trgm_ops);
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
revoke all on function public.search_profiles(text, integer) from public;
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

commit;
