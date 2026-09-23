// Keep displayed age guidance aligned with Postgres current_date (UTC in Vertex).
export function participantAge(birthday, today = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday || '')) return null;
  const [year, month, day] = birthday.split('-').map(Number);
  let age = today.getUTCFullYear() - year;
  if (today.getUTCMonth() + 1 < month || (today.getUTCMonth() + 1 === month && today.getUTCDate() < day)) age--;
  return age;
}

export function ageMismatch(competition, birthday) {
  const age = participantAge(birthday);
  if (age === null) return 'Add your birthday in your profile to check age eligibility.';
  if (competition.minimum_age !== null && age < competition.minimum_age) return `You are ${age}. This competition requires age ${competition.minimum_age} or older.`;
  if (competition.maximum_age !== null && age > competition.maximum_age) return `You are ${age}. This competition is for age ${competition.maximum_age} or younger.`;
  return null;
}
