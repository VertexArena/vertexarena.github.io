-- Cover the submission-rule editor foreign key for profile deletion and joins.
create index round_submission_configs_updated_by_idx
  on public.round_submission_configs (updated_by);
