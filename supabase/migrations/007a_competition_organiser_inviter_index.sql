-- Follow-up to 007: cover the invitation author foreign key.
begin;
create index competition_organiser_invitations_inviter_idx
  on public.competition_organiser_invitations(invited_by);
commit;
