/*
 * Read the account's real server-side age state using the credentials the
 * client already has (token + super properties from localStorage), from inside
 * a same-origin iframe so the extension's rewriting does not touch it.
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
  try { token = JSON.parse(token); } catch (e) { /* raw token */ }
  let deviceProps = null;
  try { deviceProps = JSON.parse(ls.getItem('deviceProperties')); } catch (e) { /* none */ }
  const out = {
    tokenHead: token ? String(token).slice(0, 10) : null,
    tokenLen: token ? String(token).length : 0,
    devicePropsKeys: deviceProps ? Object.keys(deviceProps) : null,
  };
  const mkHeaders = (withProps) => {
    const h = { Authorization: token, 'Content-Type': 'application/json' };
    if (withProps && deviceProps) {
      try { h['X-Super-Properties'] = btoa(JSON.stringify(deviceProps)); } catch (e) { /* ignore */ }
    }
    return h;
  };
  for (const p of ['/api/v10/users/@me', '/api/v9/users/@me/settings']) {
    for (const withProps of [true, false]) {
      try {
        const r = await w.fetch(p, { headers: mkHeaders(withProps), credentials: 'include' });
        const txt = await r.text();
        let j = null; try { j = JSON.parse(txt); } catch {}
        const rec = { status: r.status, superProps: withProps };
        if (j) {
          const ageish = {};
          for (const k of Object.keys(j)) if (/age|adult|nsfw|verif|assurance|safety|birthday|date_of/i.test(k)) ageish[k] = j[k];
          rec.ageish = ageish;
          if (j.id) rec.user = { id: j.id, username: j.username, global_name: j.global_name, flags: j.flags, public_flags: j.public_flags, premium_type: j.premium_type };
        } else rec.raw = txt.slice(0, 160);
        out[p + (withProps ? ' [props]' : ' [plain]')] = rec;
        if (r.ok) break;
      } catch (e) { out[p] = { error: String(e) }; }
    }
  }
  fr.remove();
  return out;
})()`;

const res = await cdp.evaluate(sessionId, expr);
console.log(JSON.stringify(res, null, 2));
try { await cdp.send('Target.closeTarget', { targetId: tab.targetId }); } catch { /* ignore */ }
cdp.close();
