/*
 * Live verification against real Discord in a running Helium/Chromium that has
 * the extension loaded.
 *
 *   node tools/verify-live.mjs [--port 9222] [--url https://discord.com/app]
 *
 * Checks:
 *   - the extension's service worker is alive (it loaded)
 *   - the MAIN-world patcher is present in the Discord page
 *   - what the client sees for age_verification_status / nsfw_allowed
 *   - whether an age-gate modal is mounted
 *   - a screenshot for the record
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : dflt;
}
const PORT = Number(arg('--port', '9222'));
const URL_ = arg('--url', 'https://discord.com/app');
const OUT = path.resolve(arg('--out', path.join(process.cwd(), 'live-discord.png')));
const WAIT = Number(arg('--wait', '9000'));

const cdp = await connect(PORT, { timeout: 20000 });

const targets = await cdp.targets();
const extSw = targets.filter((t) => (t.url || '').startsWith('chrome-extension://'));
console.log('extension targets:');
for (const t of extSw) console.log('  ', t.type, t.url);
const ours = extSw.find((t) => /bg\.js/.test(t.url || ''));
console.log(ours ? 'extension loaded: yes (' + ours.url + ')' : 'extension loaded: NO');
console.log('');

const page = await cdp.newPage(URL_);
await cdp.send('Runtime.enable', {}, page.sessionId);
await cdp.send('Page.enable', {}, page.sessionId);
await new Promise((r) => setTimeout(r, WAIT));

const expr = `(async () => {
  const out = {};
  out.title = document.title;
  out.url = location.href;
  out.agegatePresent = !!window.__AGEGATE__;
  out.stats = window.__AGEGATE__ ? JSON.parse(JSON.stringify(window.__AGEGATE__.stats)) : null;
  try {
    const r = await fetch('/api/v9/users/@me', { credentials: 'include' });
    out.meStatus = r.status;
    out.me = r.ok ? await r.json() : null;
  } catch (e) { out.meError = String(e); }
  out.gateModal = !!document.querySelector('[data-testid="age-verification-container"]');
  out.gateText = Array.from(document.querySelectorAll('div,span,h1,h2,h3')).map(e => (e.textContent||'').trim())
    .filter(t => t && t.length < 120 && /verify your age|age verification|enter your birthday|confirm your age/i.test(t)).slice(0, 6);
  out.loginForm = !!document.querySelector('form[aria-label*="Login" i]');
  out.hasAppRoot = !!document.querySelector('#app');
  out.bodySnippet = (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').slice(0, 300);
  return out;
})()`;

let info;
try {
  info = await cdp.evaluate(page.sessionId, expr);
} catch (e) {
  console.log('evaluate failed:', e.message);
}
console.log(JSON.stringify(info, null, 2));

try {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('\nscreenshot ->', OUT);
} catch (e) {
  console.log('screenshot failed:', e.message);
}

cdp.close();
