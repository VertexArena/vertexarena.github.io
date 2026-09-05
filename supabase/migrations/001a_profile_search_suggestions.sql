-- CHANGES.md prerequisite: typo-tolerant public profile suggestions.
-- Apply after 001_auth_profiles_and_organisations.sql and before Milestone 3.
begin;

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
commit;
