/*
 * Read-only live probe. Never raises a window, never navigates, never closes.
 * Uses Page.setWebLifecycleState to thaw a frozen background tab so it will
 * answer Runtime.evaluate, without stealing focus.
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const MATCH = arg('--match', 'discord\\.com');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });
const targets = await cdp.targets();
const pages = targets.filter((t) => t.type === 'page' && new RegExp(MATCH).test(t.url || ''));
console.log('matching tabs: ' + pages.length);

for (const p of pages) {
  let sessionId;
  try {
    const a = await cdp.send('Target.attachToTarget', { targetId: p.targetId, flatten: true });
    sessionId = a.sessionId;
    await cdp.send('Page.enable', {}, sessionId);
    try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
    for (let i = 0; i < 5; i++) {
      try { await cdp.send('Runtime.enable', {}, sessionId); break; }
      catch (e) { await sleep(1500); }
    }
    const info = await cdp.evaluate(sessionId, `(() => {
      const ag = window.__AGEGATE__;
      return {
        version: ag ? ag.version : null,
        stats: ag ? JSON.parse(JSON.stringify(ag.stats)) : null,
        url: location.href,
        gateModal: !!document.querySelector('[data-testid="age-verification-container"]'),
        birthdayInput: !!document.querySelector('input[name="birthday"], input[name="date_of_birth"]'),
        bodyText: (document.body ? document.body.innerText : '').replace(/\\s+/g,' ').slice(0, 200),
      };
    })()`);
    console.log('\n=== ' + p.title + ' ===');
    console.log(JSON.stringify(info, null, 2));
  } catch (e) {
    console.log('\n=== ' + p.title + ' ===  probe failed: ' + e.message);
  }
}
cdp.close();
