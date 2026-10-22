/*
 * Try every shape Discord's own client would use to assert a birthday, and see
 * whether any of them is accepted and flips age_verification_status.
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

  const attempts = [
    ['PATCH', '/api/v9/users/@me', { date_of_birth: '1995-06-15' }],
    ['PATCH', '/api/v10/users/@me', { date_of_birth: '1995-06-15' }],
    ['PATCH', '/api/v9/users/@me', { birthday: '1995-06-15' }],
    ['PATCH', '/api/v9/users/@me', { date_of_birth: { year: 1995, month: 6, day: 15 } }],
    ['PATCH', '/api/v9/users/@me', { date_of_birth: '1995-06-15T00:00:00.000Z' }],
    ['GET', '/api/v9/users/@me/age-verification/check', null],
    ['GET', '/api/v9/age-verification/methods', null],
    ['GET', '/api/v9/users/@me/age-signal', null],
  ];
  const out = [];
  for (const [method, path, body] of attempts) {
    try {
      const init = { method, headers, credentials: 'include', cache: 'no-store' };
      if (body) init.body = JSON.stringify(body);
      const r = await w.fetch(path, init);
      const txt = await r.text();
      let j = null; try { j = JSON.parse(txt); } catch (e) {}
      let summary;
      if (j && j.id) summary = { age_verification_status: j.age_verification_status, nsfw_allowed: j.nsfw_allowed, date_of_birth: j.date_of_birth, flags: j.flags };
      else if (j) summary = { code: j.code, message: j.message, data: j.data, keys: Object.keys(j).slice(0, 12) };
      else summary = txt.slice(0, 200);
      out.push({ method, path, body, status: r.status, summary });
    } catch (e) { out.push({ method, path, body, error: String(e) }); }
    await new Promise((r) => setTimeout(r, 600));
  }
  const after = await w.fetch('/api/v10/users/@me', { headers, credentials: 'include', cache: 'no-store' });
  const aj = await after.json().catch(() => null);
  fr.remove();
  return { attempts: out, finalStatus: after.status, final: aj ? { age_verification_status: aj.age_verification_status, nsfw_allowed: aj.nsfw_allowed } : null };
})()`;

const res = await cdp.evaluate(sessionId, expr);
console.log(JSON.stringify(res, null, 2));
try { await cdp.send('Target.closeTarget', { targetId: tab.targetId }); } catch { /* ignore */ }
cdp.close();
