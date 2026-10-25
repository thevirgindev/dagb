import fs from 'node:fs';
import path from 'node:path';

const STATE = path.join(process.env.TEMP || '/tmp', 'dagb-rig-state.json');
const API = 'https://api.mail.tm';
const LOL = 'https://api.tempmail.lol';

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; }
}
function writeState(s) {
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
}
async function jf(url, opts = {}) {
  const r = await fetch(url, opts);
  const body = await r.text();
  let data = null;
  try { data = JSON.parse(body); } catch { data = body; }
  return { status: r.status, data };
}
function findVerifyLink(items) {
  for (const item of items) {
    const text = [item.body || '', item.html || '', item.text || '', typeof item === 'string' ? item : ''].join(' ');
    const m = text.match(/https:\/\/link\.discord\.com[^\s"'<>]+/i) || text.match(/https:\/\/discord\.com[^\s"'<>]*(verify|verify_email)[^\s"'<>]*/i);
    if (m) return m[0];
  }
  return null;
}
function extractList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data && data.email)) return data.email;
  if (data && Array.isArray(data['hydra:member'])) return data['hydra:member'];
  return [];
}

const cmd = process.argv[2];
const provider = process.argv[3];

if (cmd === 'create') {
  const pass = 'rig-' + Math.random().toString(36).slice(2, 12) + 'A1!';
  const s0 = readState();
  if (provider === 'lol') {
    const pre = await jf(LOL + '/v2/inbox', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    let address = null, token = null, kind = 'v2';
    if (pre.status < 300 && pre.data && pre.data.address) {
      address = pre.data.address;
      token = pre.data.token;
    } else {
      const g = await jf(LOL + '/generate');
      if (g.status < 300 && g.data && g.data.address) {
        address = g.data.address;
        token = g.data.token;
        kind = 'v1';
      }
    }
    if (!address) { console.log('lol create failed', pre.status, JSON.stringify(pre.data).slice(0, 200)); process.exit(1); }
    writeState(Object.assign(s0, { mail: { provider: 'lol', kind, address, token, password: pass } }));
    console.log('mailbox ready (lol ' + kind + '):', address);
  } else {
    const domains = await jf(API + '/domains?page=1');
    const all = (domains.data['hydra:member'] || []).filter((d) => d.isActive && d.isPrivate === false).map((d) => d.domain);
    const used = s0.usedDomains || [];
    const fresh = all.filter((d) => !used.includes(d));
    const pool = fresh.length ? fresh : all;
    if (!pool.length) { console.log('no mail domains available'); process.exit(1); }
    const dom = pool[0];
    const address = 'dagbrig' + Math.random().toString(36).slice(2, 10) + '@' + dom;
    const acc = await jf(API + '/accounts', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, password: pass }),
    });
    if (acc.status !== 201) { console.log('mail account create failed', acc.status, JSON.stringify(acc.data).slice(0, 200)); process.exit(1); }
    const tok = await jf(API + '/token', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, password: pass }),
    });
    if (tok.status !== 200) { console.log('mail token failed', tok.status); process.exit(1); }
    s0.usedDomains = Array.from(new Set(used.concat([dom])));
    writeState(Object.assign(s0, { mail: { provider: 'mailtm', address, password: pass, token: tok.data.token, id: acc.data.id } }));
    console.log('mailbox ready (mailtm):', address);
  }
} else if (cmd === 'poll') {
  const s = readState();
  if (!s.mail) { console.log('no mailbox'); process.exit(1); }
  const timeoutMs = Number(process.argv[4] || 90000);
  const end = Date.now() + timeoutMs;
  const mail = s.mail;
  while (Date.now() < end) {
    if (mail.provider === 'lol') {
      const url = mail.kind === 'v2' ? (LOL + '/v2/inbox/' + mail.token) : (LOL + '/auth/' + mail.token);
      const list = await jf(url);
      const link = findVerifyLink(extractList(list.data));
      if (link) { console.log('verify link:', link); process.exit(0); }
    } else {
      const list = await jf(API + '/messages', { headers: { authorization: 'Bearer ' + mail.token } });
      const items = extractList(list.data);
      for (const item of items) {
        const full = await jf(API + '/messages/' + item.id, { headers: { authorization: 'Bearer ' + mail.token } });
        const text = (full.data.text || '') + ' ' + (full.data.html || '');
        writeState(Object.assign(s, { lastMail: { from: item.from && item.from.address, subject: item.subject } }));
        const m = text.match(/https:\/\/link\.discord\.com[^\s"'<>]+/i) || text.match(/https:\/\/discord\.com[^\s"'<>]*(verify|verify_email)[^\s"'<>]*/i);
        if (m) { console.log('verify link:', m[0]); process.exit(0); }
        console.log('mail:', item.subject);
      }
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  console.log('no mail within ' + timeoutMs + 'ms');
  process.exit(2);
} else if (cmd === 'state') {
  const s = readState();
  console.log(JSON.stringify({
    mail: s.mail && s.mail.address,
    provider: s.mail && s.mail.provider,
    lastMail: s.lastMail,
    usedDomains: s.usedDomains,
    test: s.test,
  }, null, 2));
} else if (cmd === 'note') {
  const key = process.argv[3];
  const val = process.argv.slice(4).join(' ');
  const s = readState();
  s.test = Object.assign({}, s.test, { [key]: val });
  writeState(s);
  console.log('noted', key);
} else {
  console.log('create mailtm|lol | poll mailtm|lol <ms> | state | note <k> <v>');
}
