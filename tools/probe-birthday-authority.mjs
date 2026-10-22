/*
 * Prove the `birthday` field is authoritative server-side: set a teenage DOB,
 * read it back, then set an adult DOB and read it back.
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

  const getMe = async () => {
    const r = await w.fetch('/api/v10/users/@me', { headers, credentials: 'include', cache: 'no-store' });
    const j = await r.json().catch(() => null);
    return j ? { status: j.age_verification_status, nsfw: j.nsfw_allowed, dob: j.date_of_birth || j.birthday || null } : null;
  };
  const setBirthday = async (dob) => {
    const r = await w.fetch('/api/v9/users/@me', {
      method: 'PATCH', headers, credentials: 'include', cache: 'no-store',
      body: JSON.stringify({ birthday: dob }),
    });
    const j = await r.json().catch(() => null);
    return { http: r.status, body: j ? { status: j.age_verification_status, nsfw: j.nsfw_allowed, dob: j.date_of_birth || j.birthday || null } : null };
  };

  const log = [];
  log.push({ step: 'baseline GET', me: await getMe() });
  log.push({ step: 'PATCH birthday 2012-03-03', patch: await setBirthday('2012-03-03') });
  await new Promise((r) => setTimeout(r, 2000));
  log.push({ step: 'GET after teen', me: await getMe() });
  log.push({ step: 'PATCH birthday 1995-06-15', patch: await setBirthday('1995-06-15') });
  await new Promise((r) => setTimeout(r, 2000));
  log.push({ step: 'GET after adult', me: await getMe() });
  await new Promise((r) => setTimeout(r, 4000));
  log.push({ step: 'GET after settle', me: await getMe() });
  fr.remove();
  return log;
})()`;

const res = await cdp.evaluate(sessionId, expr);
for (const row of res) console.log(row.step, '->', JSON.stringify(row.patch || row.me));
try { await cdp.send('Target.closeTarget', { targetId: tab.targetId }); } catch { /* ignore */ }
cdp.close();
