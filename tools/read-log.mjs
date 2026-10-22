/*
 * Read the extension's own event log out of chrome.storage.local.
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const MATCH = arg('--match', 'discord-agegate');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });

let extId = '';
const extTab = await cdp.send('Target.createTarget', { url: 'chrome://extensions', background: true });
await sleep(1200);
{
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: extTab.targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
  for (let i = 0; i < 6; i++) {
    try { await cdp.send('Runtime.enable', {}, sessionId); break; } catch { await sleep(1000); }
  }
  const info = await cdp.evaluate(sessionId, `(async () => {
    const list = await chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true });
    const ours = list.filter(e => /${MATCH}/i.test((e.path || '') + ' ' + (e.name || '')));
    return ours.map(e => ({ id: e.id, name: e.name }));
  })()`);
  if (info && info.length) extId = info[0].id;
}
try { await cdp.send('Target.closeTarget', { targetId: extTab.targetId }); } catch { /* ignore */ }
if (!extId) { console.log('extension not found'); process.exit(1); }

// the extension's own page gives us its storage
const page = await cdp.send('Target.createTarget', { url: 'chrome-extension://' + extId + '/src/popup.html', background: true });
await sleep(1500);
{
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
  for (let i = 0; i < 6; i++) {
    try { await cdp.send('Runtime.enable', {}, sessionId); break; } catch { await sleep(1000); }
  }
  const out = await cdp.evaluate(sessionId, `(async () => {
    const res = await chrome.storage.local.get(['agegate_log', 'agegate_config', 'agegate_ready']);
    return { log: (res.agegate_log || []).slice(-25), config: res.agegate_config, ready: res.agegate_ready };
  })()`);
  console.log(JSON.stringify(out, null, 2));
}
try { await cdp.send('Target.closeTarget', { targetId: page.targetId }); } catch { /* ignore */ }
cdp.close();
