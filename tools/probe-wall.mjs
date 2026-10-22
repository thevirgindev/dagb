/*
 * Map the remaining server-side wall: what the age-verification flow expects,
 * what the age-signal attestation looks like, and what the reactive check says.
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const WAIT = Number(arg('--wait', '14000'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });
const tab = await cdp.send('Target.createTarget', { url: 'about:blank', background: true });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
for (let i = 0; i < 8; i++) {
  try { await cdp.send('Runtime.enable', {}, sessionId); break; } catch (e) { await sleep(1500); }
}
await cdp.send('Page.navigate', { url: 'https://discord.com/app' }, sessionId);
await sleep(WAIT);

const expr = `(async () => {
  const fr = document.createElement('iframe');
  fr.style.display = 'none';
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  const ls = w.localStorage;
  let token = ls.getItem('token');
  try { token = JSON.parse(token); } catch (e) {}
  let dp = null;
  try { dp = JSON.parse(ls.getItem('deviceProperties')); } catch (e) {}
  const headers = { Authorization: token, 'Content-Type': 'application/json' };
  if (dp) headers['X-Super-Properties'] = btoa(JSON.stringify(dp));

  const call = async (method, path, body) => {
    try {
      const init = { method, headers, credentials: 'include', cache: 'no-store' };
      if (body !== undefined) init.body = JSON.stringify(body);
      const r = await w.fetch(path, init);
      const txt = await r.text();
      let j = null; try { j = JSON.parse(txt); } catch (e) {}
      return { http: r.status, body: j || txt.slice(0, 300) };
    } catch (e) { return { error: String(e) }; }
  };

  const out = {};
  out.methods = await call('GET', '/api/v9/age-verification/methods');
  out.methodsV2 = await call('GET', '/api/v9/age-verification/methods/v2');
  out.attestKey = await call('GET', '/api/v9/users/@me/age-signal/attest-key');
  out.challenge = await call('POST', '/api/v9/users/@me/age-signal/challenge', {});
  out.signalEmpty = await call('POST', '/api/v9/users/@me/age-signal', {});
  out.signalDob = await call('POST', '/api/v9/users/@me/age-signal', { date_of_birth: '1995-06-15' });
  out.reactiveCheck = await call('GET', '/api/v9/users/@me/age-verification/check');
  out.reactiveCheckPost = await call('POST', '/api/v9/users/@me/age-verification/check', {});
  const me = await call('GET', '/api/v10/users/@me');
  if (me.body && me.body.id) {
    const u = me.body;
    out.meAgeish = {};
    for (const k of Object.keys(u)) if (/age|adult|nsfw|verif|assurance|safety|birthday|date_of|premium_usage/i.test(k)) out.meAgeish[k] = u[k];
    out.mePremiumUsageFlags = u.premium_usage_flags;
    out.meFlags = u.flags;
  }
  fr.remove();
  return out;
})()`;

const res = await cdp.evaluate(sessionId, expr);
console.log(JSON.stringify(res, null, 2));
try { await cdp.send('Target.closeTarget', { targetId: tab.targetId }); } catch { /* ignore */ }
cdp.close();
