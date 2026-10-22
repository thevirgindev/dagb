import { connect } from './cdp.mjs';
import fs from 'node:fs';

const cdp = await connect(9222, { timeout: 20000 });
const pages = (await cdp.targets()).filter((t) => t.type === 'page' && /discord\.com/.test(t.url || ''));
if (!pages.length) { cdp.close(); process.exit(1); }
const p = pages[0];
const a = await cdp.send('Target.attachToTarget', { targetId: p.targetId, flatten: true });
const sessionId = a.sessionId;
await cdp.send('Page.enable', {}, sessionId);
try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch {}
await cdp.send('Runtime.enable', {}, sessionId);

const ids = [522556, 800772, 468689, 555337, 10862, 432371, 713654, 863036];
const EXPR = `(() => {
  let mods = null;
  window.webpackChunkdiscord_app.push([[Math.random()], {}, (r) => { mods = r.m; }]);
  if (!mods) return null;
  const out = {};
  for (const id of ${JSON.stringify(ids)}) {
    try { out[id] = typeof mods[id] === 'function' ? String(mods[id]) : null; } catch { out[id] = 'ERR'; }
  }
  out._hunt = {};
  for (const id of Object.keys(mods)) {
    let s;
    try { s = String(mods[id]); } catch { continue; }
    if (s.includes('k$') && (s.includes('NSFW') || s.includes('mature') || s.includes('nsfw'))) out._hunt[id] = s.length;
  }
  return JSON.stringify(out);
})()`;

const raw = await cdp.evaluate(sessionId, EXPR);
if (!raw) { console.log('empty'); cdp.close(); process.exit(1); }
const j = JSON.parse(raw);
fs.mkdirSync('recon/mods', { recursive: true });
for (const id of ids) {
  const body = j[id];
  if (!body) { console.log('module', id, 'missing'); continue; }
  fs.writeFileSync('recon/mods/' + id + '.js', body);
  console.log('module', id, body.length, 'chars');
}
console.log('hunt k$+NSFW mods:', JSON.stringify(j._hunt));
cdp.close();
