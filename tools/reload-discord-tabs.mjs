/*
 * Reload only the Discord tabs of the operator's browser so a new extension
 * build is live in them. No window is raised, no other tab is touched.
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const MATCH = new RegExp(arg('--match', 'discord\\.com'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });
const targets = await cdp.targets();
const pages = targets.filter((t) => t.type === 'page' && MATCH.test(t.url || ''));
console.log('discord tabs to reload:', pages.length);
for (const p of pages) console.log('  ', p.title, '|', p.url);

for (const p of pages) {
  try {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: p.targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
    await cdp.send('Page.reload', { ignoreCache: false }, sessionId);
    console.log('  reloaded', p.targetId);
  } catch (e) {
    console.log('  reload failed:', e.message);
  }
}
await sleep(12000);
cdp.close();
console.log('done');
