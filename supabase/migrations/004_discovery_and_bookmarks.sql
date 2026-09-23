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
