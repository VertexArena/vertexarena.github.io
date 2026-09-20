export const fields = ['mathematics', 'physics', 'chemistry', 'biology', 'programming', 'robotics', 'research', 'writing', 'design', 'business', 'debate', 'innovation', 'general STEM'];
export const roundDateKeys = ['opens_at', 'submission_deadline', 'judging_opens_at', 'judging_closes_at', 'leaderboard_releases_at'];
export const competitionDateKeys = ['registration_opens_at', 'registration_closes_at', 'starts_at', 'certificates_available_at'];
export const slugify = value => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
export function newRound(count = 3, sequence = 1) {
  return { id: crypto.randomUUID(), name: sequence === 1 ? 'Final round' : `Round ${sequence}`, slug: sequence === 1 ? 'final-round' : `round-${sequence}`, sequence, advancement_count: count, ...Object.fromEntries(roundDateKeys.map(key => [key, null])) };
}
export function newCompetition() {
  return { id: crypto.randomUUID(), name: '', slug: '', status: 'draft', organisation_id: null, field_tags: [], prize_details: '', description: '', minimum_age: null, maximum_age: null, team_mode: 'individual', minimum_team_size: null, maximum_team_size: null, categories: [], structure: 'direct3', banner_kind: 'colour', banner_colour: '#2563eb', banner_colour_end: '#0b1120', banner_path: null, certificate_status: 'not_planned', ...Object.fromEntries(competitionDateKeys.map(key => [key, null])) };
}
export function localDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}
export function timestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || localDate(date) !== value) throw new Error('Choose a valid local date and time. This time may fall inside a daylight-saving change.');
  return date.toISOString();
}
export function cleanRound(row) {
  return Object.fromEntries(['id','name','slug','sequence','advancement_count',...roundDateKeys].map(key => [key,row[key]]));
}
export function validate(c, rounds, publish = false) {
  if (c.name.trim().length < 2 || c.name.length > 160) throw new Error('Enter a competition name between 2 and 160 characters.');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.slug) || c.slug.length < 3 || c.slug.length > 100 || ['new','edit'].includes(c.slug)) throw new Error('Use a unique address with 3–100 lowercase letters, numbers or hyphens.');
  const range = (min,max,label,lower,upper) => { if ([min,max].some(n => n !== null && (!Number.isInteger(n) || n < lower || n > upper)) || (min !== null && max !== null && min > max)) throw new Error(`${label}: minimum must not exceed maximum; use whole numbers from ${lower} to ${upper}.`); };
  range(c.minimum_age,c.maximum_age,'Age range',0,120);
  if (c.team_mode !== 'individual') { range(c.minimum_team_size,c.maximum_team_size,'Team size',2,100); if(c.minimum_team_size === null || c.maximum_team_size === null) throw new Error('Set both minimum and maximum team size.'); }
  if (new Set(c.categories.map(v => v.toLowerCase())).size !== c.categories.length || c.categories.length > 30 || c.categories.some(v => v.length > 80)) throw new Error('Use up to 30 distinct categories, each at most 80 characters.');
  const before = (a,b,label,equal = false) => { if(a && b && (equal ? +new Date(a) > +new Date(b) : +new Date(a) >= +new Date(b))) throw new Error(label); };
  before(c.registration_opens_at,c.registration_closes_at,'Registration must open before its deadline.');
  before(c.registration_closes_at,c.starts_at,'Competition must start on or after registration closes.',true);
  if (publish && (!c.field_tags.length || !c.description.trim() || !c.prize_details.trim() || competitionDateKeys.slice(0,3).some(k => !c[k]))) throw new Error('Before publishing, add fields, description, prize details, and all registration and competition dates.');
  let release=c.starts_at, count=Infinity;
  if(!rounds.length || rounds.length>20) throw new Error('Use between 1 and 20 rounds.');
  const slugs=new Set();
  for(const r of rounds) {
    if(r.name.trim().length < 2 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.slug) || r.slug.length<2 || slugs.has(r.slug)) throw new Error('Give every round a name and distinct valid address.');
    slugs.add(r.slug);
    if(!Number.isInteger(r.advancement_count) || r.advancement_count < 1 || r.advancement_count > 1000000 || r.advancement_count >= count) throw new Error('Top X must be positive and decrease in each later round.');
    count=r.advancement_count;
    before(release,r.opens_at,'Each round must open after the competition start and previous results release.',true);
    before(r.opens_at,r.submission_deadline,'Round submissions must close after the round opens.');
    before(r.submission_deadline,r.leaderboard_releases_at,'Results must release on or after submissions close.',true);
    if(Boolean(r.judging_opens_at)!==Boolean(r.judging_closes_at)) throw new Error('Set both judging dates, or leave both empty.');
    before(r.submission_deadline,r.judging_opens_at,'Judging must start after submissions close.',true);
    before(r.judging_opens_at,r.judging_closes_at,'Judging must end after it starts.');
    before(r.judging_closes_at,r.leaderboard_releases_at,'Results must release after judging ends.',true);
    if(publish && ['opens_at','submission_deadline','leaderboard_releases_at'].some(k=>!r[k])) throw new Error('Every round needs an opening, submission deadline and results release.');
    release=r.leaderboard_releases_at || release;
  }
  if(c.structure==='direct3' && (rounds.length!==1 || rounds[0].advancement_count!==3) || c.structure==='directx' && rounds.length!==1 || c.structure==='100-30-3' && rounds.map(r=>r.advancement_count).join(',')!=='100,30,3') throw new Error('Round advancement must match the selected structure.');
  before(release,c.certificates_available_at,'Certificates cannot be available before final results.',true);
  if(c.certificate_status==='not_planned' && c.certificates_available_at) throw new Error('Plan certificates before setting availability.');
}
