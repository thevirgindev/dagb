/*
 * The 18+ channel problem:
 *   1. what does Discord's server say when the client asks for the messages of
 *      an age-restricted channel while the account is UNVERIFIED
 *   2. does re-asserting the birthday (PATCH /users/@me {birthday}) flip the
 *      server-side status, and do the messages load after that
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const CHANNEL = arg('--channel', '1499670807146664049');
const GUILD = arg('--guild', '1499516436752634096');
const DOB = arg('--dob', '1995-06-15');
const WAIT = Number(arg('--wait', '14000'));
const POLL = Number(arg('--poll', '8000'));
const ROUNDS = Number(arg('--rounds', '12'));
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
  const CHANNEL = ${JSON.stringify(CHANNEL)};
  const GUILD = ${JSON.stringify(GUILD)};
  const DOB = ${JSON.stringify(DOB)};
  const POLL = ${POLL};
  const ROUNDS = ${ROUNDS};
  window.__t = [];
  window.__tDone = false;
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
  const me = async () => {
    const r = await call('GET', '/api/v10/users/@me');
    return r.body && r.body.age_verification_status !== undefined
      ? { status: r.body.age_verification_status, flags: r.body.flags, nsfw: r.body.nsfw_allowed }
      : r;
  };
  const msgs = async () => {
    const r = await call('GET', '/api/v9/channels/' + CHANNEL + '/messages?limit=5');
    if (r.body && Array.isArray(r.body)) return { http: r.http, count: r.body.length };
    return { http: r.http, body: r.body };
  };

  const t0 = Date.now();
  const mark = (label, extra) => window.__t.push({ at: ((Date.now() - t0) / 1000).toFixed(1) + 's', label, ...(extra || {}) });

  (async () => {
    try {
      mark('me before', { me: await me() });
      mark('channel before', { msgs: await msgs() });
      mark('channel object', { ch: await call('GET', '/api/v9/channels/' + CHANNEL) });
      mark('PATCH birthday', { r: await call('PATCH', '/api/v9/users/@me', { birthday: DOB }) });
      for (let i = 0; i < ROUNDS; i++) {
        await new Promise((r) => setTimeout(r, POLL));
        const m = await me();
        mark('poll', { me: m, msgs: await msgs() });
        if (m && m.status === 3 && i > 1) {
          // status is adult: re-assert once more and see if the channel opens
          mark('re-assert birthday', { r: await call('PATCH', '/api/v9/users/@me', { birthday: DOB }) });
        }
      }
      mark('final channel', { msgs: await msgs() });
    } catch (e) { mark('error', { err: String(e) }); }
    window.__tDone = true;
    fr.remove();
  })();
  return 'started';
})()`;

console.log(await cdp.evaluate(sessionId, kick));

let seen = 0;
for (let i = 0; i < 400; i++) {
  const snap = await cdp.evaluate(sessionId, 'JSON.stringify({ t: window.__t || [], d: !!window.__tDone })');
  const parsed = JSON.parse(snap);
  for (; seen < parsed.t.length; seen++) {
    const r = parsed.t[seen];
    console.log(String(r.at).padStart(8), r.label.padEnd(20), JSON.stringify(r.me || r.msgs || r.ch || r.r));
  }
  if (parsed.d) break;
  await sleep(2500);
}
try { await cdp.send('Target.closeTarget', { targetId: tab.targetId }); } catch { /* ignore */ }
cdp.close();
