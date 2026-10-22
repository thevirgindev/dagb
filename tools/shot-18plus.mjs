/*
 * Screenshot the age-gated channel in a scratch tab, as proof that the
 * messages actually render.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const CHANNEL = arg('--channel', '1499670807146664049');
const GUILD = arg('--guild', '1499516436752634096');
const OUT = arg('--out', 'agegate-18plus.png');
const WAIT = Number(arg('--wait', '16000'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });
const url = 'https://discord.com/channels/' + GUILD + '/' + CHANNEL;
const r = await cdp.send('Target.createTarget', { url, background: true });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: r.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
await cdp.send('Runtime.enable', {}, sessionId);
try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
for (let i = 0; i < 8; i++) {
  try { await cdp.send('Runtime.enable', {}, sessionId); break; } catch { await sleep(1200); }
}
await sleep(WAIT);
try {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
} catch { /* ignore */ }

const info = await cdp.evaluate(sessionId, `(() => {
  const t = (document.body ? document.body.innerText : '').replace(/\\s+/g,' ');
  return {
    failedToLoad: /failed to load/i.test(t),
    hasMessageText: /TITHUB|BREAST|community/i.test(t),
    bubble: !!document.getElementById('__agegate_bubble'),
    snippet: t.slice(0, 400),
  };
})()`);
console.log(JSON.stringify(info, null, 2));

const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: false }, sessionId);
fs.writeFileSync(path.resolve(OUT), Buffer.from(shot.data, 'base64'));
console.log('screenshot ->', path.resolve(OUT));

try { await cdp.send('Target.closeTarget', { targetId: r.targetId }); } catch { /* ignore */ }
cdp.close();
