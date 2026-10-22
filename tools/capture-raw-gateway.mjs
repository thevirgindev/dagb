/*
 * Capture Discord's raw gateway frames off the wire and inflate them, so we
 * can read what the server actually says about the account - before any of
 * the extension's rewriting.
 */
import zlib from 'node:zlib';
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const WAIT = Number(arg('--wait', '16000'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });

const tab = await cdp.send('Target.createTarget', { url: 'about:blank', background: true });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
await cdp.send('Network.enable', {}, sessionId);
await cdp.send('Page.enable', {}, sessionId);
try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch { /* ignore */ }
for (let i = 0; i < 8; i++) {
  try { await cdp.send('Runtime.enable', {}, sessionId); break; } catch (e) { await sleep(1500); }
}

const frames = [];
cdp.on((msg) => {
  if (msg.sessionId !== sessionId) return;
  if (msg.method === 'Network.webSocketFrameReceived') {
    frames.push({ opcode: msg.params.response.opcode, data: msg.params.response.payloadData });
  }
});

await cdp.send('Page.navigate', { url: 'https://discord.com/app' }, sessionId);
await sleep(WAIT);

console.log('raw gateway frames captured:', frames.length);

let ready = null;
let userUpdate = null;
const types = new Map();

for (const f of frames) {
  if (f.opcode !== 2) continue; // binary
  let buf;
  try { buf = Buffer.from(f.data, 'base64'); } catch { continue; }
  let text = null;
  try {
    text = zlib.inflateSync(buf, { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString('utf8');
  } catch (e) {
    try { text = zlib.inflateSync(buf).toString('utf8'); } catch { continue; }
  }
  // a zlib-stream frame can carry several messages back to back
  let idx = 0;
  while (idx < text.length) {
    const brace = text.indexOf('{', idx);
    if (brace === -1) break;
    let depth = 0, end = -1;
    for (let i = brace; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) break;
    const chunk = text.slice(brace, end + 1);
    idx = end + 1;
    let obj = null;
    try { obj = JSON.parse(chunk); } catch { continue; }
    if (!obj || !obj.t) continue;
    types.set(obj.t, (types.get(obj.t) || 0) + 1);
    if (obj.t === 'READY' && !ready) ready = obj;
    if (obj.t === 'USER_UPDATE' && !userUpdate) userUpdate = obj;
  }
}

console.log('dispatch types seen:', JSON.stringify([...types.entries()].slice(0, 15)));

function ageBits(u) {
  if (!u) return null;
  const keys = Object.keys(u).filter((k) => /age|adult|nsfw|verif|assurance|safety|flag/i.test(k));
  const out = { id: u.id, username: u.username };
  for (const k of keys) out[k] = u[k];
  return out;
}

if (ready) {
  console.log('\n=== READY (raw from Discord) ===');
  console.log('user age fields:', JSON.stringify(ageBits(ready.d && ready.d.user), null, 2));
  console.log('READY top-level age-ish keys:', JSON.stringify(Object.keys(ready.d || {}).filter((k) => /age|verif|assurance|safety|user/i.test(k))));
} else {
  console.log('\nno READY frame captured');
}
if (userUpdate) {
  console.log('\n=== USER_UPDATE (raw) ===');
  console.log(JSON.stringify(ageBits(userUpdate.d && userUpdate.d.user), null, 2));
}

try { await cdp.send('Target.closeTarget', { targetId: tab.targetId }); console.log('\nscratch tab closed'); } catch { /* ignore */ }
cdp.close();
