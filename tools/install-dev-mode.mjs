/*
 * Install via the chrome://extensions developer-private API: turn dev mode on
 * and hand loadDirectory() a constructed DirectoryEntry (the same call the
 * "Load unpacked" button makes once the file picker returns).
 *
 *   node tools/install-dev-mode.mjs --profile <dir> [--port n] [--ext dir]
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

async function launch(port) {
  const p = spawn(EXE, [
    '--user-data-dir=' + PROFILE,
    '--remote-debugging-port=' + port,
    '--no-first-run', '--no-default-browser-check',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const cdp = await connect(port, { timeout: 25000 });
  return { proc: p, cdp };
}

let { proc, cdp } = await launch(PORT);
const page = await cdp.newPage('chrome://extensions');
await cdp.send('Runtime.enable', {}, page.sessionId);
await sleep(1500);

const expr = `(async () => {
  const out = { steps: [] };
  const EXT = ${JSON.stringify(EXT)};
  try {
    await chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true });
    const cfg = await chrome.developerPrivate.getProfileConfiguration();
    out.steps.push('inDeveloperMode=' + cfg.inDeveloperMode);

    const candidates = [
      { name: 'extension', path: EXT, absolutePath: EXT },
      { name: 'extension', path: EXT },
      { path: EXT },
    ];
    for (const c of candidates) {
      try {
        await chrome.developerPrivate.loadDirectory(c);
        out.steps.push('loadDirectory ok with ' + JSON.stringify(Object.keys(c)));
        break;
      } catch (e) {
        out.steps.push('loadDirectory ' + JSON.stringify(Object.keys(c)) + ' failed: ' + e.message);
      }
    }
    const info = await chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true });
    out.extensions = info.map(e => ({ id: e.id, name: e.name, state: e.state, location: e.location, path: e.path }));
  } catch (e) { out.error = String(e); }
  return out;
})()`;

const r = await cdp.evaluate(page.sessionId, expr);
console.log(JSON.stringify(r, null, 2));

await sleep(8000);
try { await cdp.send('Browser.close'); } catch { /* ignore */ }
cdp.close();
await sleep(3000);
try { proc.kill('SIGKILL'); } catch { /* ignore */ }
await sleep(1200);

console.log('\n-- plain relaunch --');
const second = await launch(PORT + 1);
await sleep(2500);
const targets = await second.cdp.targets();
const exts = targets.filter((t) => (t.url || '').startsWith('chrome-extension://'));
for (const e of exts) console.log('  ', e.type, e.url);
const ours = exts.find((e) => (r.extensions || []).some((x) => (e.url || '').includes(x.id)));
console.log(ours ? '\nPERSISTED' : '\nNOT PERSISTED');
second.cdp.close();
try { second.proc.kill('SIGKILL'); } catch { /* ignore */ }
process.exitCode = ours ? 0 : 1;
