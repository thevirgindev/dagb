/*
 * Diagnostics on a live Discord tab: is our fetch/WS override the one the
 * client is actually using, and what API traffic did this tab produce?
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));

const cdp = await connect(PORT, { timeout: 20000 });
const targets = await cdp.targets();
const pages = targets.filter((t) => t.type === 'page' && /discord\.com/.test(t.url || ''));
console.log('discord tabs:');
for (const p of pages) console.log('  ', p.targetId, p.title, p.url);

for (const p of pages) {
  let info;
  try {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: p.targetId, flatten: true });
    await cdp.send('Runtime.enable', {}, sessionId);
    const expr = `(async () => {
    const out = { tab: location.href, title: document.title };
    out.fetchHead = String(window.fetch).slice(0, 90);
    out.fetchIsOurs = /origFetch/.test(String(window.fetch));
    out.wsHead = String(window.WebSocket).slice(0, 90);
    out.wsIsOurs = /PatchedWebSocket|agegate/.test(String(window.WebSocket));
    out.agegate = !!window.__AGEGATE__;
    out.stats = window.__AGEGATE__ ? JSON.parse(JSON.stringify(window.__AGEGATE__.stats)) : null;
    out.swController = navigator.serviceWorker ? (navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : 'none') : 'no api';
    const api = performance.getEntriesByType('resource').map(r => r.name).filter(n => /\\/api\\//.test(n));
    out.apiCalls = api.slice(-25);
    out.apiCount = api.length;
    return out;
  })()`;
    info = await cdp.evaluate(sessionId, expr);
  } catch (e) { info = { error: e.message }; }
  console.log('\n=== tab ' + p.targetId + ' ===');
  console.log(JSON.stringify(info, null, 2));
}
cdp.close();
