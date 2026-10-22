/*
 * Verify the extension inside Zen Browser (Firefox fork) using the Marionette
 * remote protocol.
 *
 *   node tools/verify-zen.mjs
 *
 * Launches Zen headless with a scratch profile, installs the Firefox build of
 * the extension as a temporary add-on, drives the mock Discord and checks:
 *   - the MAIN world patcher runs in Zen (world: MAIN support)
 *   - the ISOLATED companion runs and shows the toast
 *   - the fingerprint rewrite actually changed the header on the wire
 *   - the keep-alive re-asserted the adult birthday
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { connect } from './marionette.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const EXT = path.join(ROOT, 'extension-firefox-dev');
const ZEN = process.env.ZEN_EXE || 'C:\\Program Files\\Zen Browser\\zen.exe';
const MOCK_PORT = 8799;
const MARIONETTE_PORT = 2828;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '   ->  ' + detail : ''));
}

let mock = null;
let zen = null;

function cleanup() {
  try { if (zen) zen.kill('SIGKILL'); } catch { /* ignore */ }
  try { if (mock) mock.kill('SIGKILL'); } catch { /* ignore */ }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((res) => {
      const s = net.connect(port, '127.0.0.1');
      s.on('connect', () => { s.destroy(); res(true); });
      s.on('error', () => res(false));
    });
    if (ok) return true;
    await sleep(500);
  }
  return false;
}

