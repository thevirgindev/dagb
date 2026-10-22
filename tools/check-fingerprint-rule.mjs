/*
 * Read the extension's fingerprint-rewrite state: is the declarativeNetRequest
 * rule installed, and what did the worker say?
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const EXT_ID = arg('--extid', 'aefopkdgcnadoafgigdmofhbbbclakgo');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });
const t = await cdp.send('Target.createTarget', { url: 'chrome-extension://' + EXT_ID + '/src/popup.html', background: true });
await sleep(1800);
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
for (let i = 0; i < 6; i++) {
  try { await cdp.send('Runtime.enable', {}, sessionId); break; } catch { await sleep(1000); }
}

const expr = `(async () => {
  const r = await chrome.storage.local.get(['agegate_sp', 'agegate_fp_active', 'agegate_fp_error']);
  let rules = null, dnrError = null;
  try { rules = await chrome.declarativeNetRequest.getDynamicRules(); } catch (e) { dnrError = String(e && e.message || e); }
  return {
    hasSp: !!r.agegate_sp,
    sp: r.agegate_sp || null,
    fpActive: r.agegate_fp_active || null,
    fpError: r.agegate_fp_error || null,
    rules: rules ? rules.map(x => ({ id: x.id, action: x.action, condition: x.condition })) : null,
    dnrError: dnrError,
  };
})()`;

const store = await cdp.evaluate(sessionId, expr);
console.log(JSON.stringify(store, null, 2));
try { await cdp.send('Target.closeTarget', { targetId: t.targetId }); } catch { /* ignore */ }
cdp.close();
