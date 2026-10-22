import { connect } from './cdp.mjs';

const cdp = await connect(9222, { timeout: 20000 });
const pages = (await cdp.targets()).filter((t) => t.type === 'page' && /discord\.com/.test(t.url || ''));
const p = pages[0];
const a = await cdp.send('Target.attachToTarget', { targetId: p.targetId, flatten: true });
const sessionId = a.sessionId;
await cdp.send('Page.enable', {}, sessionId);
try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch {}
await cdp.send('Runtime.enable', {}, sessionId);

const EXPR = `(() => {
  let mods = null, req = null;
  window.webpackChunkdiscord_app.push([[Math.random()], {}, (r) => { mods = r.m; req = r; }]);
  if (!mods) return JSON.stringify({ err: 'no table' });
  const out = { candidates: {}, require_try: null };
  for (const id of Object.keys(mods)) {
    let s;
    try { s = String(mods[id]); } catch { continue; }
    if (s.includes('zS:()=>') && (s.includes('p5:()=>') || s.includes('ni:()=>') || s.includes('Gn:()=>'))) {
      out.candidates[id] = s.length;
    }
  }
  try { req(323073); out.require_try = 'loaded fine'; } catch (e) { out.require_try = String(e.message).slice(0, 200); }
  return JSON.stringify(out);
})()`;

const raw = await cdp.evaluate(sessionId, EXPR);
const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
console.log(JSON.stringify(j, null, 1));
cdp.close();