async function main() {
  if (!fs.existsSync(ZEN)) throw new Error('zen not found at ' + ZEN);
  if (!fs.existsSync(path.join(EXT, 'manifest.json'))) throw new Error('build the firefox/zen variant first: node tools/build-firefox.mjs --dev');

  mock = spawn(process.execPath, [path.join(ROOT, 'tools', 'mock-discord.mjs')], {
    env: { ...process.env, MOCK_PORT: String(MOCK_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  mock.stdout.on('data', (d) => process.stdout.write('[mock] ' + d));
  mock.stderr.on('data', (d) => process.stderr.write('[mock!] ' + d));
  await sleep(1200);

  const profile = path.join(os.tmpdir(), 'agegate-zen-profile');
  fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'user.js'), [
    'user_pref("marionette.port", ' + MARIONETTE_PORT + ');',
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.aboutwelcome.enabled", false);',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("toolkit.telemetry.enabled", false);',
    'user_pref("app.shell.checkDefaultBrowser", false);',
    'user_pref("extensions.update.enabled", false);',
    'user_pref("browser.tabs.warnOnClose", false);',
    'user_pref("extensions.webextensions.restrictedDomains", "");',
    'user_pref("network.dns.disablePrefetch", true);',
    '',
  ].join('\n'));

  console.log('launching Zen headless with a scratch profile');
  zen = spawn(ZEN, [
    '-profile', profile,
    '-marionette',
    '-headless',
    '-no-remote',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  zen.stdout.on('data', (d) => process.stdout.write('[zen] ' + d));
  zen.stderr.on('data', (d) => process.stderr.write('[zen!] ' + d));

  const up = await waitForPort(MARIONETTE_PORT, 45000);
  check('zen started with marionette', up, 'port ' + MARIONETTE_PORT);
  if (!up) throw new Error('marionette never came up');

  const m = connect(MARIONETTE_PORT);
  await m.newSession();
  console.log('session ok');

  const addon = await m.installAddon(EXT, true);
  console.log('addon installed:', JSON.stringify(addon));
  check('extension installed in zen', !!(addon && addon.value), JSON.stringify(addon));
  await sleep(2500);

  await m.navigate('http://127.0.0.1:' + MOCK_PORT + '/mock-page');
  await sleep(6000);

  let page = null;
  for (let i = 0; i < 30; i++) {
    page = await m.script('return window.__done ? { results: window.__results, err: window.__err || null } : null;');
    if (page) break;
    await sleep(1000);
  }
  check('harness finished in zen', !!page, JSON.stringify(page && page.err));

  const state = await m.script(`return {
    agegate: !!window.__AGEGATE__,
    version: window.__AGEGATE__ ? window.__AGEGATE__.version : null,
    stats: window.__AGEGATE__ ? JSON.parse(JSON.stringify(window.__AGEGATE__.stats)) : null,
    marker: document.documentElement.getAttribute('data-agegate'),
    extOrigin: document.documentElement.getAttribute('data-agegate-ext'),
    extOrigin: document.documentElement.getAttribute('data-agegate-ext'),
    rule: document.documentElement.getAttribute('data-agegate-rule'),
    perms: document.documentElement.getAttribute('data-agegate-perms'),
    bodyLen: document.body ? document.body.innerText.length : 0,
  };`);
  console.log('zen page state:', JSON.stringify(state));

  check('MAIN world patcher runs in zen (world: MAIN)', !!(state && state.agegate), 'version ' + (state && state.version));
  check('gateway/REST rewrite happened in zen', !!(state && state.stats && (state.stats.patched > 0)), JSON.stringify(state && state.stats));
  check('isolated companion ran (ext marker set)', !!(state && state.extOrigin), 'ext=' + (state && state.extOrigin) + ' marker=' + (state && state.marker));

  const echo = page && page.results && page.results.echo;
  let echoSp = null;
  try { echoSp = echo && echo.sp ? JSON.parse(Buffer.from(echo.sp, 'base64').toString('utf8')) : null; } catch (e) { echoSp = null; }
  const keys = echoSp ? Object.keys(echoSp) : [];
  const minimal = keys.length > 0 && !('browser_user_agent' in echoSp) && !('client_launch_id' in echoSp);
  check('fingerprint rewrite changed the header on the wire', minimal, 'keys=' + keys.join(','));

  if (!minimal) {
    // Firefox MV3 does not grant manifest host permissions by itself, so the
    // rewrite needs the one-time site access grant. Drive it: open the popup
    // in a tab, click Grant, then replay the request.
    console.log('no rewrite yet, driving the site-access grant');
    await m.script("document.dispatchEvent(new CustomEvent('agegate-open-popup'));");
    await sleep(3000);
    try {
      const handles = await m.send('WebDriver:GetWindowHandles');
      const list = handles && handles.value ? handles.value : [];
      let popupHandle = null;
      for (const h of list) {
        await m.send('WebDriver:SwitchToWindow', { handle: h });
        const url = await m.script('location.href');
        if (String(url).indexOf('moz-extension://') === 0) { popupHandle = h; break; }
      }
      if (popupHandle) {
        await m.send('WebDriver:SwitchToWindow', { handle: popupHandle });
        await sleep(1200);
        const btn = await m.send('WebDriver:FindElement', { using: 'css selector', value: '#grant' });
        await m.send('WebDriver:ElementClick', { id: btn.value });
        console.log('clicked grant');
        await sleep(3000);
      } else {
        console.log('popup tab not found, handles: ' + JSON.stringify(list));
      }
    } catch (e) {
      console.log('grant flow failed:', e.message);
    }
    // back to the mock page and replay the request
    await m.navigate('http://127.0.0.1:' + MOCK_PORT + '/mock-page');
    await sleep(7000);
    const after = await m.script(`(async () => {
      const sp = btoa(JSON.stringify({
        os: 'Windows', browser: 'Chrome', device: '', device_model_name: '',
        system_locale: 'en-GB', has_client_mods: false,
        browser_user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/155.0.0.0 Safari/537.36',
        browser_version: '155.0.0.0', os_version: '10',
        referrer: 'https://discord.com/', referring_domain: 'discord.com',
        referrer_current: '', referring_domain_current: '',
        release_channel: 'stable', client_build_number: 643186, client_event_source: null,
        client_launch_id: '8461f575-ea65-4d9e-821c-db5034cf2269',
        launch_signature: '8d0c624e-1527-44ae-9f78-e81f4ac2f511',
        client_heartbeat_session_id: 'eea47253-d11c-46a5-8e27-b18ca7d9caeb',
        client_app_state: 'unfocused',
      }));
      const r = await fetch('/mock-echo', { headers: { 'X-Super-Properties': sp } });
      const j = await r.json();
      return { got: j.sp, perms: document.documentElement.getAttribute('data-agegate-perms') };
    })()`);
    let afterKeys = [];
    try { afterKeys = after && after.got ? Object.keys(JSON.parse(Buffer.from(after.got, 'base64').toString('utf8'))) : []; } catch (e) { afterKeys = []; }
    const minimalAfter = afterKeys.length > 0 && afterKeys.indexOf('browser_user_agent') === -1;
    check('fingerprint rewrite works after the site-access grant', minimalAfter, 'keys=' + afterKeys.join(',') + ' perms=' + (after && after.perms));
  }

  // keep-alive: check the mock saw an authenticated birthday PATCH
  let patch = null;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + MOCK_PORT + '/mock-patches');
      const j = await r.json();
      patch = (j.patches || []).find((p) => p.path.endsWith('/users/@me') && p.body && p.body.birthday);
      if (patch) break;
    } catch { /* mock not up */ }
    await sleep(2000);
  }
  check('keep-alive re-asserted the birthday in zen', !!patch, patch ? JSON.stringify(patch.body) : 'no PATCH {birthday}');

  // screenshot the popup
  let extOrigin = state && state.extOrigin;
  if (!extOrigin) {
    try {
      const prefs = fs.readFileSync(path.join(profile, 'prefs.js'), 'utf8');
      const m2 = prefs.match(/"discord-agegate@local\.build"\s*:\s*"([0-9a-f-]{36})"/);
      if (m2) extOrigin = 'moz-extension://' + m2[1] + '/';
    } catch (e) { /* prefs not flushed yet */ }
  }
  if (extOrigin) {
    try {
      await m.navigate(extOrigin + 'src/popup.html');
      await sleep(2500);
      const shot = await m.screenshot();
      if (shot) {
        fs.writeFileSync(path.join(ROOT, 'zen-popup.png'), shot);
        console.log('popup screenshot -> zen-popup.png');
      }
      const popupText = await m.script('return document.body ? document.body.innerText.replace(/\\s+/g," ").slice(0,220) : "";');
      console.log('popup text:', popupText);
      check('popup renders in zen', !!(popupText && popupText.length > 20), popupText);
      const rule = await m.script(`return new Promise((res) => {
        try { chrome.runtime.sendMessage({ type: 'ruleStatus' }, (r) => res(JSON.stringify(r))); }
        catch (e) { res('ERR ' + String(e)); }
        setTimeout(() => res('timeout'), 5000);
      });`);
      console.log('worker rule status:', rule);
    } catch (e) {
      console.log('popup check failed:', e.message);
    }
  } else {
    console.log('could not resolve the extension origin');
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  if (failed.length) { console.log('FAILED: ' + failed.map((f) => f.name).join(' | ')); process.exitCode = 1; }
  cleanup();
  process.exit(process.exitCode || 0);
}

main().catch((e) => {
  console.error('verify-zen error:', e.message);
  cleanup();
  process.exit(1);
});
