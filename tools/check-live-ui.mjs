/*
 * Live check of the extension in the operator's Discord tabs:
 *   - version, counters, the big bubble
 *   - the chat input is still there (the suppressor must not eat it)
 *   - how long the UI scan takes (it used to walk every element and read
 *     innerText, which is what took the message box out of the DOM)
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const OUT = arg('--out', '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });
const targets = await cdp.targets();
const pages = targets.filter((t) => t.type === 'page' && /discord\.com/.test(t.url || ''));
console.log('discord tabs:', pages.length);

for (const p of pages) {
  let sessionId;
  try {
    const a = await cdp.send('Target.attachToTarget', { targetId: p.targetId, flatten: true });
    sessionId = a.sessionId;
    await cdp.send('Page.enable', {}, sessionId);
    try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
    for (let i = 0; i < 6; i++) {
      try { await cdp.send('Runtime.enable', {}, sessionId); break; } catch { await sleep(1200); }
    }
  } catch (e) {
    console.log('\n=== ' + p.title + ' ===  not responsive: ' + e.message);
    continue;
  }

  const expr = `(() => {
    const ag = window.__AGEGATE__;
    const editors = Array.from(document.querySelectorAll('[contenteditable="true"], textarea'));
    const msgEditors = Array.from(document.querySelectorAll('[class*="messageEditor"] [contenteditable="true"], [class*="chatTextInput"]'));
    return {
      version: ag ? ag.version : null,
      stats: ag ? JSON.parse(JSON.stringify(ag.stats)) : null,
      bubble: !!document.getElementById('__agegate_bubble'),
      bubbleText: (document.getElementById('__agegate_bubble') || {}).textContent || null,
      contenteditables: editors.length,
      messageEditors: msgEditors.length,
      editorVisible: msgEditors.some(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }),
      gateModal: !!document.querySelector('[data-testid="age-verification-container"]'),
      bodyText: (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').slice(0, 160),
    };
  })()`;

  let info;
  try { info = await cdp.evaluate(sessionId, expr); } catch (e) { info = { error: e.message }; }
  console.log('\n=== ' + p.title + ' ===');
  console.log(JSON.stringify(info, null, 2));

  if (OUT) {
    try {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
      const f = path.resolve(OUT.replace('{id}', p.targetId));
      fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
      console.log('screenshot ->', f);
    } catch (e) { console.log('screenshot failed:', e.message); }
  }
}

// extension-side counters
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
    const ours = list.filter(e => /discord-agegate/i.test((e.path || '') + ' ' + (e.name || '')));
    return ours.map(e => ({ id: e.id, name: e.name, path: e.path }));
  })()`);
  if (info && info.length) {
    const page = await cdp.send('Target.createTarget', { url: 'chrome-extension://' + info[0].id + '/src/popup.html', background: true });
    await sleep(1200);
    const s2 = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    await cdp.send('Page.enable', {}, s2.sessionId);
    try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, s2.sessionId); } catch { /* ignore */ }
    for (let i = 0; i < 6; i++) {
      try { await cdp.send('Runtime.enable', {}, s2.sessionId); break; } catch { await sleep(1000); }
    }
    const store = await cdp.evaluate(s2.sessionId, `(async () => {
      const r = await chrome.storage.local.get(['agegate_ui_removed', 'agegate_scan_ms', 'agegate_ready', 'agegate_active', 'agegate_log']);
      return { removed: r.agegate_ui_removed, scanMs: r.agegate_scan_ms, ready: r.agegate_ready, active: r.agegate_active,
               log: (r.agegate_log || []).slice(-8) };
    })()`);
    console.log('\nextension store:', JSON.stringify(store, null, 2));
    try { await cdp.send('Target.closeTarget', { targetId: page.targetId }); } catch { /* ignore */ }
  }
}
try { await cdp.send('Target.closeTarget', { targetId: extTab.targetId }); } catch { /* ignore */ }
cdp.close();
