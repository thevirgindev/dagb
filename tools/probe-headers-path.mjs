/*
 * Does Discord's client build its X-Super-Properties header through the
 * Headers class? If it does, a page-level header rewrite works everywhere,
 * with no extension permission involved.
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });
const r = await cdp.send('Target.createTarget', { url: 'https://discord.com/app', background: true });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: r.targetId, flatten: true });
await cdp.send('Runtime.enable', {}, sessionId);
await sleep(12000);

const expr = `(async () => {
  const seen = [];
  const origSet = Headers.prototype.set;
  const origAppend = Headers.prototype.append;
  Headers.prototype.set = function (n, v) {
    if (String(n).toLowerCase().indexOf('super-properties') !== -1) seen.push({ via: 'set', value: String(v).slice(0, 24) });
    return origSet.call(this, n, v);
  };
  Headers.prototype.append = function (n, v) {
    if (String(n).toLowerCase().indexOf('super-properties') !== -1) seen.push({ via: 'append', value: String(v).slice(0, 24) });
    return origAppend.call(this, n, v);
  };
  await fetch('/api/v9/users/@me', { credentials: 'include' }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  return { seen: seen, count: seen.length };
})()`;

const out = await cdp.evaluate(sessionId, expr);
console.log('headers patch probe:', JSON.stringify(out));
try { await cdp.send('Target.closeTarget', { targetId: r.targetId }); } catch { /* ignore */ }
cdp.close();
