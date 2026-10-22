/*
 * Screenshot the extension popup so the design can be reviewed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const EXT_ID = arg('--extid', 'aefopkdgcnadoafgigdmofhbbbclakgo');
const OUT = arg('--out', 'popup.png');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });
const tab = await cdp.send('Target.createTarget', { url: 'chrome-extension://' + EXT_ID + '/src/popup.html', background: true });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
await cdp.send('Runtime.enable', {}, sessionId);
try {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 380, height: 720, deviceScaleFactor: 2, mobile: false }, sessionId);
} catch { /* ignore */ }
await sleep(2500);
const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: false }, sessionId);
fs.writeFileSync(path.resolve(OUT), Buffer.from(shot.data, 'base64'));
const text = await cdp.evaluate(sessionId, 'document.body ? document.body.innerText.replace(/\\s+/g, " ").slice(0, 400) : ""');
console.log('popup text:', text);
console.log('screenshot ->', path.resolve(OUT));
try { await cdp.send('Target.closeTarget', { targetId: tab.targetId }); } catch { /* ignore */ }
cdp.close();
