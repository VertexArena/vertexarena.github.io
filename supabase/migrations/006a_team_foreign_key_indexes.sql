-- Milestone 7 follow-up: cover team and notification foreign keys.
begin;
create index competition_team_members_team_comp_idx
  on public.competition_team_members (team_id, competition_id);
create index competition_team_invitations_team_comp_idx
  on public.competition_team_invitations (team_id, competition_id);
create index competition_team_invitations_invited_by_idx
  on public.competition_team_invitations (invited_by);
create index notifications_competition_idx
  on public.notifications (competition_id);
commit;
