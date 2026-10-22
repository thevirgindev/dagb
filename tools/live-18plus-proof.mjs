/*
 * The live proof: ask Discord for the age-gated channel from inside a
 * Discord tab, so the request carries the rewritten fingerprint.
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const CHANNEL = arg('--channel', '1499670807146664049');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });
const tab = await cdp.send('Target.createTarget', { url: 'https://discord.com/app', background: true });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
await cdp.send('Runtime.enable', {}, sessionId);
try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
for (let i = 0; i < 8; i++) {
  try { await cdp.send('Runtime.enable', {}, sessionId); break; } catch { await sleep(1200); }
}
for (let i = 0; i < 40; i++) {
  const where = await cdp.evaluate(sessionId, 'location.href');
  if (String(where).indexOf('discord.com') !== -1) break;
  await sleep(1000);
}
await sleep(6000);

const expr = `(async () => {
  let token = null;
  try { token = window.localStorage.getItem('token'); } catch (e) { token = null; }
  try { token = JSON.parse(token); } catch (e) {}
  const headers = { Authorization: token };
  const r = await fetch('/api/v10/channels/${CHANNEL}/messages?limit=12', { headers, credentials: 'include' });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) {}
  const agegate = window.__AGEGATE__ ? window.__AGEGATE__.stats : null;
  return {
    url: location.href,
    status: r.status,
    count: Array.isArray(j) ? j.length : null,
    message: j && j.message ? j.message : null,
    code: j && j.code ? j.code : null,
    head: Array.isArray(j) && j[0] ? String(j[0].content || '').slice(0, 120) : null,
    stats: agegate,
  };
})()`;

const out = await cdp.evaluate(sessionId, expr);
console.log(JSON.stringify(out, null, 2));
try { await cdp.send('Target.closeTarget', { targetId: tab.targetId }); } catch { /* ignore */ }
cdp.close();
