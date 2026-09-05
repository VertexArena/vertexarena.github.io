-- Milestone 3: organisation management accounts and consent-based membership.
begin;

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

commit;
