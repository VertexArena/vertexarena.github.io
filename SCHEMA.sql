-- Vertex Supabase setup.
-- Run in Supabase SQL editor, then disable email confirmation in Authentication settings.

create extension if not exists "pgcrypto";

do $$ begin create type account_type as enum ('participant', 'organiser', 'organisation'); exception when duplicate_object then null; end $$;
do $$ begin create type team_mode as enum ('individual', 'team', 'both'); exception when duplicate_object then null; end $$;
do $$ begin create type competition_status as enum ('draft', 'registration_open', 'upcoming', 'in_progress', 'completed', 'cancelled'); exception when duplicate_object then null; end $$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  full_name text not null,
  account_type account_type not null,
  bio text default '',
  social_links jsonb not null default '[]'::jsonb,
  avatar_url text,
  organisation_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists competitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  name text not null,
  field text not null,
  prize text not null,
  age_min int,
  age_max int,
  team_mode team_mode not null default 'individual',
  status competition_status not null default 'draft',
  banner_url text,
  banner_gradient text,
  structure jsonb not null,
  categories text[] not null default '{}',
  description text not null default '',
  organiser_id uuid not null references profiles(id) on delete cascade,
  organisation_id uuid references profiles(id) on delete set null,
  registration_deadline timestamptz not null,
  start_at timestamptz,
  end_at timestamptz,
  timeline jsonb not null default '{}'::jsonb,
  participant_count int not null default 0,
  team_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists competition_staff (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'organiser',
  invited_by uuid references profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (competition_id, profile_id)
);

create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  participant_id uuid not null references profiles(id) on delete cascade,
  mode team_mode not null default 'individual',
  team_name text,
  internal_tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (competition_id, participant_id)
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  name text not null,
  owner_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (competition_id, name)
);

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  participant_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'invited',
  created_at timestamptz not null default now(),
  unique (team_id, participant_id)
);

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text not null,
  push_required boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  question text not null,
  answer text,
  answered_by uuid references profiles(id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9-]{3,60}$'),
  audience jsonb not null default '{"type":"all"}'::jsonb,
  created_by uuid not null references profiles(id) on delete cascade,
  starts_at timestamptz,
  created_at timestamptz not null default now(),
  unique (competition_id, name)
);

create table if not exists submission_boxes (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  round_key text not null,
  mode text not null default 'files_and_links',
  allowed_file_types text[] not null default '{}',
  max_file_size_mb int not null default 25 check (max_file_size_mb between 1 and 25),
  closes_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (competition_id, round_key)
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  submission_box_id uuid not null references submission_boxes(id) on delete cascade,
  registration_id uuid not null references registrations(id) on delete cascade,
  file_urls text[] not null default '{}',
  links text[] not null default '{}',
  confirmed_at timestamptz not null default now(),
  unique (submission_box_id, registration_id)
);

create table if not exists scoring_criteria (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  round_key text not null,
  label text not null,
  max_marks numeric not null check (max_marks > 0),
  created_at timestamptz not null default now()
);

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  round_key text not null,
  registration_id uuid not null references registrations(id) on delete cascade,
  criterion_id uuid references scoring_criteria(id) on delete cascade,
  marks numeric not null default 0,
  notes text,
  entered_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (round_key, registration_id, criterion_id)
);

create table if not exists leaderboards (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  round_key text not null,
  title text not null,
  advance_count int not null default 3,
  show_scores boolean not null default false,
  release_at timestamptz,
  released_at timestamptz,
  entries jsonb not null default '[]'::jsonb,
  category_winners jsonb not null default '[]'::jsonb,
  tie_policy text not null default 'manual',
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (competition_id, round_key)
);

