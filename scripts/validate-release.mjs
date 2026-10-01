import { readFile, readdir, stat } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const sandbox = { window: {} };
vm.runInNewContext(await readFile('config.js', 'utf8'), sandbox);
const config = sandbox.window.VERTEX_CONFIG;
assert.equal(config.SUPABASE_PROJECT_URL, 'https://hbadiyiopvypeffaigmc.supabase.co');
const claims = JSON.parse(Buffer.from(config.SUPABASE_ANON_KEY.split('.')[1], 'base64url'));
assert.equal(claims.role, 'anon', 'Browser key must remain public anon key.');
assert.equal(claims.ref, 'hbadiyiopvypeffaigmc');

const manifest = JSON.parse(await readFile('manifest.webmanifest', 'utf8'));
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.scope, '/');
for (const icon of manifest.icons) await stat(icon.src.replace(/^\//, ''));

const migrations = (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
// Bootstrap uses one transaction around the historical sections. Transaction
// wrappers and source comments may differ, but every executable statement must
// remain in the same order within each immutable migration.
const canonical = sql => sql.replaceAll('\r\n', '\n').replace(/^--.*$/gm, '').replace(/^(?:begin|commit);\s*$/gmi, '').replace(/\s+/g, ' ').trim();
const schema = canonical(await readFile('SCHEMA.sql', 'utf8'));
for (const name of migrations) {
  const sql = canonical(await readFile(`supabase/migrations/${name}`, 'utf8'));
  assert(schema.includes(sql), `SCHEMA.sql is missing immutable migration ${name}.`);
}
for (const document of ['index.html', '404.html', 'offline.html']) {
  const html = await readFile(document, 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(\/[^"?#]+\.(?:js|css|png|webmanifest|html))"/g)) await stat(match[1].slice(1));
}
for (const folder of ['js', 'css']) for (const name of await readdir(folder)) {
  const source = await readFile(`${folder}/${name}`, 'utf8');
  assert(!/SUPABASE_SERVICE_ROLE_KEY|sb_secret_|-----BEGIN PRIVATE KEY-----/.test(source), `Privileged credential marker in ${folder}/${name}`);
  assert(!/\b(?:TODO|FIXME)\b/.test(source), `Unfinished work in ${folder}/${name}`);
}
console.log(`Release files valid; ${migrations.length} immutable migrations consolidated; browser key is anon.`);
