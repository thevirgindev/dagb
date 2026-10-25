import { connect } from './cdp.mjs';

const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const cmd = args[0];

const cdp = await connect(PORT, { timeout: 20000 });

async function discordSession() {
  const t = await cdp.targets();
  const p = t.filter((x) => x.type === 'page' && /discord\.com/.test(x.url || ''));
  if (!p.length) throw new Error('no discord.com page');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: p[0].targetId, flatten: true });
  return sessionId;
}

const openField = (label) => `(async () => {
  const label = ${JSON.stringify(label)};
  const anchor = Array.from(document.querySelectorAll('[role="combobox"]'))
    .filter((el) => (el.getAttribute('aria-label') || '').trim().toLowerCase() === label.toLowerCase())[0];
  if (!anchor) return 'no-anchor';
  anchor.scrollIntoView({ block: 'center' });
  anchor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  anchor.click();
  await new Promise((r) => setTimeout(r, 650));
  const opts = Array.from(document.querySelectorAll('[role="option"], li')).map((el) => (el.textContent || '').trim())
    .filter((t) => t && t.length <= 14);
  const sel = Array.from(document.querySelectorAll('[role="option"], li'))
    .map((el) => ({ t: (el.textContent || '').trim(), s: el.getAttribute('aria-selected') }))
    .find((o) => o.s === 'true');
  return JSON.stringify({ opened: label, sel: sel ? sel.t : null, sample: opts.slice(0, 8), count: opts.length });
})()`;

const readSel = `(async () => {
  await new Promise((r) => setTimeout(r, 150));
  const opts = Array.from(document.querySelectorAll('[role="option"], li'))
    .map((el) => ({ t: (el.textContent || '').trim(), s: el.getAttribute('aria-selected') }))
    .filter((o) => o.t && o.t.length <= 14);
  const sel = opts.find((o) => o.s === 'true');
  return JSON.stringify({ sel: sel ? sel.t : null, first: opts.length ? opts[0].t : null, count: opts.length });
})()`;

const searchClick = (want) => `(async () => {
  const want = ${JSON.stringify(want)};
  await new Promise((r) => setTimeout(r, 100));
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const all = Array.from(document.querySelectorAll('[role="option"], li'))
    .map((el) => ({ el, text: (el.textContent || '').trim(), sel: el.getAttribute('aria-selected') }))
    .filter((o) => o.text && o.text.length <= 14);
  const sel = all.find((o) => o.sel === 'true');
  if (sel && sel.text.toLowerCase() === want.toLowerCase()) return JSON.stringify({ ok: true, selected: sel.text });
  const match = all.find((o) => o.text.toLowerCase() === want.toLowerCase());
  if (!match) return JSON.stringify({ ok: false, sample: all.slice(0, 6).map((o) => o.text) });
  match.el.scrollIntoView({ block: 'center' });
  await new Promise((r) => setTimeout(r, 180));
  match.el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  match.el.click();
  await new Promise((rr) => setTimeout(rr, 320));
  const chosen = Array.from(document.querySelectorAll('[role="option"], li'))
    .map((el) => ({ t: (el.textContent || '').trim(), s: el.getAttribute('aria-selected') }))
    .find((o) => o.s === 'true');
  return JSON.stringify({ ok: !!chosen && chosen.t.toLowerCase() === want.toLowerCase(), selected: chosen ? chosen.t : null });
})()`;

const escKey = (sid) => Promise.all([
  cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sid),
  cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sid),
]).then(() => sleep(300));

function keyF(sid, spec) {
  return cdp.send('Input.dispatchKeyEvent', spec, sid);
}

