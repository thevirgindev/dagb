/*
 * Try the server-side route: assert an adult date_of_birth on the account and
 * see whether Discord flips age_verification_status to VERIFIED_ADULT.
 * Runs raw (iframe, no extension rewriting) so we see the server's real answer.
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const DOB = arg('--dob', '1995-06-15');
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
  const DOB = ${JSON.stringify(DOB)};
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

  const grab = (j) => j ? {
    id: j.id, username: j.username,
    age_verification_status: j.age_verification_status,
    nsfw_allowed: j.nsfw_allowed,
    date_of_birth: j.date_of_birth,
    flags: j.flags,
  } : null;

  const out = {};
  const before = await w.fetch('/api/v10/users/@me', { headers, credentials: 'include', cache: 'no-store' });
  out.before = { status: before.status, user: grab(await before.json().catch(() => null)) };

  const patch = await w.fetch('/api/v10/users/@me', {
    method: 'PATCH',
    headers,
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ date_of_birth: DOB }),
  });
  const pTxt = await patch.text();
  let pJson = null; try { pJson = JSON.parse(pTxt); } catch (e) {}
  out.patch = { status: patch.status, body: pJson ? (pJson.message ? { code: pJson.code, message: pJson.message, data: pJson.data } : grab(pJson)) : pTxt.slice(0, 300) };

  await new Promise((r) => setTimeout(r, 1500));
  const after = await w.fetch('/api/v10/users/@me', { headers, credentials: 'include', cache: 'no-store' });
  out.after = { status: after.status, user: grab(await after.json().catch(() => null)) };

  fr.remove();
  return out;
})()`;

const res = await cdp.evaluate(sessionId, expr);
console.log(JSON.stringify(res, null, 2));
try { await cdp.send('Target.closeTarget', { targetId: tab.targetId }); } catch { /* ignore */ }
cdp.close();
