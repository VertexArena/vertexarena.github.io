-- Fix draft detail access and enforce competition timeline logic.
grant select on public.submission_boxes to anon, authenticated;

do $$
begin
 if not exists(select 1 from pg_constraint where conname='competitions_timeline_valid' and conrelid='public.competitions'::regclass) then
  alter table public.competitions add constraint competitions_timeline_valid check(
   (start_at is null or registration_deadline<start_at)
   and (start_at is null or end_at is null or start_at<end_at)
   and (certificate_release_at is null or end_at is null or certificate_release_at>=end_at)
  ) not valid;
 end if;
end$$;

create or replace function public.validate_round_timeline() returns trigger language plpgsql set search_path=public as $$
declare event_start timestamptz; event_end timestamptz; previous_deadline timestamptz; next_deadline timestamptz;
begin
 select start_at,end_at into event_start,event_end from public.competitions where id=new.competition_id;
 if event_start is null or event_end is null then raise exception 'Set competition start and end before adding rounds'; end if;
 if new.submission_deadline is null or new.submission_deadline<event_start or new.submission_deadline>event_end then raise exception 'Round deadline must be between competition start and end'; end if;
 select max(submission_deadline) into previous_deadline from public.rounds where competition_id=new.competition_id and position<new.position and id<>new.id;
 select min(submission_deadline) into next_deadline from public.rounds where competition_id=new.competition_id and position>new.position and id<>new.id;
 if previous_deadline is not null and new.submission_deadline<=previous_deadline then raise exception 'Round deadline must be after the previous round'; end if;
 if next_deadline is not null and new.submission_deadline>=next_deadline then raise exception 'Round deadline must be before the next round'; end if;
 return new;
end$$;
drop trigger if exists rounds_validate_timeline on public.rounds;
create trigger rounds_validate_timeline before insert or update of competition_id,position,submission_deadline on public.rounds for each row execute function public.validate_round_timeline();
notify pgrst, 'reload schema';
