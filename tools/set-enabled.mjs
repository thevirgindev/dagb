import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const MATCH = arg('--match', 'discord-agegate');
const WANT = args.includes('--off') ? false : true;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });

let extId = '';
const extTab = await cdp.send('Target.createTarget', { url: 'chrome://extensions', background: true });
await sleep(1500);
{
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: extTab.targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { }
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
try { await cdp.send('Target.closeTarget', { targetId: extTab.targetId }); } catch { }
if (!extId) { console.log('no extension id found'); process.exit(1); }

const page = await cdp.send('Target.createTarget', { url: 'chrome-extension://' + extId + '/src/popup.html', background: true });
await sleep(1500);
{
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { }
  for (let i = 0; i < 8; i++) {
    try { await cdp.send('Runtime.enable', {}, sessionId); break; } catch { await sleep(1200); }
  }
  const expr = `(async () => {
    const key = 'agegate_config';
    const cur = await chrome.storage.local.get(key);
    const cfg = Object.assign({}, cur[key] || {});
    cfg.enabled = ${WANT};
    await chrome.storage.local.set({ [key]: cfg });
    const after = await chrome.storage.local.get(key);
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    return JSON.stringify({ enabled: after[key] && after[key].enabled, rules: rules.length });
  })()`;
  const out = await cdp.evaluate(sessionId, expr);
  console.log('storage flip ->', out);
}
await sleep(400);
try { await cdp.send('Target.closeTarget', { targetId: page.targetId }); } catch { }
cdp.close();
