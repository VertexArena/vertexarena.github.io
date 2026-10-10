// Presentation follows actual publication state. A planned release date is not
// evidence that judging is complete or that participants can see the result.
export function competitionLifecycle(competition, rounds = competition.competition_rounds || [], now = Date.now()) {
  const ordered = [...rounds].sort((a, b) => a.sequence - b.sequence);
  const last = ordered.at(-1);
  const published = ordered.filter(round => round.leaderboard_state === 'published').at(-1);
  const base = `/competition/${encodeURIComponent(competition.slug)}`;
  const state = (key, label, detail, action, href = base) => ({ key, label, detail, action, href });
  if (competition.status === 'draft') return state('draft', 'Draft', 'Only your organiser team can see this competition.', 'Continue setup', `/organiser/competition/${competition.slug}`);
  if (competition.status === 'cancelled') return state('cancelled', 'Cancelled', 'This competition is no longer accepting entries.', 'View details');
  if (last?.leaderboard_state === 'published') return state('completed', 'Completed', 'Final results are available. Previous rounds remain accessible.', 'View results', `${base}/leaderboard/${last.slug}`);
  if (now < Date.parse(competition.registration_opens_at)) return state('upcoming', 'Upcoming', 'Registration has not opened yet.', 'View requirements');
  if (now < Date.parse(competition.registration_closes_at)) return state('registration-open', 'Registration open', 'Check eligibility and choose your entry before the deadline.', 'View entry options');
  if (now < Date.parse(competition.starts_at)) return state('registration-closed', 'Registration closed', 'Registered entries are preparing for the first round.', 'View timeline');
  const round = ordered.find(item => item.leaderboard_state !== 'published');
  if (round && now >= Date.parse(round.submission_deadline)) {
    const scheduled = round.leaderboard_state === 'scheduled';
    return state('awaiting-results', scheduled ? 'Results scheduled' : 'Awaiting results', scheduled ? `${round.name} results will appear at the scheduled release.` : `${round.name} submissions have closed. Results are not published yet.`, scheduled ? 'View countdown' : 'View result status', `${base}/leaderboard/${round.slug}`);
  }
  return state('in-progress', 'In progress', round ? `${round.name} is the current round. Check its submission dates.` : 'The competition has started. Follow organiser updates.', 'View competition', published ? `${base}/leaderboard/${published.slug}` : base);
}

export function lifecycleMarkup(lifecycle, escapeHtml) {
  return `<span class="lifecycle-status ${escapeHtml(lifecycle.key)}" data-lifecycle="${escapeHtml(lifecycle.key)}">${escapeHtml(lifecycle.label)}</span>`;
}
