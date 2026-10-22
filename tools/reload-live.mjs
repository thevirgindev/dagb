/*
 * Reload the extension in a running browser and bounce the Discord tab, so a
 * new build of the patcher is live without restarting the browser.
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const URL_ = arg('--url', 'https://discord.com/app');

const cdp = await connect(PORT, { timeout: 20000 });

// 1. reload the extension service worker so the new files are picked up
const targets = await cdp.targets();
const sw = targets.find((t) => t.type === 'service_worker' && /bg\.js/.test(t.url || ''));
if (sw) {
  try {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.evaluate(sessionId, 'chrome.runtime.reload(), "reloading"');
    console.log('extension reload requested');
  } catch (e) {
    console.log('extension reload failed:', e.message);
  }
} else {
  console.log('extension service worker not found');
}
await new Promise((r) => setTimeout(r, 2500));

// 2. bounce the discord tab
const targets2 = await cdp.targets();
const page = targets2.find((t) => t.type === 'page' && /discord\.com/.test(t.url || ''));
if (page) {
  try { await cdp.send('Target.activateTarget', { targetId: page.targetId }); } catch { /* ignore */ }
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.navigate', { url: URL_ }, sessionId);
  console.log('navigated tab to', URL_);
} else {
  console.log('no discord tab found');
}

await new Promise((r) => setTimeout(r, 12000));

const targets3 = await cdp.targets();
const page2 = targets3.find((t) => t.type === 'page' && /discord\.com/.test(t.url || ''));
if (page2) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page2.targetId, flatten: true });
  await cdp.send('Runtime.enable', {}, sessionId);
  const stats = await cdp.evaluate(sessionId, 'window.__AGEGATE__ ? JSON.stringify(window.__AGEGATE__.stats) : null');
  console.log('\nstats:', stats);
}
cdp.close();