create table if not exists certificate_templates (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  name text not null,
  certificate_type text not null,
  template_url text not null,
  fields jsonb not null default '[]'::jsonb,
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  url text,
  read_at timestamptz,
  push_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function is_competition_staff(target_competition uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from competitions c
    left join competition_staff s on s.competition_id = c.id
    where c.id = target_competition
      and (c.organiser_id = auth.uid() or (s.profile_id = auth.uid() and s.accepted_at is not null))
  );
$$;

create or replace function is_registered(target_competition uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from registrations r where r.competition_id = target_competition and r.participant_id = auth.uid());
$$;

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on profiles;
create trigger profiles_touch before update on profiles for each row execute function touch_updated_at();
drop trigger if exists competitions_touch on competitions;
create trigger competitions_touch before update on competitions for each row execute function touch_updated_at();

alter table profiles enable row level security;
alter table competitions enable row level security;
alter table competition_staff enable row level security;
alter table registrations enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table announcements enable row level security;
alter table questions enable row level security;
alter table meetings enable row level security;
alter table submission_boxes enable row level security;
alter table submissions enable row level security;
alter table scoring_criteria enable row level security;
alter table scores enable row level security;
alter table leaderboards enable row level security;
alter table certificate_templates enable row level security;
alter table notifications enable row level security;
alter table push_subscriptions enable row level security;

drop policy if exists "profiles read" on profiles;
create policy "profiles read" on profiles for select using (true);
drop policy if exists "profiles insert own" on profiles;
create policy "profiles insert own" on profiles for insert with check (id = auth.uid());
drop policy if exists "profiles update own" on profiles;
create policy "profiles update own" on profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "competitions public read" on competitions;
create policy "competitions public read" on competitions for select using (status <> 'draft' or organiser_id = auth.uid() or is_competition_staff(id));
drop policy if exists "organisers create competitions" on competitions;
create policy "organisers create competitions" on competitions for insert with check (
  organiser_id = auth.uid() and exists (select 1 from profiles p where p.id = auth.uid() and p.account_type in ('organiser', 'organisation'))
);
drop policy if exists "staff update competitions" on competitions;
create policy "staff update competitions" on competitions for update using (organiser_id = auth.uid() or is_competition_staff(id));

drop policy if exists "registrations visible" on registrations;
create policy "registrations visible" on registrations for select using (participant_id = auth.uid() or is_competition_staff(competition_id));
drop policy if exists "participants register" on registrations;
create policy "participants register" on registrations for insert with check (
  participant_id = auth.uid() and exists (select 1 from profiles p where p.id = auth.uid() and p.account_type = 'participant')
);
drop policy if exists "registrations update" on registrations;
create policy "registrations update" on registrations for update using (participant_id = auth.uid() or is_competition_staff(competition_id));

drop policy if exists "teams visible" on teams;
create policy "teams visible" on teams for select using (is_registered(competition_id) or is_competition_staff(competition_id));
drop policy if exists "teams manage" on teams;
create policy "teams manage" on teams for all using (owner_id = auth.uid() or is_competition_staff(competition_id)) with check (owner_id = auth.uid() or is_competition_staff(competition_id));

drop policy if exists "team members visible" on team_members;
create policy "team members visible" on team_members for select using (
  exists (select 1 from teams t where t.id = team_id and (is_registered(t.competition_id) or is_competition_staff(t.competition_id)))
);
drop policy if exists "team members manage" on team_members;
create policy "team members manage" on team_members for all using (
  participant_id = auth.uid() or exists (select 1 from teams t where t.id = team_id and (t.owner_id = auth.uid() or is_competition_staff(t.competition_id)))
) with check (
  participant_id = auth.uid() or exists (select 1 from teams t where t.id = team_id and (t.owner_id = auth.uid() or is_competition_staff(t.competition_id)))
);

drop policy if exists "staff visible" on competition_staff;
create policy "staff visible" on competition_staff for select using (profile_id = auth.uid() or is_competition_staff(competition_id));
drop policy if exists "staff manage" on competition_staff;
create policy "staff manage" on competition_staff for all using (profile_id = auth.uid() or is_competition_staff(competition_id)) with check (profile_id = auth.uid() or is_competition_staff(competition_id));

drop policy if exists "announcements read" on announcements;
create policy "announcements read" on announcements for select using (is_registered(competition_id) or is_competition_staff(competition_id));
drop policy if exists "announcements write" on announcements;
create policy "announcements write" on announcements for insert with check (is_competition_staff(competition_id));

drop policy if exists "questions read" on questions;
create policy "questions read" on questions for select using (is_registered(competition_id) or is_competition_staff(competition_id));
drop policy if exists "questions ask" on questions;
create policy "questions ask" on questions for insert with check (author_id = auth.uid() and is_registered(competition_id));
drop policy if exists "questions answer" on questions;
create policy "questions answer" on questions for update using (is_competition_staff(competition_id));

drop policy if exists "meetings read" on meetings;
create policy "meetings read" on meetings for select using (is_registered(competition_id) or is_competition_staff(competition_id));
drop policy if exists "meetings manage" on meetings;
create policy "meetings manage" on meetings for all using (is_competition_staff(competition_id)) with check (is_competition_staff(competition_id));

drop policy if exists "submission boxes read" on submission_boxes;
create policy "submission boxes read" on submission_boxes for select using (is_registered(competition_id) or is_competition_staff(competition_id));
drop policy if exists "submission boxes manage" on submission_boxes;
create policy "submission boxes manage" on submission_boxes for all using (is_competition_staff(competition_id)) with check (is_competition_staff(competition_id));

drop policy if exists "submissions read" on submissions;
create policy "submissions read" on submissions for select using (
  exists (
    select 1 from registrations r join submission_boxes b on b.id = submission_box_id
    where r.id = registration_id and (r.participant_id = auth.uid() or is_competition_staff(b.competition_id))
  )
);
drop policy if exists "submissions write" on submissions;
create policy "submissions write" on submissions for insert with check (
  exists (
    select 1 from registrations r join submission_boxes b on b.id = submission_box_id
    where r.id = registration_id and r.participant_id = auth.uid() and now() <= b.closes_at
  )
);

drop policy if exists "scoring criteria staff" on scoring_criteria;
create policy "scoring criteria staff" on scoring_criteria for all using (is_competition_staff(competition_id)) with check (is_competition_staff(competition_id));
drop policy if exists "scores staff" on scores;
create policy "scores staff" on scores for all using (is_competition_staff(competition_id)) with check (is_competition_staff(competition_id));

drop policy if exists "leaderboards read" on leaderboards;
create policy "leaderboards read" on leaderboards for select using (
  is_competition_staff(competition_id) or (is_registered(competition_id) and coalesce(released_at, release_at) <= now())
);
drop policy if exists "leaderboards manage" on leaderboards;
create policy "leaderboards manage" on leaderboards for all using (is_competition_staff(competition_id)) with check (is_competition_staff(competition_id));

drop policy if exists "certificate templates read" on certificate_templates;
create policy "certificate templates read" on certificate_templates for select using ((enabled and is_registered(competition_id)) or is_competition_staff(competition_id));
drop policy if exists "certificate templates manage" on certificate_templates;
create policy "certificate templates manage" on certificate_templates for all using (is_competition_staff(competition_id)) with check (is_competition_staff(competition_id));

drop policy if exists "notifications own read" on notifications;
create policy "notifications own read" on notifications for select using (profile_id = auth.uid());
drop policy if exists "notifications own update" on notifications;
create policy "notifications own update" on notifications for update using (profile_id = auth.uid());
drop policy if exists "push own" on push_subscriptions;
create policy "push own" on push_subscriptions for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('banners', 'banners', true, 26214400, array['image/png','image/jpeg','image/webp']),
  ('avatars', 'avatars', true, 5242880, array['image/png','image/jpeg','image/webp']),
  ('submissions', 'submissions', false, 26214400, null),
  ('certificate-templates', 'certificate-templates', false, 26214400, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public image read" on storage.objects;
create policy "public image read" on storage.objects for select using (bucket_id in ('banners', 'avatars'));
drop policy if exists "authenticated storage insert" on storage.objects;
create policy "authenticated storage insert" on storage.objects for insert with check (auth.role() = 'authenticated' and bucket_id in ('banners','avatars','submissions','certificate-templates'));
drop policy if exists "owner storage update" on storage.objects;
create policy "owner storage update" on storage.objects for update using (owner = auth.uid());
drop policy if exists "owner storage delete" on storage.objects;
create policy "owner storage delete" on storage.objects for delete using (owner = auth.uid());

do $$ begin alter publication supabase_realtime add table announcements; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table questions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table leaderboards; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table notifications; exception when duplicate_object then null; end $$;
