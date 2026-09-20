begin;
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
commit;
