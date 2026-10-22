/*
 * Live status of the extension in a running Discord tab: version, counters,
 * what the client sees for the account, and whether any age-gate UI is up.
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

async function attach(targetId) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
  for (let i = 0; i < 6; i++) {
    try { await cdp.send('Runtime.enable', {}, sessionId); return sessionId; }
    catch (e) { await sleep(1200); }
  }
  throw new Error('Runtime.enable never answered');
}

const targets = await cdp.targets();
const pages = targets.filter((t) => t.type === 'page' && /discord\.com/.test(t.url || ''));
console.log('discord tabs: ' + pages.length);
for (const p of pages) console.log('  ', p.title, '|', p.url);

let best = null;
for (const p of pages) {
  try { await cdp.send('Target.activateTarget', { targetId: p.targetId }); } catch { /* ignore */ }
  await sleep(600);
  let sessionId;
  try { sessionId = await attach(p.targetId); } catch (e) { console.log('  tab not responsive:', e.message); continue; }

  const expr = `(() => {
    const ag = window.__AGEGATE__;
    const out = {
      version: ag ? ag.version : null,
      stats: ag ? JSON.parse(JSON.stringify(ag.stats)) : null,
      url: location.href,
      title: document.title,
      gateModal: !!document.querySelector('[data-testid="age-verification-container"]'),
      gateText: Array.from(document.querySelectorAll('div,span,h1,h2,h3')).map(e => (e.textContent||'').trim())
        .filter(t => t && t.length < 140 && /verify your age|age verification|enter your birthday|confirm your age|age assurance/i.test(t)).slice(0, 5),
      birthdayInput: !!document.querySelector('input[name="birthday"], input[name="date_of_birth"]'),
      bodyText: (document.body ? document.body.innerText : '').replace(/\\s+/g,' ').slice(0, 400),
    };
    return out;
  })()`;

  let info;
  try { info = await cdp.evaluate(sessionId, expr); } catch (e) { info = { error: e.message }; }
  console.log('\n=== ' + p.title + ' ===');
  console.log(JSON.stringify(info, null, 2));
  if (info && info.version) best = { info, sessionId, page: p };

  if (OUT) {
    try {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
      const f = path.resolve(OUT.replace('{id}', p.targetId));
      fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
      console.log('screenshot ->', f);
    } catch (e) { console.log('screenshot failed:', e.message); }
  }
}
cdp.close();
