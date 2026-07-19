-- Vertex workspace tools, team sizing, and organiser collaboration.
alter table public.competitions add column if not exists team_size_min int;
alter table public.competitions add column if not exists team_size_max int;

do $$
begin
 if not exists(select 1 from pg_constraint where conname='competitions_team_size_valid') then
  alter table public.competitions add constraint competitions_team_size_valid check(
   (team_mode='individual' and team_size_min is null and team_size_max is null)
   or (team_mode in('team','both') and ((team_size_min is null and team_size_max is null) or (team_size_min>=2 and team_size_max>=team_size_min)))
  ) not valid;
 end if;
end$$;

create or replace function public.invite_competition_organiser(target_competition uuid,target_username text)
returns boolean language plpgsql security definer set search_path=public as $$
declare target public.profiles%rowtype; comp public.competitions%rowtype;
begin
 select * into comp from public.competitions where id=target_competition;
 if comp.id is null or not public.is_comp_organiser(comp.id) then raise exception 'Competition organiser access required'; end if;
 select * into target from public.profiles where lower(username)=lower(trim(leading '@' from target_username));
 if target.id is null then raise exception 'Organiser account not found'; end if;
 if target.account_type<>'organiser' then raise exception 'Only organiser accounts can be invited'; end if;
 if target.id=auth.uid() then raise exception 'You already manage this competition'; end if;
 insert into public.competition_organisers(competition_id,profile_id,accepted)
 values(comp.id,target.id,false)
 on conflict(competition_id,profile_id) do update set accepted=false;
 insert into public.notifications(recipient_id,type,title,body,link)
 values(target.id,'competition_organiser_invite','Competition organiser invitation',
  'You were invited to help organise '||comp.name||'.','/dashboard');
 return true;
end$$;

create or replace function public.accept_competition_organiser(target_competition uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 update public.competition_organisers set accepted=true
 where competition_id=target_competition and profile_id=auth.uid() and accepted=false;
 if not found then raise exception 'Competition invitation not found'; end if;
 return true;
end$$;

revoke all on function public.invite_competition_organiser(uuid,text) from public;
revoke all on function public.accept_competition_organiser(uuid) from public;
grant execute on function public.invite_competition_organiser(uuid,text) to authenticated;
grant execute on function public.accept_competition_organiser(uuid) to authenticated;

drop policy if exists "meeting assignments organiser manage" on public.meeting_assignments;
create policy "meeting assignments organiser manage" on public.meeting_assignments for all
using(public.is_comp_organiser((select competition_id from public.meetings where id=meeting_id)))
with check(public.is_comp_organiser((select competition_id from public.meetings where id=meeting_id)));

drop policy if exists "submission boxes organiser update" on public.submission_boxes;
create policy "submission boxes organiser update" on public.submission_boxes for update
using(public.is_comp_organiser((select competition_id from public.rounds where id=round_id)))
with check(public.is_comp_organiser((select competition_id from public.rounds where id=round_id)));

drop policy if exists "scores organiser manage" on public.scores;
create policy "scores organiser manage" on public.scores for all
using(public.is_comp_organiser((select r.competition_id from public.scoring_criteria sc join public.rounds r on r.id=sc.round_id where sc.id=criterion_id)))
with check(public.is_comp_organiser((select r.competition_id from public.scoring_criteria sc join public.rounds r on r.id=sc.round_id where sc.id=criterion_id)));

drop policy if exists "leaderboards organiser manage" on public.leaderboards;
create policy "leaderboards organiser manage" on public.leaderboards for all
using(public.is_comp_organiser((select competition_id from public.rounds where id=round_id)))
with check(public.is_comp_organiser((select competition_id from public.rounds where id=round_id)));

drop policy if exists "leaderboard entries organiser manage" on public.leaderboard_entries;
create policy "leaderboard entries organiser manage" on public.leaderboard_entries for all
using(public.is_comp_organiser((select r.competition_id from public.leaderboards l join public.rounds r on r.id=l.round_id where l.id=leaderboard_id)))
with check(public.is_comp_organiser((select r.competition_id from public.leaderboards l join public.rounds r on r.id=l.round_id where l.id=leaderboard_id)));

drop policy if exists "certificate templates organiser manage" on public.certificate_templates;
create policy "certificate templates organiser manage" on public.certificate_templates for all
using(public.is_comp_organiser(competition_id)) with check(public.is_comp_organiser(competition_id));

grant select,insert,update on public.meetings,public.meeting_assignments,public.competition_organisers,
 public.leaderboards,public.leaderboard_entries,public.scores,public.certificate_templates to authenticated;
grant select,update on public.submission_boxes to authenticated;
grant select on public.scoring_criteria,public.teams,public.team_members,public.qualifications to authenticated;

notify pgrst, 'reload schema';


-- Pending organiser invitations may read competition identity, but cannot manage it.
drop policy if exists "invited organisers read competition" on public.competitions;
create policy "invited organisers read competition" on public.competitions for select using(
 exists(select 1 from public.competition_organisers co where co.competition_id=id and co.profile_id=auth.uid())
);
notify pgrst, 'reload schema';
