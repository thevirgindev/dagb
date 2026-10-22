/*
 * Watch the account's server-side age_verification_status over time and test
 * whether requesting an age-signal challenge re-asserts it.
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const MINUTES = Number(arg('--minutes', '7'));
const POLL = Number(arg('--poll', '10000'));
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

const kick = `(async () => {
  const POLL = ${POLL};
  const DEADLINE = Date.now() + ${MINUTES} * 60000;
  window.__osc = [];
  window.__oscDone = false;
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
    return j ? { status: j.age_verification_status, flags: j.flags, nsfw: j.nsfw_allowed } : { http: r.status };
  };
  const challenge = async () => {
    const r = await w.fetch('/api/v9/users/@me/age-signal/challenge', { method: 'POST', headers, credentials: 'include', cache: 'no-store', body: '{}' });
    return r.status;
  };
  (async () => {
    try {
      while (Date.now() < DEADLINE) {
        const me = await getMe();
        const row = { at: new Date().toISOString().slice(11, 19), me };
        if (me.status !== 3) {
          row.challenge = await challenge();
          await new Promise((r) => setTimeout(r, 1500));
          row.after = await getMe();
        }
        window.__osc.push(row);
        await new Promise((r) => setTimeout(r, POLL));
      }
    } catch (e) { window.__osc.push({ err: String(e) }); }
    window.__oscDone = true;
    fr.remove();
  })();
  return 'started';
})()`;

console.log(await cdp.evaluate(sessionId, kick));

let seen = 0;
for (let i = 0; i < 500; i++) {
  const snap = await cdp.evaluate(sessionId, 'JSON.stringify({ t: window.__osc || [], d: !!window.__oscDone })');
  const parsed = JSON.parse(snap);
  for (; seen < parsed.t.length; seen++) {
    const r = parsed.t[seen];
    console.log(r.at || '', JSON.stringify(r.me || r.err), r.challenge ? 'challenge=' + r.challenge + ' -> ' + JSON.stringify(r.after) : '');
  }
  if (parsed.d) break;
  await sleep(3000);
}
try { await cdp.send('Target.closeTarget', { targetId: tab.targetId }); } catch { /* ignore */ }
cdp.close();
