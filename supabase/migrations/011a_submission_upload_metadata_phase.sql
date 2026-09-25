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
