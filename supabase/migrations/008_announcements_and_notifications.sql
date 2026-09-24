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
