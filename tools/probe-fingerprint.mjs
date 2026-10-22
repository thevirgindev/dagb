/*
 * The client's own X-Super-Properties is what makes Discord refuse
 * age-gated content (403 / 50269 "Missing access to age-gated content").
 * Any other fingerprint value passes. Find out which parts of the value
 * matter, so the extension can move it without breaking anything else.
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
const url = 'https://discord.com/channels/' + GUILD + '/' + CHANNEL;
const r = await cdp.send('Target.createTarget', { url, background: true });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: r.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
for (let i = 0; i < 8; i++) {
  try { await cdp.send('Runtime.enable', {}, sessionId); break; } catch (e) { await sleep(1200); }
}
await cdp.send('Network.enable', {}, sessionId);
try { await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId); } catch { /* ignore */ }

let clientSP = null;
let clientHeaders = null;
cdp.on((msg) => {
  if (msg.sessionId !== sessionId) return;
  if (msg.method === 'Network.requestWillBeSent' && !clientSP) {
    const h = msg.params.request.headers;
    const sp = h['X-Super-Properties'] || h['x-super-properties'];
    if (sp && /discord\.com\/api/.test(msg.params.request.url)) {
      clientHeaders = h;
      clientSP = sp;
    }
  }
});

await cdp.send('Page.reload', {}, sessionId);
await sleep(WAIT);
if (!clientSP) {
  console.log('still no super-properties captured, waiting more...');
  await sleep(8000);
}

if (!clientSP) { console.log('no client super-properties captured'); process.exit(1); }
let decoded = null;
try { decoded = JSON.parse(atob(clientSP)); } catch (e) { decoded = null; }
console.log('client super-properties keys:', decoded ? Object.keys(decoded).join(', ') : '(not base64 json)');
if (decoded) console.log('client super-properties:', JSON.stringify(decoded));

const expr = `(async () => {
  const CHANNEL = ${JSON.stringify(CHANNEL)};
  const SP = ${JSON.stringify(clientSP)};
  const H = ${JSON.stringify(clientHeaders)};
  const fr = document.createElement('iframe');
  fr.style.display = 'none';
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  const ls = w.localStorage;
  let token = ls.getItem('token');
  try { token = JSON.parse(token); } catch (e) {}
  const base = Object.assign({}, H);
  delete base['Cookie']; delete base['Host']; delete base['Origin']; delete base['Referer'];
  delete base['Content-Length']; delete base['X-Super-Properties']; delete base['x-super-properties'];

  const out = {};
  const go = async (label, sp) => {
    const h = Object.assign({}, base);
    if (sp) h['X-Super-Properties'] = sp;
    try {
      const resp = await w.fetch('/api/v9/channels/' + CHANNEL + '/messages?limit=12', { headers: h, credentials: 'include', cache: 'no-store' });
      const txt = await resp.text();
      let j = null; try { j = JSON.parse(txt); } catch (e) {}
      out[label] = { http: resp.status, body: Array.isArray(j) ? { count: j.length } : (j && j.message ? { message: j.message, code: j.code } : txt.slice(0, 100)) };
    } catch (e) { out[label] = { error: String(e) }; }
  };

  const enc = (o) => btoa(JSON.stringify(o));
  const baseObj = JSON.parse(atob(SP));

  await go('exact client SP', SP);
  await go('no SP at all', null);

  const extra = Object.assign({}, baseObj); extra.bypass = '1';
  await go('SP + extra field', enc(extra));

  const reordered = {};
  for (const k of Object.keys(baseObj).reverse()) reordered[k] = baseObj[k];
  await go('SP keys reordered', enc(reordered));

  const bumped = Object.assign({}, baseObj);
  if (bumped.browser_build_number !== undefined) bumped.browser_build_number = String(Number(bumped.browser_build_number) + 1);
  await go('SP browser_build_number +1', enc(bumped));

  const osv = Object.assign({}, baseObj);
  if (osv.os_version !== undefined) osv.os_version = String(osv.os_version) + '.1';
  await go('SP os_version changed', enc(osv));

  const dev = Object.assign({}, baseObj);
  if (dev.device !== undefined) dev.device = dev.device + ' ';
  await go('SP device padded', enc(dev));

  const noRef = Object.assign({}, baseObj);
  delete noRef.referrer; delete noRef.referring_domain; delete noRef.referrer_current; delete noRef.referring_domain_current;
  await go('SP without referrer fields', enc(noRef));

  const noBuild = Object.assign({}, baseObj);
  delete noBuild.browser_build_number; delete noBuild.client_build_number;
  await go('SP without build numbers', enc(noBuild));

  fr.remove();
  return out;
})()`;

const res = await cdp.evaluate(sessionId, expr);
console.log('\nresults:');
for (const [k, v] of Object.entries(res)) console.log('  ' + k.padEnd(28), JSON.stringify(v));

try { await cdp.send('Target.closeTarget', { targetId: r.targetId }); } catch { /* ignore */ }
cdp.close();
