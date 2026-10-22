/*
 * Deploy the current extension build into a running Helium/Chromium:
 *   1. reload the extension in place (chrome.runtime.reload) - no browser restart
 *   2. open a scratch Discord tab, measure what the client sees, close it
 *
 * Never touches the operator's existing tabs, never raises a window.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const EXT_ID = arg('--extid', '');
const OUT = arg('--out', '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });

/* 1. find our extension id by asking the extensions WebUI which unpacked
      extension points at our folder */
let extId = EXT_ID;
try {
  const extTab = await cdp.send('Target.createTarget', { url: 'chrome://extensions', background: true });
  await sleep(1500);
  const { sessionId: extSession } = await cdp.send('Target.attachToTarget', { targetId: extTab.targetId, flatten: true });
  await cdp.send('Runtime.enable', {}, extSession);
  const info = await cdp.evaluate(extSession, `(async () => {
    if (!chrome.developerPrivate) return { error: 'no developerPrivate' };
    const list = await chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true });
    return { all: list.map(e => ({ id: e.id, name: e.name, path: e.path || '', location: e.location })) };
  })()`);
  if (info && info.all) {
    const ours = info.all.filter((e) => /discord-agegate/i.test(e.path || ''));
    console.log('unpacked extensions pointing at our folder:', JSON.stringify(ours));
    if (ours.length) extId = ours[0].id;
    else {
      const named = info.all.filter((e) => /Age Gate/i.test(e.name || ''));
      console.log('by name:', JSON.stringify(named));
      if (named.length) extId = named[0].id;
    }
  } else {
    console.log('extensions WebUI probe:', JSON.stringify(info));
  }
  try { await cdp.send('Target.closeTarget', { targetId: extTab.targetId }); } catch { /* ignore */ }
} catch (e) {
  console.log('extensions WebUI probe failed:', e.message);
}
console.log('extension id:', extId || '(not found)');

/* 2. reload the extension through its own popup page */
if (extId) {
  try {
    const pop = await cdp.send('Target.createTarget', { url: 'chrome-extension://' + extId + '/src/popup.html', background: true });
    await sleep(1200);
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: pop.targetId, flatten: true });
    await cdp.send('Runtime.enable', {}, sessionId);
    const r = await cdp.evaluate(sessionId, 'chrome.runtime.reload(), "reload requested"');
    console.log('extension reload:', r);
    await sleep(2500);
    try { await cdp.send('Target.closeTarget', { targetId: pop.targetId }); } catch { /* ignore */ }
  } catch (e) {
    console.log('extension reload failed:', e.message);
  }
}

/* 3. scratch tab, measure, close */
const tab = await cdp.send('Target.createTarget', { url: 'https://discord.com/app', background: true });
await sleep(14000);
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
for (let i = 0; i < 8; i++) {
  try { await cdp.send('Runtime.enable', {}, sessionId); break; } catch (e) { await sleep(1500); }
}

const info = await cdp.evaluate(sessionId, `(async () => {
  const ag = window.__AGEGATE__;
  const out = {
    version: ag ? ag.version : null,
    stats: ag ? JSON.parse(JSON.stringify(ag.stats)) : null,
    url: location.href,
    gateModal: !!document.querySelector('[data-testid="age-verification-container"]'),
    birthdayInput: !!document.querySelector('input[name="birthday"], input[name="date_of_birth"]'),
    ageText: Array.from(document.querySelectorAll('div,span,h1,h2,h3')).map(e => (e.textContent||'').trim())
      .filter(t => t && t.length < 140 && /verify your age|age verification|enter your birthday|confirm your age/i.test(t)).slice(0, 5),
    bodyText: (document.body ? document.body.innerText : '').replace(/\\s+/g,' ').slice(0, 300),
  };
  return out;
})()`);

console.log('\n=== scratch discord tab ===');
console.log(JSON.stringify(info, null, 2));

if (OUT) {
  try {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.writeFileSync(path.resolve(OUT), Buffer.from(shot.data, 'base64'));
    console.log('screenshot ->', path.resolve(OUT));
  } catch (e) { console.log('screenshot failed:', e.message); }
}

try { await cdp.send('Target.closeTarget', { targetId: tab.targetId }); console.log('\nscratch tab closed'); } catch { /* ignore */ }
cdp.close();
