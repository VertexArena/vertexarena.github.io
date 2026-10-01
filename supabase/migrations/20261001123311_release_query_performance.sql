-- Release review: preserve permissions while avoiding per-row identity evaluation.
begin;
create index meeting_participant_assignments_meeting_competition_idx
  on public.meeting_participant_assignments(meeting_id, competition_id);
create index meeting_team_assignments_meeting_competition_idx
  on public.meeting_team_assignments(meeting_id, competition_id);
create index meeting_team_assignments_team_competition_idx
  on public.meeting_team_assignments(team_id, competition_id);
create index organisation_memberships_invited_by_idx
  on public.organisation_memberships(invited_by);

alter policy profiles_select_own on public.profiles
  using (id = (select auth.uid()));
alter policy profiles_update_own on public.profiles
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy organisations_insert_management on public.organisations
  with check (management_profile_id = (select auth.uid()) and exists (
    select 1 from public.profiles where id = (select auth.uid()) and account_type = 'organisation'));
alter policy organisations_update_management on public.organisations
  using (management_profile_id = (select auth.uid()))
  with check (management_profile_id = (select auth.uid()));

-- One authenticated SELECT policy expresses the same union as the two former policies.
drop policy organisation_memberships_private_read on public.organisation_memberships;
drop policy organisation_memberships_public_accepted_read on public.organisation_memberships;
create policy organisation_memberships_public_accepted_read
  on public.organisation_memberships for select to anon using (status = 'accepted');
create policy organisation_memberships_authenticated_read
  on public.organisation_memberships for select to authenticated
  using (status = 'accepted' or organiser_id = (select auth.uid()) or exists (
    select 1 from public.organisations o where o.id = organisation_id
      and o.management_profile_id = (select auth.uid())));
commit;
