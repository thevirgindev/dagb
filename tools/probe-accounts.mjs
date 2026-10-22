/*
 * Enumerate every Discord account stored in this browser profile and read each
 * one's real age-verification state from Discord's API.
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const WAIT = Number(arg('--wait', '14000'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });
const tab = await cdp.send('Target.createTarget', { url: 'about:blank', background: true });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
for (let i = 0; i < 8; i++) {
  try { await cdp.send('Runtime.enable', {}, sessionId); break; } catch (e) { await sleep(1500); }
}
await cdp.send('Page.navigate', { url: 'https://discord.com/app' }, sessionId);
await sleep(WAIT);

const expr = `(async () => {
  const fr = document.createElement('iframe');
  fr.style.display = 'none';
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  const ls = w.localStorage;
  let deviceProps = null;
  try { deviceProps = JSON.parse(ls.getItem('deviceProperties')); } catch (e) {}

  const accounts = [];
  const seen = new Set();
  const add = (label, rawToken) => {
    if (!rawToken) return;
    let t = rawToken;
    try { t = JSON.parse(t); } catch (e) {}
    if (typeof t !== 'string' || t.length < 40 || seen.has(t)) return;
    seen.add(t);
    accounts.push({ label, token: t });
  };
  add('token', ls.getItem('token'));
  add('tokens', ls.getItem('tokens'));
  try {
    const raw = ls.getItem('MultiAccountStore');
    if (raw) {
      const parsed = JSON.parse(raw);
      accounts.length; // parsed below
      const walk = (obj, path) => {
        if (!obj || typeof obj !== 'object') return;
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === 'string' && v.length > 40 && /^[A-Za-z0-9._-]{60,}$/.test(v)) add(path + '.' + k, v);
          else if (v && typeof v === 'object') walk(v, path + '.' + k);
        }
      };
      walk(parsed, 'MultiAccountStore');
      accounts.raw = parsed;
    }
  } catch (e) { accounts.multiError = String(e); }

  const out = { found: accounts.length, results: [] };
  for (const a of accounts) {
    try {
      const headers = { Authorization: a.token, 'Content-Type': 'application/json' };
      if (deviceProps) headers['X-Super-Properties'] = btoa(JSON.stringify(deviceProps));
      const r = await w.fetch('/api/v10/users/@me', { headers, credentials: 'include', cache: 'no-store' });
      const j = await r.json().catch(() => null);
      out.results.push({
        label: a.label,
        status: r.status,
        id: j && j.id,
        username: j && j.username,
        global_name: j && j.global_name,
        age_verification_status: j && j.age_verification_status,
        nsfw_allowed: j && j.nsfw_allowed,
        verified: j && j.verified,
        flags: j && j.flags,
        premium_type: j && j.premium_type,
      });
    } catch (e) { out.results.push({ label: a.label, error: String(e) }); }
  }
  fr.remove();
  return out;
})()`;

const res = await cdp.evaluate(sessionId, expr);
console.log(JSON.stringify(res, null, 2));
try { await cdp.send('Target.closeTarget', { targetId: tab.targetId }); } catch { /* ignore */ }
cdp.close();
