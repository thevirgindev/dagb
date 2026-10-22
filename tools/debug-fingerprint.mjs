/*
 * Debug the fingerprint publish path in a scratch browser: does the content
 * script see deviceProperties, does the message reach the worker, does the
 * rule land?
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connect } from './cdp.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const EXT = path.join(ROOT, 'extension-dev');
const PORT = 8955;
const MOCK_PORT = 8799;
const EXE = path.join(os.homedir(), 'AppData', 'Local', 'imput', 'Helium', 'Application', 'chrome.exe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = path.join(os.tmpdir(), 'agegate-fp-debug');
fs.rmSync(profile, { recursive: true, force: true });

const mock = spawn(process.execPath, [path.join(ROOT, 'tools', 'mock-discord.mjs')], {
  env: { ...process.env, MOCK_PORT: String(MOCK_PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
});
await sleep(1200);

const browser = spawn(EXE, [
  '--user-data-dir=' + profile,
  '--remote-debugging-port=' + PORT,
  '--load-extension=' + EXT,
  '--disable-features=DisableLoadExtensionCommandLineSwitch',
  '--no-first-run', '--no-default-browser-check',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

const cdp = await connect(PORT, { timeout: 25000 });
const tab = await cdp.newPage('http://127.0.0.1:' + MOCK_PORT + '/mock-page');
await sleep(9000);

const pageInfo = await cdp.evaluate(tab.sessionId, `(() => ({
  hasDeviceProps: !!localStorage.getItem('deviceProperties'),
  deviceProps: localStorage.getItem('deviceProperties'),
  hasToken: !!localStorage.getItem('token'),
  agegateConfig: !!localStorage.getItem('agegate_config'),
  bubble: !!document.getElementById('__agegate_bubble'),
  stats: window.__AGEGATE__ ? window.__AGEGATE__.stats : null,
}))()`);
console.log('page:', JSON.stringify(pageInfo, null, 2));

// extension side
let swTarget = null;
for (let i = 0; i < 30 && !swTarget; i++) {
  const t = await cdp.targets();
  swTarget = t.find((x) => x.type === 'service_worker' && /bg\.js/.test(x.url || ''));
  if (!swTarget) await sleep(400);
}
if (swTarget) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: swTarget.targetId, flatten: true });
  await cdp.send('Runtime.enable', {}, sessionId);
  const out = await cdp.evaluate(sessionId, `(async () => {
    const st = await chrome.storage.local.get(['agegate_sp','agegate_fp_active','agegate_fp_error']);
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    let manual = null, manualErr = null;
    try {
      manual = await chrome.runtime.sendMessage({ type: 'setSuperProperties', value: 'bWFudWFs' });
    } catch (e) { manualErr = String(e && e.message || e); }
    const after = await chrome.storage.local.get(['agegate_sp']);
    const rules2 = await chrome.declarativeNetRequest.getDynamicRules();
    return { hasSp: !!st.agegate_sp, fpActive: st.agegate_fp_active || null, fpError: st.agegate_fp_error || null,
             ruleCount: rules.length, manual, manualErr, spAfterManual: after.agegate_sp, ruleCountAfter: rules2.length };
  })()`);
  console.log('extension:', JSON.stringify(out, null, 2));
} else {
  console.log('no service worker target');
}

try { mock.kill('SIGKILL'); } catch { /* ignore */ }
try { browser.kill('SIGKILL'); } catch { /* ignore */ }
cdp.close();
process.exit(0);
