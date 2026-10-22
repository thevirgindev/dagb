/*
 * Read the real, server-side age state of the logged-in Discord account.
 *
 * Runs the request inside the page but from a same-origin iframe, so it uses
 * the browser's cookies and the account token without going through the
 * extension's own fetch override (which would rewrite the very fields we want
 * to read raw).
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));

const cdp = await connect(PORT, { timeout: 20000 });
const targets = await cdp.targets();
const page = targets.find((t) => t.type === 'page' && /discord\.com/.test(t.url || ''));
if (!page) { console.log('no discord tab'); process.exit(1); }

try { await cdp.send('Target.activateTarget', { targetId: page.targetId }); } catch { /* ignore */ }
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
await cdp.send('Runtime.enable', {}, sessionId);

const expr = `(async () => {
  const out = {};
  const fr = document.createElement('iframe');
  fr.style.display = 'none';
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  let token = null;
  for (const k of ['token','tokens']) { const v = w.localStorage.getItem(k); if (v && v.length > 30) { token = v; break; } }
  out.tokenLen = token ? token.length : 0;
  if (token) {
    for (const p of ['/api/v10/users/@me','/api/v9/users/@me/settings','/api/v9/gateway']) {
      try {
        const r = await w.fetch(p, { headers: { Authorization: token, 'X-Discord-Locale': 'en-US' } });
        const txt = await r.text();
        let j = null; try { j = JSON.parse(txt); } catch {}
        out[p] = { status: r.status };
        if (j && typeof j === 'object') {
          if (p.endsWith('/users/@me')) {
            out[p].user = {
              id: j.id, username: j.username, global_name: j.global_name,
              age_verification_status: j.age_verification_status,
              nsfw_allowed: j.nsfw_allowed,
              flags: j.flags, public_flags: j.public_flags,
              date_of_birth: j.date_of_birth,
              premium_type: j.premium_type,
            };
          } else if (p.endsWith('/settings')) {
            const ageish = {};
            for (const k of Object.keys(j)) if (/age|adult|nsfw|verif|safety/i.test(k)) ageish[k] = j[k];
            out[p].ageish = ageish;
          } else {
            out[p].body = j;
          }
        } else {
          out[p].raw = txt.slice(0, 200);
        }
      } catch (e) { out[p] = { error: String(e) }; }
    }
  }
  fr.remove();
  return out;
})()`;

const res = await cdp.evaluate(sessionId, expr);
console.log(JSON.stringify(res, null, 2));
cdp.close();
