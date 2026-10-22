/*
 * Render the popup in a headless scratch browser and screenshot it.
 * Does not touch the operator's browser or its focus.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connect } from './cdp.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const EXT = path.join(ROOT, 'extension-dev');
const PORT = 8977;
const EXE = process.env.HELIUM_EXE || path.join(os.homedir(), 'AppData', 'Local', 'imput', 'Helium', 'Application', 'chrome.exe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = path.join(os.tmpdir(), 'agegate-popup-shot');
fs.rmSync(profile, { recursive: true, force: true });

const browser = spawn(EXE, [
  '--user-data-dir=' + profile,
  '--remote-debugging-port=' + PORT,
  '--load-extension=' + EXT,
  '--disable-features=DisableLoadExtensionCommandLineSwitch',
  '--no-first-run', '--no-default-browser-check',
  '--headless=new',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

const cdp = await connect(PORT, { timeout: 25000 });
await sleep(2500);
const targets = await cdp.targets();
const sw = targets.find((t) => t.type === 'service_worker' && /bg\.js/.test(t.url || ''));
const extId = sw ? (sw.url.match(/^chrome-extension:\/\/([a-p]{32})\//) || [])[1] : null;
if (!extId) { console.log('extension not loaded'); process.exit(1); }

const tab = await cdp.send('Target.createTarget', { url: 'chrome-extension://' + extId + '/src/popup.html' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
await cdp.send('Runtime.enable', {}, sessionId);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 900, deviceScaleFactor: 2, mobile: false }, sessionId);
await sleep(2500);
const meta = await cdp.evaluate(sessionId, 'JSON.stringify({ h: document.body.scrollHeight, card: document.querySelector(".shell") ? document.querySelector(".shell").scrollHeight : 0 })');
console.log('popup height:', meta);

const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
fs.writeFileSync(path.join(ROOT, 'popup.png'), Buffer.from(shot.data, 'base64'));
console.log('popup.png written');

try { await cdp.send('Target.closeTarget', { targetId: tab.targetId }); } catch { /* ignore */ }
cdp.close();
try { browser.kill('SIGKILL'); } catch { /* ignore */ }
process.exit(0);
