import fs from 'node:fs';
import { connect } from './cdp.mjs';

const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const cmd = args[0];

const cdp = await connect(PORT, { timeout: 20000 });

async function page() {
  const t = await cdp.targets();
  const p = t.filter((x) => x.type === 'page' && /discord\.com/.test(x.url || ''));
  if (p.length) {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: p[0].targetId, flatten: true });
    return { targetId: p[0].targetId, sessionId, url: p[0].url };
  }
  const np = await cdp.newPage('https://discord.com/register');
  await sleep(7000);
  return { targetId: np.targetId, sessionId: np.sessionId, url: 'https://discord.com/register' };
}

async function dump(sid) {
  const out = await cdp.evaluate(sid, `(() => {
    const sig = (el) => [
      el.tagName.toLowerCase(),
      el.type || '',
      el.name || '',
      (el.getAttribute('aria-label') || ''),
      (el.getAttribute('data-testid') || ''),
      (el.textContent || '').trim().slice(0, 50),
      (el.type === 'password') ? '' : String(el.value || '').slice(0, 24),
      el.disabled === true || el.getAttribute('aria-disabled') === 'true',
    ].join(' | ');
    const els = Array.from(document.querySelectorAll('input,button,select,textarea,a')).map(sig);
    const turnstile = !!document.querySelector('.cf-turnstile, iframe[src*="turnstile"], iframe[src*="challenge"]');
    return JSON.stringify({ url: location.href, turnstile, els: els.slice(0, 60) });
  })()`);
  try { return JSON.parse(out); } catch { return { raw: String(out) }; }
}

if (cmd === 'open' || cmd === 'dump') {
  const { sessionId } = await page();
  if (cmd === 'open') await sleep(6000);
  console.log(JSON.stringify(await dump(sessionId), null, 2));
} else if (cmd === 'fill') {
  const [email, password, username] = args.slice(1);
  const { sessionId } = await page();
  const setOut = await cdp.evaluate(sessionId, `(async () => {
    const [email, password, username] = ${JSON.stringify([email, password, username])};
    function fill(el, value) {
      if (!el) return 'missing';
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok:' + (el.name || el.getAttribute('aria-label') || el.type);
    }
    const vis = (el) => el.offsetParent !== null || el.getBoundingClientRect().width > 0;
    const inputs = Array.from(document.querySelectorAll('input')).filter(vis);
    const pick = (...keys) => inputs.find((i) => {
      const hay = [i.name, i.id, i.getAttribute('aria-label'), (i.labels || [])[0] && (i.labels || [])[0].textContent || ''].join(' ').toLowerCase();
      return keys.some((k) => hay.includes(k));
    });
    const res = {};
    const emailEl = pick('email');
    if (emailEl) res.email = fill(emailEl, email);
    const nameEl = pick('global_name', 'display');
    if (nameEl) res.display = fill(nameEl, username);
    const passEl = pick('password');
    if (passEl) res.password = fill(passEl, password);
    const userEl = pick('username');
    if (userEl) res.username = fill(userEl, username);
    const summary = inputs.map((i) => [i.name, i.type].join('|'));
    return JSON.stringify({ res, inputs: summary });
  })()`);
  console.log('inputs:', setOut);
  await sleep(1200);
  console.log(JSON.stringify(await dump(sessionId), null, 2));
} else if (cmd === 'submit') {
  const { sessionId } = await page();
  const clicked = await cdp.evaluate(sessionId, `(() => {
    const vis = (el) => el.offsetParent !== null || el.getBoundingClientRect().width > 0;
    const btns = Array.from(document.querySelectorAll('button')).filter((b) => vis(b) && !b.disabled);
    const t = btns.find((b) => /continue|create account|next|register/i.test(b.textContent || ''));
    if (t) { t.click(); return 'clicked:' + (t.textContent || '').trim().slice(0, 30); }
    return 'none';
  })()`);
  console.log('action:', clicked);
  await sleep(5000);
  console.log(JSON.stringify(await dump(sessionId), null, 2));
} else if (cmd === 'click') {
  const text = args.slice(1).join(' ');
  const { sessionId } = await page();
  const r = await cdp.evaluate(sessionId, `(() => {
    const want = ${JSON.stringify(text)};
    const cands = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    const vis = (el) => el.offsetParent !== null || el.getBoundingClientRect().width > 0;
    for (const el of cands) {
      if (!vis(el)) continue;
      if ((el.textContent || '').trim().toLowerCase().includes(want.toLowerCase())) {
        el.click();
        return 'clicked:' + (el.textContent || '').trim().slice(0, 40);
      }
    }
    return 'no match';
  })()`);
  console.log('click:', r);
  await sleep(3000);
  console.log(JSON.stringify(await dump(sessionId), null, 2));
} else if (cmd === 'url') {
  const { sessionId, targetId } = await page();
  const href = args.slice(1).join(' ');
  const r = await cdp.evaluate(sessionId, `(() => {
    const want = ${JSON.stringify(href)};
    const as = Array.from(document.querySelectorAll('a'));
    const el = as.find((a) => (a.href || '').includes(want)) || as.find((a) => (a.textContent || '').trim().includes(want));
    if (!el) return 'no link';
    const out = el.href;
    return 'found:' + out;
  })()`);
  console.log('url:', r);
  if (String(r).startsWith('found:')) {
    await cdp.send('Page.navigate', { url: String(r).slice(6) }, sessionId);
    await sleep(5000);
    console.log(JSON.stringify(await dump(sessionId), null, 2));
  }
} else if (cmd === 'goto') {
  const target = args.slice(1).join(' ');
  const { sessionId } = await page();
  await cdp.send('Page.navigate', { url: target }, sessionId);
  await sleep(7000);
  console.log(JSON.stringify(await dump(sessionId), null, 2));
} else if (cmd === 'shot') {
  const { sessionId } = await page();
  const s = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  fs.writeFileSync(args[1] || 'rig-shot.png', Buffer.from(s.data, 'base64'));
  console.log('shot saved', args[1] || 'rig-shot.png');
} else if (cmd === 'frames') {
  const { sessionId } = await page();
  const r = await cdp.send('Page.getFrameTree', {}, sessionId);
  const walk = (f) => ({ url: (f.frame || {}).url, children: (f.childFrames || []).map(walk) });
  console.log(JSON.stringify(walk(r.frameTree), null, 1).slice(0, 1500));
} else if (cmd === 'hc') {
  const { sessionId } = await page();
  const out = await cdp.evaluate(sessionId, `(() => {
    const fr = Array.from(document.querySelectorAll('iframe')).map((f) => {
      const r = f.getBoundingClientRect();
      return { src: (f.src || '').slice(0, 90), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    return JSON.stringify({ iw: window.innerWidth, ih: window.innerHeight, dpr: window.devicePixelRatio, iframes: fr });
  })()`);
  console.log(out);
} else if (cmd === 'hcclick') {
  const { sessionId } = await page();
  const pts = args.slice(1).map(Number);
  for (const [cx, cy] of [pts.slice(0, 2), pts.slice(2, 4)]) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy }, sessionId);
    await sleep(80);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 }, sessionId);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cy ? cx : cx, y: cy, button: 'left', clickCount: 1 }, sessionId);
    await sleep(600);
  }
  console.log('clicked', pts.join(','));
  await sleep(2500);
} else {
  console.log('open | dump | fill email password username | submit | click text | url href | goto url');
}
cdp.close();
