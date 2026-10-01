import webpush from 'npm:web-push@3.6.7';

// A custom Vault-backed worker credential authenticates cron calls. Browser
// JWTs and the public anon key cannot invoke this delivery worker.
const url = Deno.env.get('SUPABASE_URL')!;
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function rpc(name: string, body: object = {}) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const detail=await response.json().catch(()=>({}));
    const error=new Error(`Database operation failed (${response.status}, ${detail.code || 'unknown'}).`);
    throw error;
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
const allowedEndpoint = (value: string) => {
  const endpoint = new URL(value);
  return endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password && !endpoint.port &&
    (['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(endpoint.hostname) ||
      /^[a-z0-9-]+\.notify\.windows\.com$/.test(endpoint.hostname));
};

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const token = request.headers.get('x-vertex-worker') || '';
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response('Unauthorized', { status: 401 });
  let operation='authorize';
  try {
    if (!await rpc('push_worker_authorized', { worker_token: token })) return new Response('Unauthorized', { status: 401 });
    operation='read signing keys';
    let vapid = await rpc('push_worker_keys');
    if (!vapid.publicKey) {
      operation='generate signing keys';
      const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
      const jwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
      const raw=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
      const publicKey=btoa(String.fromCharCode(...raw)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      const keys={publicKey,privateKey:jwk.d!};
      operation='store signing keys';
      vapid = await rpc('push_worker_keys', { new_public: keys.publicKey, new_private: keys.privateKey });
    }
    let sent = 0, failed = 0;
    const started = Date.now();
    for (let batch = 0; batch < 10 && Date.now() - started < 45000; batch++) {
      operation='claim delivery batch';
      const jobs = await rpc('push_claim_batch');
      if (!jobs.length) break;
      for (let start = 0; start < jobs.length; start += 10) {
        await Promise.all(jobs.slice(start,start + 10).map(async (job: any) => {
          let status = 0;
          try {
            if (!allowedEndpoint(job.endpoint)) throw new Error('Invalid push service.');
            const payload = JSON.stringify({ recipient: job.recipient, notificationId: job.notificationId,
              title: job.title, body: job.body, path: job.path });
            const details = webpush.generateRequestDetails({ endpoint: job.endpoint, keys: job.keys }, payload,
              { vapidDetails: vapid, TTL: 86400, urgency: 'high', contentEncoding: 'aes128gcm' });
            const response = await fetch(details.endpoint, { method: 'POST', headers: details.headers,
              body: new Uint8Array(details.body), redirect: 'error', signal: AbortSignal.timeout(5000) });
            status = response.status;
            await response.body?.cancel();
          } catch { /* Transient failures retry with bounded database backoff. */ }
          await rpc('push_finish_delivery', { target_id: job.id, target_lease: job.lease, http_status: status });
          status >= 200 && status < 300 ? sent++ : failed++;
        }));
      }
    }
    return Response.json({ sent, failed });
  } catch(error) {
    // Do not log signing keys, credentials, endpoint URLs or private messages.
    return Response.json({ error: 'Push delivery is temporarily unavailable.', operation,
      reason:error instanceof Error && /^Database operation failed \([0-9]+, [A-Z0-9a-z]+\)\.$/.test(error.message) ? error.message : 'Worker operation failed.' }, { status: 503 });
  }
});
