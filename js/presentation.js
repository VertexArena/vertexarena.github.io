// Display vocabulary is separate from persisted values and user-authored text.
const labels = {
  participant: 'Participant', organiser: 'Organiser', organisation: 'Organisation',
  individual: 'Individual', team: 'Team', both: 'Individual or team',
  draft: 'Draft', published: 'Published', unpublished: 'Not published', scheduled: 'Scheduled',
  upcoming: 'Upcoming', active: 'Active', completed: 'Completed',
  not_started: 'Not started', in_progress: 'In progress', finalised: 'Finalised',
  pending: 'Pending', accepted: 'Accepted', declined: 'Declined', cancelled: 'Cancelled',
  advanced: 'Advanced', eliminated: 'Eliminated', winner: 'Winner', eligible: 'Eligible',
  not_planned: 'Not planned', planned: 'Planned', template_ready: 'Template ready',
  file: 'Files', link: 'Links', mixed: 'Files and links', valid: 'Valid', late: 'Late', missing: 'Missing',
  participation: 'Participation', finalist: 'Finalist', category_winner: 'Category winner',
  overall_winner: 'Overall winner', custom: 'Custom', placement: 'Placement',
  mathematics: 'Mathematics', physics: 'Physics', chemistry: 'Chemistry', biology: 'Biology',
  programming: 'Programming', robotics: 'Robotics', research: 'Research', writing: 'Writing',
  design: 'Design', business: 'Business', debate: 'Debate', innovation: 'Innovation', 'general STEM': 'General STEM'
};
export const displayLabel = value => labels[value] ?? String(value ?? '').replaceAll('_', ' ').replace(/^\w/, letter => letter.toUpperCase());
export const fieldLabels = values => (values || []).map(displayLabel).join(' · ');
export const dashboardPath = accountType => accountType === 'organiser' ? '/organiser' : '/dashboard';

export function competitionSections(path, accountType) {
  const match = path.match(/^\/(organiser\/)?competition\/([a-z0-9-]+)(?:\/(.*))?$/);
  if (!match || (match[1] && match[2] === 'new') || match[3]?.startsWith('meeting/')) return null;
  const manager = Boolean(match[1]), slug = match[2], current = match[3] || '';
  const base = `${manager ? '/organiser' : ''}/competition/${slug}`;
  const sections = manager
    ? [['workspace','Overview'],['participants','Entries'],['submissions','Submissions'],['scoring','Judging'],['leaderboards','Leaderboards'],['certificates','Certificates']]
    : [['','Overview'],['announcements','Announcements'],['questions','Questions & answers'],['meetings','Meetings'],['submissions','Submissions'],['leaderboard','Leaderboards'],...(accountType === 'participant' ? [['progress','My round history']] : []),['certificates','Certificates']];
  return sections.map(([section, label]) => ({
    href: `${base}${section ? `/${section}` : ''}`, label,
    current: current === section || (section && current.startsWith(`${section}/`)) || (manager && section === 'scoring' && current === 'advancement') || (!manager && section === 'leaderboard' && current.startsWith('scores/'))
  }));
}
