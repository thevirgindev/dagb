/*
 * Round 2: which fields of X-Super-Properties does the server use to decide
 * that a request comes from the known (unverified) device?
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const CHANNEL = arg('--channel', '1499670807146664049');
const GUILD = arg('--guild', '1499516436752634096');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });
const url = 'https://discord.com/channels/' + GUILD + '/' + CHANNEL;
const r = await cdp.send('Target.createTarget', { url, background: true });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: r.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
await cdp.send('Network.enable', {}, sessionId);
await cdp.send('Runtime.enable', {}, sessionId);
try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }

let sp = null, spHeaders = null;
cdp.on((m) => {
  if (m.sessionId !== sessionId) return;
  if (m.method === 'Network.requestWillBeSent' && !sp && /discord\.com\/api/.test(m.params.request.url)) {
    const h = m.params.request.headers;
    const s = h['X-Super-Properties'] || h['x-super-properties'];
    if (s) { sp = s; spHeaders = h; }
  }
});
for (let i = 0; i < 40 && !sp; i++) await sleep(500);
if (!sp) { console.log('no SP captured'); process.exit(1); }
console.log('captured SP');

const expr = `(async () => {
  const CHANNEL = ${JSON.stringify(CHANNEL)};
  const SP = ${JSON.stringify(sp)};
  const H = ${JSON.stringify(spHeaders)};
  const fr = document.createElement('iframe');
  fr.style.display = 'none';
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  const base = Object.assign({}, H);
  for (const k of ['Cookie','Host','Origin','Referer','Content-Length','X-Super-Properties','x-super-properties']) delete base[k];
  const obj = JSON.parse(atob(SP));
  const enc = (o) => btoa(JSON.stringify(o));
  const out = {};
  const go = async (label, spValue, uaOverride) => {
    const h = Object.assign({}, base);
    if (spValue) h['X-Super-Properties'] = spValue;
    if (uaOverride) h['User-Agent'] = uaOverride;
    try {
      const resp = await w.fetch('/api/v9/channels/' + CHANNEL + '/messages?limit=12', { headers: h, credentials: 'include', cache: 'no-store' });
      const txt = await resp.text();
      let j = null; try { j = JSON.parse(txt); } catch (e) {}
      out[label] = resp.status + ' ' + (Array.isArray(j) ? 'count=' + j.length : (j && j.message ? j.code + ' ' + j.message : txt.slice(0, 70)));
    } catch (e) { out[label] = 'ERR ' + String(e); }
  };
  const drop = (keys) => { const o = Object.assign({}, obj); for (const k of keys) delete o[k]; return enc(o); };

  await go('exact SP', SP);
  await go('minus browser_user_agent', drop(['browser_user_agent']));
  await go('minus referrer group', drop(['referrer','referring_domain','referrer_current','referring_domain_current']));
  await go('minus release_channel', drop(['release_channel']));
  await go('minus client_event_source', drop(['client_event_source']));
  await go('minus ua+referrer', drop(['browser_user_agent','referrer','referring_domain','referrer_current','referring_domain_current']));
  await go('minus release_channel+event', drop(['release_channel','client_event_source']));

  const ua2 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
  const o2 = Object.assign({}, obj);
  o2.browser_user_agent = ua2; o2.browser_version = '154.0.0.0';
  await go('SP+UA downgraded to 154', enc(o2), ua2);

  const o3 = Object.assign({}, obj);
  delete o3.browser_user_agent; delete o3.browser_version;
  await go('minus ua and version', enc(o3));

  fr.remove();
  return out;
})()`;

const res = await cdp.evaluate(sessionId, expr);
console.log('\nresults:');
for (const [k, v] of Object.entries(res)) console.log('  ' + k.padEnd(30), v);

try { await cdp.send('Target.closeTarget', { targetId: r.targetId }); } catch { /* ignore */ }
cdp.close();
