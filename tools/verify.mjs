/*
 * End-to-end verification of the extension against the mock Discord.
 *
 *   node tools/verify.mjs
 *
 * Launches a scratch Helium/Chromium with the dev extension loaded, drives the
 * mock harness page over CDP, and asserts that the client actually sees a
 * verified-adult account on every channel Discord uses:
 *   REST  GET   /users/@me
 *   REST  PATCH /users/@me  (the date_of_birth gate)
 *   GW    READY + USER_UPDATE frames
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connect } from './cdp.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const EXT = path.join(ROOT, 'extension-dev');
const PORT = 8899;
const MOCK_PORT = 8799;

const BROWSERS = [
  process.env.HELIUM_EXE,
  path.join(os.homedir(), 'AppData', 'Local', 'imput', 'Helium', 'Application', 'chrome.exe'),
  path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

function pickBrowser() {
  for (const b of BROWSERS) if (fs.existsSync(b)) return b;
  throw new Error('no browser found');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let mockProc = null;
let browser = null;

function cleanup() {
  try { if (browser) browser.kill('SIGKILL'); } catch { /* ignore */ }
  try { if (mockProc) mockProc.kill('SIGKILL'); } catch { /* ignore */ }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '   ->  ' + detail : ''));
}

async function main() {
  const exe = pickBrowser();
  console.log('browser :', exe);

  mockProc = spawn(process.execPath, [path.join(ROOT, 'tools', 'mock-discord.mjs')], {
    env: { ...process.env, MOCK_PORT: String(MOCK_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  mockProc.stdout.on('data', (d) => process.stdout.write('[mock] ' + d));
  mockProc.stderr.on('data', (d) => process.stderr.write('[mock!] ' + d));
  await sleep(900);

  const profile = path.join(os.tmpdir(), 'agegate-verify-profile');
  fs.rmSync(profile, { recursive: true, force: true });

  browser = spawn(exe, [
    '--user-data-dir=' + profile,
    '--remote-debugging-port=' + PORT,
    '--load-extension=' + EXT,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--window-size=1280,900',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  browser.stdout.on('data', (d) => process.stdout.write('[browser] ' + d));
  browser.stderr.on('data', (d) => process.stderr.write('[browser!] ' + d));

  const cdp = await connect(PORT, { timeout: 25000 });

  const readWorker = async () => {
    let sw = null;
    for (let i = 0; i < 20 && !sw; i++) {
      const t = await cdp.targets();
      sw = t.find((x) => x.type === 'service_worker' && /bg\.js/.test(x.url || ''));
      if (!sw) await sleep(400);
    }
    if (!sw) return { error: 'no worker target' };
    const { sessionId: extSession } = await cdp.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
    await cdp.send('Runtime.enable', {}, extSession);
    return await cdp.evaluate(extSession, `(async () => {
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      const st = await chrome.storage.local.get(['agegate_sp', 'agegate_fp_active', 'agegate_fp_error']);
      const r = rules.find(x => x.action && x.action.type === 'modifyHeaders');
      const h = r && r.action.requestHeaders.find(x => /super-properties/i.test(x.header));
      return {
        ruleCount: rules.length,
        rule: r ? { id: r.id, header: h && h.header, op: h && h.operation, hasValue: !!(h && h.value) } : null,
        hasSp: !!st.agegate_sp, fpActive: st.agegate_fp_active || null, fpError: st.agegate_fp_error || null,
      };
    })()`);
  };

  // prove the extension actually loaded
  let swTarget = null;
  for (let i = 0; i < 40 && !swTarget; i++) {
    const targets = await cdp.targets();
    swTarget = targets.find((t) => t.type === 'service_worker' && /extension/.test(t.url || ''));
    if (!swTarget) await sleep(500);
  }
  check('extension service worker loaded', !!swTarget, swTarget ? swTarget.url : 'not found');
  if (!swTarget) throw new Error('extension did not load - is --load-extension blocked in this build?');

  const page = await cdp.newPage('http://127.0.0.1:' + MOCK_PORT + '/mock-page');
  await cdp.send('Runtime.enable', {}, page.sessionId);
  await sleep(9000);
  console.log('worker state right after load:', JSON.stringify(await readWorker()));

  let res = null;
  let harnessErr = null;
  let dbg = null;
  for (let i = 0; i < 40; i++) {
    const snap = await cdp.evaluate(page.sessionId, 'JSON.stringify({ r: window.__done ? window.__results : null, e: window.__err || null, d: window.__dbg || null })');
    if (snap) {
      const parsed = JSON.parse(snap);
      res = parsed.r;
      harnessErr = parsed.e;
      dbg = parsed.d;
      if (res) break;
    }
    await sleep(400);
  }
  if (!res) throw new Error('harness never finished');
  if (harnessErr) console.log('harness error:', harnessErr);
  console.log('harness debug:', JSON.stringify(dbg));

  check('REST GET /users/@me -> age_verification_status = 3', res.me && res.me.age_verification_status === 3, JSON.stringify(res.me && res.me.age_verification_status));
  check('REST GET /users/@me -> nsfw_allowed = true', res.me && res.me.nsfw_allowed === true, JSON.stringify(res.me && res.me.nsfw_allowed));

  check('PATCH /users/@me gate error doctored into a 200', res.patchStatus === 200, 'status ' + res.patchStatus);
  check('PATCH /users/@me doctored body reports VERIFIED_ADULT', res.patchBody && res.patchBody.age_verification_status === 3, JSON.stringify(res.patchBody));
  check('PATCH /users/@me doctored body sets nsfw_allowed', res.patchBody && res.patchBody.nsfw_allowed === true, JSON.stringify(res.patchBody && res.patchBody.nsfw_allowed));

  check('POST /auth/login age-gate marker preserved (flow stays reachable)', res.loginBody && res.loginBody.data && res.loginBody.data.date_of_birth === '2007-03-03', JSON.stringify(res.loginBody && res.loginBody.data));

  check('gateway READY user -> age_verification_status = 3', res.ready && res.ready.age_verification_status === 3, JSON.stringify(res.ready && res.ready.age_verification_status));
  check('gateway READY user -> nsfw_allowed = true', res.ready && res.ready.nsfw_allowed === true, JSON.stringify(res.ready && res.ready.nsfw_allowed));
  check('gateway USER_UPDATE user -> age_verification_status = 3', res.userUpdate && res.userUpdate.age_verification_status === 3, JSON.stringify(res.userUpdate && res.userUpdate.age_verification_status));

  check('REST guild nsfw_level rewritten to SAFE(2)', res.guild && res.guild.nsfw_level === 2, JSON.stringify(res.guild && res.guild.nsfw_level));
  check('REST guild owner_configured_content_level neutralized', res.guild && res.guild.owner_configured_content_level === null, JSON.stringify(res.guild && res.guild.owner_configured_content_level));
  check('REST guild channel nsfw flag cleared', res.guild && res.guild.channels && res.guild.channels[0] && res.guild.channels[0].nsfw === false, JSON.stringify(res.guild && res.guild.channels));
  check('GUILD_CREATE frame nsfw_level rewritten to SAFE(2)', res.guildFrame && res.guildFrame.nsfw_level === 2, JSON.stringify(res.guildFrame && res.guildFrame.nsfw_level));
  check('GUILD_CREATE frame channel nsfw flag cleared', res.guildFrame && res.guildFrame.channels && res.guildFrame.channels[0] && res.guildFrame.channels[0].nsfw === false, JSON.stringify(res.guildFrame && res.guildFrame.channels));

  const stats = await cdp.evaluate(page.sessionId, 'window.__AGEGATE__ ? JSON.stringify(window.__AGEGATE__.stats) : null');
  console.log('\nextension stats:', stats);
  try {
    const st = JSON.parse(stats);
    check('gateway frames went through the JSON.parse path', (st.jsonFrames || 0) >= 2, 'jsonFrames=' + st.jsonFrames);
  } catch (e) { /* ignore */ }

  // keep-alive: it runs 60s after boot, re-asserts the adult birthday when the
  // server reports a downgrade
  console.log('\nwaiting for the keep-alive to fire (up to 100s)...');
  let patch = null;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + MOCK_PORT + '/mock-patches');
      const j = await r.json();
      const hit = (j.patches || []).find((p) => p.path.endsWith('/users/@me') && p.body && p.body.birthday);
      if (hit) { patch = hit; break; }
    } catch (e) { /* mock not up? */ }
    await sleep(2000);
  }
  check('keep-alive re-asserts an adult birthday server-side', !!patch, patch ? JSON.stringify(patch.body) : 'no PATCH {birthday} seen');
  check('keep-alive sends the account token', !!(patch && patch.headers && patch.headers.authorization), patch ? JSON.stringify(patch.headers) : '');

  // the fingerprint rewrite rule must be installed in the worker
  // (find the worker again: an MV3 worker can be torn down and restarted)
  let rule = null;
  rule = await readWorker();
  check('fingerprint rewrite rule is installed', !!(rule && rule.rule && rule.rule.header && rule.rule.op === 'set' && rule.rule.hasValue), JSON.stringify(rule));

  cdp.close();

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  if (failed.length) { console.log('FAILED: ' + failed.map((f) => f.name).join(' | ')); process.exitCode = 1; }
  cleanup();
}

main().catch((e) => {
  console.error('verify error:', e.message);
  cleanup();
  process.exitCode = 1;
});
