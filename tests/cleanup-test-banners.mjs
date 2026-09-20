// Run after tests, before connector account cleanup. Uses only each test user's
// own authenticated session and the Storage API; never deletes Storage SQL rows.
import fs from 'node:fs';
import vm from 'node:vm';
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync('config.js','utf8'),sandbox);
const {SUPABASE_PROJECT_URL:url,SUPABASE_ANON_KEY:anon}=sandbox.window.VERTEX_CONFIG;
const accounts=[...new Map(fs.readFileSync('.test-data/accounts.ndjson','utf8').trim().split('\n').map(s=>JSON.parse(s)).map(a=>[a.id,a])).values()];
let removed=0;
for(const account of accounts) {
  const match=account.email.match(/^vertex-e2e-m4-([a-f0-9]{14})@example\.com$/);
  if(!match)continue;
  const response=await fetch(`${url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:`Vertex!${match[1]}Aa`})});
  if(!response.ok)continue; // Previously deleted test accounts remain in the audit file.
  const session=await response.json();if(session.user.id!==account.id)throw new Error('Test account identity mismatch');
  const headers={apikey:anon,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'};
  const call=async(path,method='GET',body)=>{const r=await fetch(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw new Error(`Cleanup failed (${r.status}) for ${account.id}: ${path.split('?')[0]}`);return r.status===204?null:r.json();};
  const competitions=await call(`/rest/v1/competitions?owner_id=eq.${account.id}`);
  for(const c of competitions.filter(c=>c.banner_path)) {
    const rows=await call(`/rest/v1/competition_rounds?competition_id=eq.${c.id}&order=sequence`);
    const rounds=rows.map(({competition_id,status,judging_state,leaderboard_state,...r})=>r);
    await call('/rest/v1/rpc/save_competition','POST',{details:{...c,banner_kind:'colour',banner_path:null},rounds,expected_version:c.version});
  }
  async function clean(prefix) {
    const rows=await call('/storage/v1/object/list/competition-banners','POST',{prefix,limit:1000});
    for(const row of rows) {
      if(!row.id)await clean(`${prefix}/${row.name}`);
      else {await call('/storage/v1/object/competition-banners','DELETE',{prefixes:[`${prefix}/${row.name}`]});removed++;}
    }
  }
  await clean(account.id);
  await fetch(`${url}/auth/v1/logout?scope=global`,{method:'POST',headers});
}
console.log(`Removed ${removed} remaining test competition banner objects.`);
