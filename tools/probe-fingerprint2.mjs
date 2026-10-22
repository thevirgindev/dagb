/*
 * Which part of X-Super-Properties makes Discord refuse age-gated content?
 * Find a minimal, stable edit that passes without looking like tampering.
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
console.log('captured SP on the client');

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

  const go = async (label, spValue) => {
    const h = Object.assign({}, base);
    if (spValue) h['X-Super-Properties'] = spValue;
    try {
      const resp = await w.fetch('/api/v9/channels/' + CHANNEL + '/messages?limit=12', { headers: h, credentials: 'include', cache: 'no-store' });
      const txt = await resp.text();
      let j = null; try { j = JSON.parse(txt); } catch (e) {}
      out[label] = resp.status + ' ' + (Array.isArray(j) ? 'count=' + j.length : (j && j.message ? j.code + ' ' + j.message : txt.slice(0, 60)));
    } catch (e) { out[label] = 'ERR ' + String(e); }
  };

  await go('exact SP', SP);

  const noSession = Object.assign({}, obj);
  delete noSession.client_launch_id; delete noSession.launch_signature;
  delete noSession.client_heartbeat_session_id; delete noSession.client_app_state;
  await go('SP without session ids', enc(noSession));

  const randLaunch = Object.assign({}, obj);
  randLaunch.client_launch_id = '00000000-0000-4000-8000-000000000001';
  await go('SP with fixed launch id', enc(randLaunch));

  const dmn = Object.assign({}, obj);
  dmn.device_model_name = 'Robio';
  await go('SP device_model_name=Robio', enc(dmn));

  const osv = Object.assign({}, obj);
  osv.os_version = '10.0';
  await go('SP os_version=10.0', enc(osv));

  const bv = Object.assign({}, obj);
  bv.browser_version = '155.0.0.1';
  await go('SP browser_version bumped', enc(bv));

  const extra = Object.assign({}, obj);
  extra.browser_build_number = 643187;
  await go('SP browser_build_number+1', enc(extra));

  const subset = { os: obj.os, browser: obj.browser, device: obj.device, device_model_name: obj.device_model_name, system_locale: obj.system_locale, has_client_mods: obj.has_client_mods };
  await go('SP = deviceProperties subset', enc(subset));

  const noLoc = Object.assign({}, obj);
  noLoc.system_locale = 'en-US';
  await go('SP system_locale=en-US', enc(noLoc));

  const noUa = Object.assign({}, obj);
  noUa.browser_user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
  await go('SP same UA', enc(noUa));

  const reordered = {};
  for (const k of Object.keys(obj).reverse()) reordered[k] = obj[k];
  await go('SP reordered keys', enc(reordered));

  fr.remove();
  return out;
})()`;

const res = await cdp.evaluate(sessionId, expr);
console.log('\nresults:');
for (const [k, v] of Object.entries(res)) console.log('  ' + k.padEnd(30), v);

try { await cdp.send('Target.closeTarget', { targetId: r.targetId }); } catch { /* ignore */ }
cdp.close();
