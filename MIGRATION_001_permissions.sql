-- Run once in Supabase SQL Editor for a project already created with SCHEMA.sql.
-- RLS policies remain authoritative. No service-role or RLS bypass is granted.
alter table public.tags enable row level security;
create policy "tags public read" on public.tags for select using(true);

grant usage on schema public to anon, authenticated;
grant select on public.competitions,public.organisations,public.competition_tags,public.tags,public.rounds,public.categories,public.competition_organisers,public.profiles to anon;
grant select on public.competitions,public.organisations,public.competition_tags,public.tags,public.rounds,public.categories,public.competition_organisers,public.profiles,public.registrations,public.bookmarks,public.notifications,public.announcements,public.questions,public.answers to authenticated;
grant update on public.profiles,public.competitions,public.notifications to authenticated;
grant insert on public.competitions,public.registrations,public.bookmarks,public.announcements,public.questions,public.answers to authenticated;
grant delete on public.bookmarks to authenticated;