async function arrows(sid, n) {
  for (let k = 0; k < n; k++) {
    await keyF(sid, { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    await keyF(sid, { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    await sleep(80);
  }
}

async function enterKey(sid) {
  await keyF(sid, { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await keyF(sid, { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(350);
}

async function rectOfLabel(sid, label) {
  const out = await cdp.evaluate(sid, `(() => {
    const label = ${JSON.stringify(label)};
    const anchor = Array.from(document.querySelectorAll('[role="combobox"]'))
      .filter((el) => (el.getAttribute('aria-label') || '').trim().toLowerCase() === label.toLowerCase())[0];
    if (!anchor) return 'no-anchor';
    anchor.scrollIntoView({ block: 'center' });
    const r = anchor.getBoundingClientRect();
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  })()`);
  if (String(out) === 'no-anchor') return null;
  return JSON.parse(out);
}

async function realClick(sid, x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sid).catch(() => {});
  await sleep(60);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sid);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sid);
  await sleep(550);
}

async function realEnter(sid) {
  await keyF(sid, { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await keyF(sid, { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(500);
}

async function anchorValue(sid, label) {
  const out = await cdp.evaluate(sid, `(() => {
    const label = ${JSON.stringify(label)};
    const anchor = Array.from(document.querySelectorAll('[role="combobox"]'))
      .filter((el) => (el.getAttribute('aria-label') || '').trim().toLowerCase() === label.toLowerCase())[0];
    if (!anchor) return 'none';
    anchor.scrollIntoView({ block: 'center' });
    const text = (anchor.textContent || '').trim();
    const container = anchor.closest('[class*="outer"], [class*="field"], [class*="container"]');
    return JSON.stringify({ text: text, sib: container ? (container.textContent || '').trim().slice(0, 20) : '' });
  })()`);
  try {
    const p = JSON.parse(out);
    return p.text || p.sib;
  } catch { return out; }
}

function arrowCount(label, steps) {
  const desc = label === 'Year';
  if ((steps > 0 && !desc) || (steps < 0 && desc)) return { down: Math.abs(steps), up: 0 };
  return { down: 0, up: Math.abs(steps) };
}

async function driveNumericField(sid, label, want) {
  const target = parseInt(want, 10);
  for (let round = 0; round < 4; round++) {
    const pt = await rectOfLabel(sid, label);
    if (!pt) { console.log(label, 'anchor missing'); return false; }
    await realClick(sid, pt.x, pt.y);
    const st = JSON.parse(await cdp.evaluate(sid, readSel));
    if (st.count === 0 || (st.sel == null && st.first == null)) {
      console.log(label, 'popup did not open (round ' + (round + 1) + ')');
      await escKey(sid);
      continue;
    }
    const start = st.sel || st.first;
    const steps = target - parseInt(start, 10);
    const n = arrowCount(label, steps);
    await arrows(sid, n.down);
    for (let k = 0; k < n.up; k++) {
      await keyF(sid, { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
      await keyF(sid, { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
      await sleep(80);
    }
    const mid = await cdp.evaluate(sid, readSel);
    await realEnter(sid);
    await sleep(500);
    const got = await anchorValue(sid, label);
    const gotN = parseInt(String(got), 10);
    if (gotN === target) { console.log(label, '=', got, '(start ' + start + ', arrows ' + JSON.stringify(n) + ', mid ' + mid.slice(0, 60) + ')'); return true; }
    console.log(label, 'round ' + (round + 1) + ' start=' + start + ' steps=' + steps + ' got=' + got);
    await escKey(sid);
  }
  return false;
}

if (cmd === 'value') {
  const sid = await discordSession();
  const out = await cdp.evaluate(sid, `(() => {
    const labels = ['Day', 'Month', 'Year'];
    return JSON.stringify(labels.map((lab) => {
      const els = Array.from(document.querySelectorAll('[role="combobox"]')).filter((el) => (el.getAttribute('aria-label') || '') === lab);
      return lab + '=' + (els[0] ? (els[0].textContent || '').trim() : 'none');
    }).join(' '));
  })()`);
  console.log(out);
} else if (cmd === 'set' || cmd === 'keyset') {
  const [day, month, year] = args.slice(1);
  if (!day || !month || !year) { console.log(cmd + ' <day> <month> <year>'); process.exit(1); }
  const sid = await discordSession();

  let monthOk = false;
  for (let attempt = 0; attempt < 3 && !monthOk; attempt++) {
    const opened = await cdp.evaluate(sid, openField('Month'));
    console.log('Month open:', opened);
    if (String(opened).includes('no-anchor')) break;
    for (let tick = 0; tick < 6 && !monthOk; tick++) {
      const res = await cdp.evaluate(sid, searchClick(month));
      try { const p = JSON.parse(res); if (p.ok) { monthOk = true; console.log('Month set =', month, '(selected ' + p.selected + ')'); } } catch {}
      await sleep(150);
    }
    await escKey(sid);
  }
  if (!monthOk) {
    const pt = await rectOfLabel(sid, 'Month');
    if (pt) {
      await realClick(sid, pt.x, pt.y);
      const st = JSON.parse(await cdp.evaluate(sid, readSel));
      for (let k = 0; k < 5; k++) {
        await keyF(sid, { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
        await keyF(sid, { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
        await sleep(80);
      }
      await realEnter(sid);
      const got = await anchorValue(sid, 'Month');
      if (String(got).toLowerCase() === String(month).toLowerCase()) { monthOk = true; console.log('Month set =', got, '(keyboard)'); }
      else console.log('Month keyboard attempt got', got);
      await escKey(sid);
    }
  }
  if (!monthOk) console.log('Month: FAILED');

  const dayOk = await driveNumericField(sid, 'Day', day);
  const yearOk = await driveNumericField(sid, 'Year', year);

  const final = [];
  for (const lab of ['Day', 'Month', 'Year']) {
    final.push(lab + '=' + (await anchorValue(sid, lab)));
  }
  console.log('final:', final.join(' '), '| dayOk=' + dayOk + ' monthOk=' + monthOk + ' yearOk=' + yearOk);
} else if (cmd === 'submit') {
  const sid = await discordSession();
  const out = await cdp.evaluate(sid, `(() => {
    const vis = (el) => el.offsetParent !== null || el.getBoundingClientRect().width > 0;
    const btns = Array.from(document.querySelectorAll('button')).filter((b) => vis(b) && !b.disabled);
    const t = btns.find((b) => /continue|next|create account|submit/i.test(b.textContent || ''));
    if (t) { t.click(); return 'clicked:' + (t.textContent || '').trim().slice(0, 30); }
    return 'none:' + btns.map((b) => (b.textContent || '').trim().slice(0, 20)).join('|');
  })()`);
  console.log('action:', out);
  await sleep(6000);
  const dump = await cdp.evaluate(sid, `(() => {
    const sig = (el) => [
      el.tagName.toLowerCase(), el.type || '', el.name || '',
      (el.getAttribute('aria-label') || ''), (el.textContent || '').trim().slice(0, 40),
    ].join(' | ');
    return JSON.stringify({
      url: location.href,
      text: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 400),
      els: Array.from(document.querySelectorAll('input,button,select,[role="combobox"]')).map(sig).slice(0, 30),
    });
  })()`);
  console.log(dump);
} else {
  console.log('value | set <d> <m> <y> | submit');
}
cdp.close();
