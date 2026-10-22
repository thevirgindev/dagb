/*
 * Timeline proof that the `birthday` field on PATCH /users/@me is authoritative
 * server-side, and how long the change takes to propagate.
 *
 * The page keeps its own timeline in window.__timeline; node polls it so a
 * long run does not hit the CDP evaluate timeout.
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const TEEN = arg('--teen', '2012-03-03');
const ADULT = arg('--adult', '1995-06-15');
const POLL = Number(arg('--poll', '6000'));
const ROUNDS = Number(arg('--rounds', '8'));
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
  const TEEN = ${JSON.stringify(TEEN)};
  const ADULT = ${JSON.stringify(ADULT)};
  const POLL = ${POLL};
  const ROUNDS = ${ROUNDS};
  window.__timeline = [];
  window.__timelineDone = false;
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
    return j ? { status: j.age_verification_status, nsfw: j.nsfw_allowed } : { http: r.status };
  };
  const setBirthday = async (dob) => {
    const r = await w.fetch('/api/v9/users/@me', {
      method: 'PATCH', headers, credentials: 'include', cache: 'no-store',
      body: JSON.stringify({ birthday: dob }),
    });
    return r.status;
  };

  const t0 = Date.now();
  const mark = (label, extra) => window.__timeline.push({ at: ((Date.now() - t0) / 1000).toFixed(1) + 's', label, ...(extra || {}) });

  (async () => {
    try {
      mark('baseline', { me: await getMe() });
      mark('PATCH teen ' + TEEN, { http: await setBirthday(TEEN) });
      for (let i = 0; i < ROUNDS; i++) { await new Promise((r) => setTimeout(r, POLL)); mark('poll', { me: await getMe() }); }
      mark('PATCH adult ' + ADULT, { http: await setBirthday(ADULT) });
      for (let i = 0; i < ROUNDS; i++) { await new Promise((r) => setTimeout(r, POLL)); mark('poll', { me: await getMe() }); }
    } catch (e) {
      mark('error', { err: String(e) });
    }
    window.__timelineDone = true;
    fr.remove();
  })();
  return 'started';
})()`;

console.log(await cdp.evaluate(sessionId, kick));

let seen = 0;
for (let i = 0; i < 200; i++) {
  const snap = await cdp.evaluate(sessionId, 'JSON.stringify({ t: window.__timeline || [], d: !!window.__timelineDone })');
  const parsed = JSON.parse(snap);
  for (; seen < parsed.t.length; seen++) {
    const r = parsed.t[seen];
    console.log(String(r.at).padStart(8), r.label.padEnd(26), JSON.stringify(r.me || { http: r.http }));
  }
  if (parsed.d) break;
  await sleep(2000);
}

try { await cdp.send('Target.closeTarget', { targetId: tab.targetId }); } catch { /* ignore */ }
cdp.close();
