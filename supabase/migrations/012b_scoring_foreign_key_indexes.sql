-- Cover score foreign keys used by criterion edits and participant removal.
begin;
create index round_scores_criterion_round_idx on public.round_scores(criterion_id,round_id);
create index round_scores_participant_idx on public.round_scores(participant_id) where participant_id is not null;
commit;
