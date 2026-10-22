/*
 * Capture Discord's own /users/@me request and response, raw, straight from
 * the network stack - no extension rewriting involved. Shows the request
 * headers the client really sends and the account's server-side age fields.
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const RELOAD = (arg('--reload', '1')) === '1';

const cdp = await connect(PORT, { timeout: 20000 });
const targets = await cdp.targets();
const page = targets.find((t) => t.type === 'page' && /discord\.com/.test(t.url || ''));
if (!page) { console.log('no discord tab'); process.exit(1); }

try { await cdp.send('Target.activateTarget', { targetId: page.targetId }); } catch { /* ignore */ }
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
await cdp.send('Network.enable', {}, sessionId);
await cdp.send('Runtime.enable', {}, sessionId);

const hits = [];
const all = [];
const sockets = [];
cdp.on(async (msg) => {
  if (msg.sessionId !== sessionId) return;
  if (msg.method === 'Network.webSocketCreated') {
    sockets.push({ url: msg.params.url, protocol: msg.params.protocol, initiator: msg.params.initiator?.type });
  }
  if (msg.method === 'Network.requestWillBeSent') {
    const r = msg.params.request;
    all.push({ method: r.method, url: r.url.slice(0, 120) });
    if (/\/users\/@me(\?|$)/.test(r.url)) {
      hits.push({
        kind: 'request',
        url: r.url,
        headers: Object.fromEntries(Object.entries(r.headers).filter(([k]) =>
          /^(authorization|x-super-properties|x-discord|cookie|user-agent|content-type)$/i.test(k))),
      });
    }
  }
  if (msg.method === 'Network.responseReceived' && /\/users\/@me(\?|$)/.test(msg.params.response.url)) {
    hits.push({ kind: 'response', url: msg.params.response.url, status: msg.params.response.status });
    try {
      const b = await cdp.send('Network.getResponseBody', { requestId: msg.params.requestId }, sessionId);
      let j = null; try { j = JSON.parse(b.body); } catch { /* not json */ }
      if (j) {
        hits[hits.length - 1].user = {
          id: j.id, username: j.username, global_name: j.global_name,
          age_verification_status: j.age_verification_status,
          nsfw_allowed: j.nsfw_allowed,
          flags: j.flags, public_flags: j.public_flags,
          date_of_birth: j.date_of_birth,
          account_type: j.account_type,
        };
      } else {
        hits[hits.length - 1].raw = (b.body || '').slice(0, 200);
      }
    } catch (e) { hits[hits.length - 1].bodyError = e.message; }
  }
});

if (RELOAD) {
  await cdp.send('Page.navigate', { url: 'https://discord.com/app' }, sessionId);
}

await new Promise((r) => setTimeout(r, 12000));

console.log(JSON.stringify(hits, null, 2));
console.log('\napi calls seen (' + all.length + '):');
for (const a of all.slice(0, 40)) console.log('  ', a.method, a.url);
console.log('\nwebsockets:');
for (const s of sockets) console.log('  ', s.url, '| proto:', s.protocol, '| via:', s.initiator);

const stats = await cdp.evaluate(sessionId, 'window.__AGEGATE__ ? JSON.stringify(window.__AGEGATE__.stats) : null');
console.log('\nextension stats:', stats);
cdp.close();
