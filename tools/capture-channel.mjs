/*
 * Capture what the Discord client actually asks for in an age-restricted
 * channel and what the server answers, straight off the wire.
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const CHANNEL = arg('--channel', '1499670807146664049');
const WAIT = Number(arg('--wait', '18000'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });
const targets = await cdp.targets();
let page = targets.find((t) => t.type === 'page' && t.url.includes(CHANNEL));
let scratch = null;
if (!page) {
  // open our own tab on that channel rather than touching the operator's
  const url = arg('--url', 'https://discord.com/channels/' + arg('--guild', '1499516436752634096') + '/' + CHANNEL);
  console.log('opening a scratch tab on', url);
  const r = await cdp.send('Target.createTarget', { url, background: true });
  scratch = r.targetId;
  page = { targetId: scratch, title: '(scratch)', url };
  await sleep(2000);
}
console.log('tab:', page.title, '|', page.url);

const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
for (let i = 0; i < 8; i++) {
  try { await cdp.send('Runtime.enable', {}, sessionId); break; } catch (e) { await sleep(1200); }
}
await cdp.send('Network.enable', {}, sessionId);

const seen = [];
cdp.on(async (msg) => {
  if (msg.sessionId !== sessionId) return;
  if (msg.method !== 'Network.responseReceived') return;
  const r = msg.params.response;
  const interesting = /\/api\/v\d+\/channels\//.test(r.url) || r.status >= 400;
  if (!interesting) return;
  let body = null;
  try {
    const b = await cdp.send('Network.getResponseBody', { requestId: msg.params.requestId }, sessionId);
    body = (b.body || '').slice(0, 400);
  } catch (e) { body = '(no body: ' + e.message + ')'; }
  seen.push({ status: r.status, url: r.url.replace(/^https:\/\/discord\.com/, '').slice(0, 140), body });
});

await cdp.send('Page.reload', {}, sessionId);
await sleep(WAIT);
for (const s of seen) {
  console.log('\n' + s.status + '  ' + s.url);
  console.log('   ' + s.body.replace(/\s+/g, ' ').slice(0, 300));
}

const info = await cdp.evaluate(sessionId, `(() => {
  const ag = window.__AGEGATE__;
  const t = (document.body ? document.body.innerText : '').replace(/\\s+/g,' ');
  return {
    version: ag ? ag.version : null,
    stats: ag ? JSON.parse(JSON.stringify(ag.stats)) : null,
    failedToLoad: /failed to load/i.test(t),
    bodySnippet: t.slice(0, 260),
  };
})()`);
console.log('\nclient:', JSON.stringify(info, null, 2));
cdp.close();
