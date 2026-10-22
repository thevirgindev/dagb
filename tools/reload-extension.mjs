/*
 * Reload the unpacked extension inside a running browser (chrome.runtime.reload)
 * so a new build is live, without restarting the browser or touching the
 * operator's tabs.
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const MATCH = arg('--match', 'discord-agegate');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });

// find the extension id through the extensions WebUI (it knows the unpacked paths)
let extId = '';
const extTab = await cdp.send('Target.createTarget', { url: 'chrome://extensions', background: true });
await sleep(1500);
{
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: extTab.targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
  for (let i = 0; i < 6; i++) {
    try { await cdp.send('Runtime.enable', {}, sessionId); break; } catch { await sleep(1200); }
  }
  const info = await cdp.evaluate(sessionId, `(async () => {
    const list = await chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true });
    const ours = list.filter(e => /${MATCH}/i.test((e.path || '') + ' ' + (e.name || '')));
    return ours.map(e => ({ id: e.id, name: e.name, path: e.path, state: e.state }));
  })()`);
  console.log('matched extensions:', JSON.stringify(info));
  if (info && info.length) extId = info[0].id;
}
try { await cdp.send('Target.closeTarget', { targetId: extTab.targetId }); } catch { /* ignore */ }
if (!extId) { console.log('no extension id found'); process.exit(1); }

// open its own page so the extension context is alive, then reload it
const page = await cdp.send('Target.createTarget', { url: 'chrome-extension://' + extId + '/src/popup.html', background: true });
await sleep(2000);
{
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
  for (let i = 0; i < 8; i++) {
    try { await cdp.send('Runtime.enable', {}, sessionId); break; } catch { await sleep(1200); }
  }
  const r = await cdp.evaluate(sessionId, '(() => { if (!chrome || !chrome.runtime) return "no chrome.runtime"; chrome.runtime.reload(); return "reload requested"; })()');
  console.log('reload:', r);
}
await sleep(2500);
try { await cdp.send('Target.closeTarget', { targetId: page.targetId }); } catch { /* ignore */ }
console.log('extension reloaded, browser left running');
cdp.close();
