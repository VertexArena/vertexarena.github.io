import fs from 'node:fs';

const file = '.test-data/accounts.ndjson';
if (!fs.existsSync(file)) {
  console.log('No recorded test accounts.');
  process.exit(0);
}
const records = [...new Map(fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => {
  const row = JSON.parse(line);
  if (!/^[a-f0-9-]{36}$/i.test(row.id) || !/^vertex-e2e-[a-z0-9-]+@example\.com$/i.test(row.email)) {
    throw new Error('Unexpected account in cleanup manifest. Review it manually.');
  }
  return [row.id, row];
})).values()];
const values = records.map(row => `  ('${row.id}'::uuid, '${row.email}')`).join(',\n');
const sql = `-- User-requested manual cleanup, not an application migration.
-- First delete these accounts' uploaded files through Supabase Storage.
-- Exact ID AND email must match; no wildcard account deletion.
begin;
create temporary table vertex_test_cleanup (id uuid primary key, email text) on commit drop;
insert into vertex_test_cleanup (id, email) values
${values};
delete from vertex_test_cleanup t where not exists (
  select 1 from auth.users u where u.id = t.id and u.email = t.email
);
do $$
begin
  if exists (select 1 from storage.objects o join vertex_test_cleanup t
    on o.owner_id = t.id::text or split_part(o.name, '/', 1) = t.id::text) then
    raise exception 'Delete test uploads through Supabase Storage before running account cleanup. Do not delete storage.objects rows directly.';
  end if;
end;
$$;
delete from public.organisation_memberships m where
  m.organiser_id in (select id from vertex_test_cleanup)
  or m.invited_by in (select id from vertex_test_cleanup)
  or m.organisation_id in (select id from public.organisations where management_profile_id in (select id from vertex_test_cleanup));
delete from public.organisations where management_profile_id in (select id from vertex_test_cleanup);
delete from auth.users u using vertex_test_cleanup t where u.id = t.id and u.email = t.email returning u.id, u.email;
commit;
`;
fs.writeFileSync('.test-data/cleanup.sql', sql);
fs.writeFileSync('.test-data/CLEANUP.md', `# Test accounts to remove manually\n\n${records.length} accounts recorded in this run. No real accounts are listed.\n\n1. Open Supabase Storage. In profile-pictures and organisation-logos, remove uploaded files inside the UUID folders listed below. Use Storage controls, never direct SQL deletion of storage.objects.\n2. Review cleanup.sql in this folder, then run it in Supabase SQL Editor. It checks exact account ID and email, refuses to proceed if uploads remain, and removes test memberships, organisations, Auth users, and their cascading profiles. It changes no application schema.\n3. Confirm these test emails no longer appear in Auth.\n\nOlder test runs predate this manifest. Review any other Auth emails beginning vertex-e2e- separately before deleting them.\n\n| Account email | Storage folder / account ID |\n| --- | --- |\n${records.map(row => `| ${row.email} | ${row.id} |`).join('\n')}\n`);
console.log(`Cleanup checklist and exact-ID SQL written for ${records.length} test accounts.`);
