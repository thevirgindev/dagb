import { connect } from './cdp.mjs';
import fs from 'node:fs';

const cdp = await connect(9222, { timeout: 20000 });
const pages = (await cdp.targets()).filter((t) => t.type === 'page' && /discord\.com/.test(t.url || ''));
const p = pages[0];
const a = await cdp.send('Target.attachToTarget', { targetId: p.targetId, flatten: true });
const sessionId = a.sessionId;
await cdp.send('Page.enable', {}, sessionId);
try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch {}
await cdp.send('Runtime.enable', {}, sessionId);

const ids = [652215, 66834, 260509, 874850, 204925, 272767, 306537, 669281, 597306, 36149, 398884];
const EXPR = `(() => {
  let mods = null;
  window.webpackChunkdiscord_app.push([[Math.random()], {}, (r) => { mods = r.m; }]);
  if (!mods) return null;
  const out = {};
  for (const id of ${JSON.stringify(ids)}) {
    try { out[id] = typeof mods[id] === 'function' ? String(mods[id]).slice(0, 60000) : null; } catch { out[id] = 'ERR'; }
  }
  const where = [];
  for (const id of Object.keys(mods)) {
    let s; try { s = String(mods[id]); } catch { continue; }
    if (s.includes('JOIN_LARGE_GUILD_UNDERAGE')) where.push(id);
  }
  out._large = where;
  return JSON.stringify(out);
})()`;

const raw = await cdp.evaluate(sessionId, EXPR);
if (!raw) { console.log('empty'); cdp.close(); process.exit(1); }
const j = JSON.parse(raw);
fs.mkdirSync('recon/mods', { recursive: true });
for (const id of ids) {
  const body = j[id];
  if (!body) { console.log('module', id, 'not loaded'); continue; }
  fs.writeFileSync('recon/mods/live-' + id + '.js', body);
  console.log('module', id, body.length, 'chars');
}
console.log('JOIN_LARGE_GUILD_UNDERAGE mods:', j._large.join(','));
cdp.close();
