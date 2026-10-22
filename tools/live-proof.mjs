/*
 * Live proof on the real Discord client, in a scratch tab of the operator's
 * own Helium profile:
 *   - did the gateway READY frame get patched, and what did the user become
 *   - does the client still reach Discord's age-verification endpoints
 *   - is any age-gate UI on screen
 * The operator's own tabs are never touched.
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const WAIT = Number(arg('--wait', '16000'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });

const tab = await cdp.send('Target.createTarget', { url: 'about:blank', background: true });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
await cdp.send('Network.enable', {}, sessionId);
await cdp.send('Page.enable', {}, sessionId);
try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
for (let i = 0; i < 8; i++) {
  try { await cdp.send('Runtime.enable', {}, sessionId); break; } catch (e) { await sleep(1500); }
}

const calls = [];
const sockets = [];
cdp.on((msg) => {
  if (msg.sessionId !== sessionId) return;
  if (msg.method === 'Network.requestWillBeSent') {
    const u = msg.params.request.url;
    if (/age-verification|age-signal|users\/@me|auth\/login|age_assurance/i.test(u)) {
      calls.push({ method: msg.params.request.method, url: u.replace(/^https:\/\/discord\.com/, '').slice(0, 110) });
    }
  }
  if (msg.method === 'Network.webSocketCreated') {
    sockets.push({ url: msg.params.url, initiator: msg.params.initiator?.type });
  }
});

await cdp.send('Page.navigate', { url: 'https://discord.com/app' }, sessionId);
await sleep(WAIT);

const info = await cdp.evaluate(sessionId, `(() => {
  const ag = window.__AGEGATE__;
  return {
    version: ag ? ag.version : null,
    stats: ag ? JSON.parse(JSON.stringify(ag.stats)) : null,
    lastUser: ag && ag.lastUser ? ag.lastUser : null,
    gateModal: !!document.querySelector('[data-testid="age-verification-container"]'),
    birthdayInput: !!document.querySelector('input[name="birthday"], input[name="date_of_birth"]'),
    ageText: Array.from(document.querySelectorAll('div,span,h1,h2,h3')).map(e => (e.textContent||'').trim())
      .filter(t => t && t.length < 140 && /verify your age|age verification|enter your birthday|confirm your age/i.test(t)).slice(0, 5),
    bodyText: (document.body ? document.body.innerText : '').replace(/\\s+/g,' ').slice(0, 240),
  };
})()`);

console.log(JSON.stringify(info, null, 2));
console.log('\nage-related API calls the client made:', calls.length);
for (const c of calls) console.log('  ', c.method, c.url);
console.log('\ngateways:');
for (const s of sockets) console.log('  ', s.url, '| via', s.initiator);

try { await cdp.send('Target.closeTarget', { targetId: tab.targetId }); console.log('\nscratch tab closed'); } catch { /* ignore */ }
cdp.close();
