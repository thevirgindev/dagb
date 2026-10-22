/*
 * Install the extension into a Chromium/Helium profile so it survives restarts.
 *
 *   node tools/install-profile.mjs --profile <dir> [--exe <path>] [--port <n>]
 *
 * Steps:
 *   1. (browser closed) turn on extensions.ui.developer_mode in the profile
 *   2. launch the browser with a debug port, load the extension unpacked
 *   3. graceful close so the pref write is flushed
 *   4. relaunch plain and prove the extension came back on its own
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : dflt;
}

const PROFILE = path.resolve(arg('--profile', path.join(os.tmpdir(), 'agegate-install-test')));
const EXE = arg('--exe', path.join(os.homedir(), 'AppData', 'Local', 'imput', 'Helium', 'Application', 'chrome.exe'));
const EXT = path.resolve(arg('--ext', new URL('../extension', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
const PORT = Number(arg('--port', '8900'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setDeveloperMode(profile) {
  const prefsPath = path.join(profile, 'Default', 'Preferences');
  if (!fs.existsSync(prefsPath)) { console.log('no profile prefs yet, skipping dev-mode write'); return; }
  let raw = fs.readFileSync(prefsPath, 'utf8');
  let prefs;
  try { prefs = JSON.parse(raw); } catch (e) { console.log('prefs unparsable, leaving alone'); return; }
  if (!prefs.extensions) prefs.extensions = {};
  if (!prefs.extensions.ui) prefs.extensions.ui = {};
  prefs.extensions.ui.developer_mode = true;
  fs.writeFileSync(prefsPath, JSON.stringify(prefs));
  console.log('developer_mode = true written to', prefsPath);
}

function launch(extraArgs) {
  const p = spawn(EXE, [
    '--user-data-dir=' + PROFILE,
    '--remote-debugging-port=' + PORT,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    ...extraArgs,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  return p;
}

async function waitForCdp() {
  const cdp = await connect(PORT, { timeout: 25000 });
  return cdp;
}

async function extensionTargets(cdp) {
  const t = await cdp.targets();
  return t.filter((x) => (x.url || '').startsWith('chrome-extension://'));
}

console.log('profile :', PROFILE);
console.log('exe     :', EXE);
console.log('ext     :', EXT);

setDeveloperMode(PROFILE);

// pass 1 - install
let browser = launch(['--enable-unsafe-extension-debugging']);
let cdp = await waitForCdp();
let res;
try {
  res = await cdp.send('Extensions.loadUnpacked', { path: EXT });
  console.log('loadUnpacked ->', JSON.stringify(res));
} catch (e) {
  console.error('loadUnpacked failed:', e.message);
  browser.kill('SIGKILL');
  process.exit(1);
}
await sleep(12000); // let the pref service flush
try { await cdp.send('Browser.close'); } catch { /* ignore */ }
cdp.close();
await sleep(2500);
try { browser.kill('SIGKILL'); } catch { /* ignore */ }
await sleep(1500);

// pass 2 - plain relaunch, no flags
console.log('\n-- plain relaunch (no debug flag, no load-extension) --');
browser = launch([]);
cdp = await waitForCdp();
await sleep(2000);
const exts = await extensionTargets(cdp);
for (const e of exts) console.log('  ', e.type, e.url);
const ours = exts.find((e) => (e.url || '').includes(res.id));
console.log(ours ? '\nPERSISTED: extension ' + res.id + ' auto-loaded after a plain restart' : '\nNOT PERSISTED');
cdp.close();
try { browser.kill('SIGKILL'); } catch { /* ignore */ }
process.exitCode = ours ? 0 : 1;
