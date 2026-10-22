/*
 * Why does Discord's client get "Missing access to age-gated content" (50269)
 * on a channel that answers 200 for a hand-made request?
 *
 * Captures the client's own request, then replays the same call from an
 * iframe with different header sets to find the difference.
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const CHANNEL = arg('--channel', '1499670807146664049');
const GUILD = arg('--guild', '1499516436752634096');
const WAIT = Number(arg('--wait', '20000'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });

// scratch tab on the age-gated channel
const url = 'https://discord.com/channels/' + GUILD + '/' + CHANNEL;
const r = await cdp.send('Target.createTarget', { url, background: true });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: r.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
for (let i = 0; i < 8; i++) {
  try { await cdp.send('Runtime.enable', {}, sessionId); break; } catch (e) { await sleep(1200); }
}
await cdp.send('Network.enable', {}, sessionId);

let clientReq = null;
cdp.on((msg) => {
  if (msg.sessionId !== sessionId) return;
  if (msg.method === 'Network.requestWillBeSent' && msg.params.request.url.includes('/channels/' + CHANNEL + '/messages')) {
    if (!clientReq) {
      const h = msg.params.request.headers;
      clientReq = { url: msg.params.request.url, headerNames: Object.keys(h), headers: h };
    }
  }
});

await cdp.send('Page.reload', {}, sessionId);
await sleep(WAIT);

if (clientReq) {
  console.log('client request url:', clientReq.url);
  console.log('client header names:', clientReq.headerNames.join(', '));
} else {
  console.log('no client message request captured');
}

// replay from an iframe
const expr = `(async () => {
  const CHANNEL = ${JSON.stringify(CHANNEL)};
  const CLIENT_HEADERS = ${JSON.stringify(clientReq ? clientReq.headers : null)};
  const fr = document.createElement('iframe');
  fr.style.display = 'none';
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  const ls = w.localStorage;
  let token = ls.getItem('token');
  try { token = JSON.parse(token); } catch (e) {}
  let dp = null;
  try { dp = JSON.parse(ls.getItem('deviceProperties')); } catch (e) {}
  const mine = { Authorization: token, 'Content-Type': 'application/json' };
  if (dp) mine['X-Super-Properties'] = btoa(JSON.stringify(dp));

  const out = {};
  const go = async (label, path, headers) => {
    try {
      const r = await w.fetch(path, { headers, credentials: 'include', cache: 'no-store' });
      const txt = await r.text();
      let j = null; try { j = JSON.parse(txt); } catch (e) {}
      out[label] = { http: r.status, body: Array.isArray(j) ? { count: j.length } : (j && j.message ? { message: j.message, code: j.code } : (j ? Object.keys(j).slice(0, 6) : txt.slice(0, 120))) };
    } catch (e) { out[label] = { error: String(e) }; }
  };

  await go('mine limit=5', '/api/v9/channels/' + CHANNEL + '/messages?limit=5', mine);
  await go('mine limit=12', '/api/v9/channels/' + CHANNEL + '/messages?limit=12', mine);
  await go('mine limit=50', '/api/v9/channels/' + CHANNEL + '/messages?limit=50', mine);
  await go('no super-properties', '/api/v9/channels/' + CHANNEL + '/messages?limit=12', { Authorization: token });
  if (CLIENT_HEADERS) {
    const h = Object.assign({}, CLIENT_HEADERS);
    delete h['Cookie']; delete h['Host']; delete h['Origin']; delete h['Referer'];
    delete h['Content-Length'];
    await go('client headers', '/api/v9/channels/' + CHANNEL + '/messages?limit=12', h);
    const h2 = Object.assign({}, h);
    delete h2['X-Super-Properties'];
    await go('client headers minus superprops', '/api/v9/channels/' + CHANNEL + '/messages?limit=12', h2);
  }
  fr.remove();
  return out;
})()`;

const res = await cdp.evaluate(sessionId, expr);
console.log('\nreplay results:');
for (const [k, v] of Object.entries(res)) console.log('  ' + k.padEnd(32), JSON.stringify(v));

try { await cdp.send('Target.closeTarget', { targetId: r.targetId }); } catch { /* ignore */ }
cdp.close();
