-- Fix meeting policy recursion without weakening assignment access.
create or replace function public.is_meeting_organiser(mid uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select public.is_comp_organiser(m.competition_id) from public.meetings m where m.id=mid
$$;

create or replace function public.can_read_meeting(mid uuid,cid uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select public.is_comp_organiser(cid) or exists(
  select 1 from public.meeting_assignments ma
  where ma.meeting_id=mid and (
   ma.participant_id=auth.uid()
   or ma.team_id in(
    select tm.team_id from public.team_members tm
    where tm.participant_id=auth.uid() and tm.invite_status='accepted'
   )
  )
 )
$$;

drop policy if exists "assigned meetings read" on public.meetings;
create policy "assigned meetings read" on public.meetings for select
using(public.can_read_meeting(id,competition_id));

drop policy if exists "meeting assignments organiser manage" on public.meeting_assignments;
create policy "meeting assignments organiser manage" on public.meeting_assignments for all
using(public.is_meeting_organiser(meeting_id))
with check(public.is_meeting_organiser(meeting_id));

drop policy if exists "meeting assignments own read" on public.meeting_assignments;
create policy "meeting assignments own read" on public.meeting_assignments for select using(
 participant_id=auth.uid()
 or team_id in(
  select tm.team_id from public.team_members tm
  where tm.participant_id=auth.uid() and tm.invite_status='accepted'
 )
);

grant execute on function public.is_meeting_organiser(uuid) to authenticated;
grant execute on function public.can_read_meeting(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
