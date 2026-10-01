// Use an exact-ID manifest fetched through the connected Supabase app. This
// utility uses each fixture owner's session, never privileged credentials.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync('config.js', 'utf8'), sandbox);
const { SUPABASE_PROJECT_URL: url, SUPABASE_ANON_KEY: anon } = sandbox.window.VERTEX_CONFIG;
let removed = 0;
for (const account of manifest.accounts) {
  const files = manifest.objects.filter(object => object.owner_id === account.id);
  if (!files.length) continue;
  const match = account.email.match(/^vertex-e2e-[a-z0-9-]+-([a-f0-9]{14})@example\.com$/);
  assert(match && /^[a-f0-9-]{36}$/.test(account.id), 'Unexpected fixture identity.');
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: `Vertex!${match[1]}Aa` })
  });
  assert(response.ok, `Test owner login failed: ${response.status}`);
  const session = await response.json();
  assert.equal(session.user.id, account.id);
  const headers = { apikey: anon, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
  const call = async (path, method = 'GET', data) => {
    const r = await fetch(url + path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) });
    assert(r.ok, `Storage cleanup failed: ${r.status} ${path.split('?')[0]}`);
    return r.status === 204 ? null : r.json();
  };
  if (files.some(file => file.bucket_id === 'competition-banners')) {
    const competitions = await call(`/rest/v1/competitions?owner_id=eq.${account.id}`);
    for (const c of competitions.filter(c => files.some(file => file.name === c.banner_path))) {
      const rows = await call(`/rest/v1/competition_rounds?competition_id=eq.${c.id}&order=sequence`);
      const rounds = rows.map(({ competition_id, status, judging_state, leaderboard_state, leaderboard_published_at, ...round }) => round);
      await call('/rest/v1/rpc/save_competition', 'POST', { details: { ...c, banner_kind: 'colour', banner_path: null }, rounds, expected_version: c.version });
    }
  }
  for (const bucket of new Set(files.map(file => file.bucket_id))) {
    assert(['competition-banners', 'submissions', 'certificate-templates'].includes(bucket), 'Routine cleanup must not include identity images.');
    const prefixes = files.filter(file => file.bucket_id === bucket).map(file => file.name);
    await call(`/storage/v1/object/${bucket}`, 'DELETE', { prefixes });
    removed += prefixes.length;
  }
  await call('/auth/v1/logout?scope=global', 'POST');
}
console.log(`Removed ${removed} exact test uploads through Storage API.`);
