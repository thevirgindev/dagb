/*
 * Try the chrome://extensions developer-private API to install the extension
 * with dev mode on, which is the path that persists properly.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : dflt;
}
const PROFILE = path.resolve(arg('--profile', path.join(os.tmpdir(), 'agegate-dp-test')));
const EXE = arg('--exe', path.join(os.homedir(), 'AppData', 'Local', 'imput', 'Helium', 'Application', 'chrome.exe'));
const EXT = path.resolve(arg('--ext', new URL('../extension', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
const PORT = Number(arg('--port', '8910'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.rmSync(PROFILE, { recursive: true, force: true });

const browser = spawn(EXE, [
  '--user-data-dir=' + PROFILE,
  '--remote-debugging-port=' + PORT,
  '--no-first-run', '--no-default-browser-check',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

const cdp = await connect(PORT, { timeout: 25000 });

const page = await cdp.newPage('chrome://extensions');
await cdp.send('Runtime.enable', {}, page.sessionId);
await sleep(1500);

const expr = `(async () => {
  const out = { steps: [] };
  try {
    if (!chrome.developerPrivate) return { error: 'developerPrivate not exposed' };
    await chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true });
    out.steps.push('developer mode on');
    const profiles = await chrome.developerPrivate.getProfileConfiguration();
    out.steps.push('inDeveloperMode=' + profiles.inDeveloperMode);
    try {
      await chrome.developerPrivate.loadUnpacked({ path: ${JSON.stringify(EXT)} });
      out.steps.push('loadUnpacked(path) ok');
    } catch (e) {
      out.steps.push('loadUnpacked(path) failed: ' + e.message);
      try {
        await chrome.developerPrivate.loadDirectory({ path: ${JSON.stringify(EXT)} });
        out.steps.push('loadDirectory(path) ok');
      } catch (e2) {
        out.steps.push('loadDirectory failed: ' + e2.message);
      }
    }
    const info = await chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true });
    out.extensions = info.map(e => e.id + ' ' + e.name + ' state=' + e.state + ' location=' + e.location);
  } catch (e) {
    out.error = String(e);
  }
  return out;
})()`;

const r = await cdp.evaluate(page.sessionId, expr);
console.log(JSON.stringify(r, null, 2));

await sleep(8000);
try { await cdp.send('Browser.close'); } catch { /* ignore */ }
cdp.close();
await sleep(2500);
try { browser.kill('SIGKILL'); } catch { /* ignore */ }
await sleep(1000);

// plain relaunch
const b2 = spawn(EXE, ['--user-data-dir=' + PROFILE, '--remote-debugging-port=' + (PORT + 1), '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
const cdp2 = await connect(PORT + 1, { timeout: 25000 });
await sleep(1500);
const t = await cdp2.targets();
const exts = t.filter(x => (x.url || '').startsWith('chrome-extension://'));
console.log('\nafter plain relaunch:');
for (const e of exts) console.log('  ', e.type, e.url);
const prefs = path.join(PROFILE, 'Default', 'Preferences');
if (fs.existsSync(prefs)) {
  const j = JSON.parse(fs.readFileSync(prefs, 'utf8'));
  console.log('prefs dev mode:', j.extensions?.ui?.developer_mode, ' settings:', Object.keys(j.extensions?.settings || {}).join(','));
}
cdp2.close();
try { b2.kill('SIGKILL'); } catch { /* ignore */ }
