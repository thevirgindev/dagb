/*
 * Mock Discord API + gateway, used to verify the extension's rewrite path
 * without touching a live account.
 *
 *   GET   /api/v9/users/@me      -> user with age_verification_status:1, nsfw_allowed:false
 *   PATCH /api/v9/users/@me      -> 400 with data.date_of_birth  (the gate rejecting a birthday)
 *   POST  /api/v9/auth/login     -> 400 with data.date_of_birth  (the login age gate)
 *   GET   /api/v9/age-verification/methods
 *   GET   /mock-page             -> harness that exercises all of the above + the gateway
 *   WS    /gateway?v=9&encoding=json -> READY + USER_UPDATE frames carrying the same user
 */
import http from 'node:http';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const PORT = Number(process.env.MOCK_PORT || 8799);

const USER = {
  id: '111111111111111111',
  username: 'gatest',
  global_name: 'Gate St',
  avatar: null,
  discriminator: '0',
  nsfw_allowed: false,
  age_verification_status: 1,
  premium_type: 0,
  flags: 0,
  public_flags: 0,
  banner: null,
  accent_color: null,
  bio: null,
};

const GUILD = {
  id: '888333222111888333',
  name: 'Agegate Test',
  nsfw_level: 3,
  owner_configured_content_level: 3,
  features: ['COMMUNITY'],
  channels: [{ id: '444555666', type: 0, name: 'talk', nsfw: true }],
};

const json = (res, code, body) => {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(s) });
  res.end(s);
};

// every PATCH the extension makes, so the harness can assert on it
const patches = [];

const HARNESS = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>gate harness</title></head><body>
<h3 id="out">running</h3>
<script>
window.__results = {};
window.__done = false;
window.__err = null;
// the extension's keep-alive needs the same credentials Discord's client keeps
try {
  localStorage.setItem('token', JSON.stringify('MTA3MzIwNDQ3MTYxNjQzNjIyOA.GxT2k'));
  localStorage.setItem('deviceProperties', JSON.stringify({ os: 'Windows', browser: 'Chrome', device: '', system_locale: 'en-US' }));
} catch (e) {}
async function run() {
  try {
    const meRes = await fetch('/api/v9/users/@me');
    window.__results.meStatus = meRes.status;
    window.__results.me = await meRes.json();
    const pRes = await fetch('/api/v9/users/@me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date_of_birth: '1995-06-15' })
    });
    window.__results.patchStatus = pRes.status;
    window.__results.patchBody = await pRes.json();

    const lRes = await fetch('/api/v9/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
    });
    window.__results.loginStatus = lRes.status;
    window.__results.loginBody = await lRes.json();

    const mRes = await fetch('/api/v9/age-verification/methods');
    window.__results.methodsStatus = mRes.status;
    window.__results.methods = await mRes.json();

    const gRes = await fetch('/api/v9/guilds/888333222111888333');
    window.__results.guild = await gRes.json();

    // send a full-looking fingerprint and see what comes back, so the test can
    // prove the header rewrite runs in this browser
    const fullSp = btoa(JSON.stringify({
      os: 'Windows', browser: 'Chrome', device: '', device_model_name: '',
      system_locale: 'en-GB', has_client_mods: false,
      browser_user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/155.0.0.0 Safari/537.36',
      browser_version: '155.0.0.0', os_version: '10',
      referrer: 'https://discord.com/', referring_domain: 'discord.com',
      referrer_current: '', referring_domain_current: '',
      release_channel: 'stable', client_build_number: 643186, client_event_source: null,
      client_launch_id: '8461f575-ea65-4d9e-821c-db5034cf2269',
      launch_signature: '8d0c624e-1527-44ae-9f78-e81f4ac2f511',
      client_heartbeat_session_id: 'eea47253-d11c-46a5-8e27-b18ca7d9caeb',
      client_app_state: 'unfocused',
    }));
    const echoRes = await fetch('/mock-echo', { headers: { 'X-Super-Properties': fullSp } });
    window.__results.echo = await echoRes.json();

    const ws = new WebSocket('ws://' + location.host + '/gateway?v=9&encoding=json');
    ws.binaryType = 'arraybuffer';
    window.__dbg = {
      protoAddPatched: /patchEvent|__agegate/.test(String(WebSocket.prototype.addEventListener)),
      onmsgOwnOnWs: !!Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage'),
      onmsgOwnOnTarget: !!Object.getOwnPropertyDescriptor(EventTarget.prototype, 'onmessage'),
      jsonParsePatched: /patchParsed|__agegate|age_verification_status/.test(String(JSON.parse)) || JSON.parse.length !== 2,
    };
    ws.onmessage = async (e) => {
      window.__dbg.seen = (window.__dbg.seen || 0) + 1;
      window.__dbg.dataType = typeof e.data;
      try {
        let text;
        if (typeof e.data === 'string') {
          text = e.data;
        } else {
          // same shape as Discord: binary frame -> inflate -> JSON
          const inflated = new Response(e.data).body.pipeThrough(new DecompressionStream('deflate'));
          text = await new Response(inflated).text();
          window.__dbg.textHead = text.slice(0, 60);
        }
        const o = JSON.parse(text);
        window.__dbg.frameT = o.t;
        window.__dbg.frameKeys = Object.keys(o);
        const u = o.d && o.d.user ? o.d.user : o.user;
        if (o.t === 'READY') { window.__results.ready = u; }
        if (o.t === 'GUILD_CREATE') { window.__results.guildFrame = o.d; }
        if (o.t === 'USER_UPDATE') { window.__results.userUpdate = u; window.__done = true; }
      } catch (err) {
        window.__err = 'ws handler: ' + String(err && err.stack || err);
        window.__done = true;
      }
    };
    ws.onerror = () => { window.__err = 'ws error'; window.__done = true; };
    setTimeout(() => { window.__done = true; }, 6000);
  } catch (e) {
    window.__err = String(e);
    window.__done = true;
  }
}
run();
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || '127.0.0.1'));
  const p = url.pathname;

  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.method === 'PATCH') {
      let parsed = null;
      try { parsed = JSON.parse(body || '{}'); } catch (e) { /* ignore */ }
      patches.push({ path: p, body: parsed, headers: { authorization: !!req.headers.authorization, superProps: !!req.headers['x-super-properties'] } });
      console.log('[mock] PATCH', p, JSON.stringify(parsed));
    }
    route(req, res, url, p);
  });
});

function route(req, res, url, p) {
  if (p === '/mock-patches') {
    json(res, 200, { patches });
    return;
  }
  if (p === '/mock-echo') {
    // echoes the request headers back, so a test can prove the fingerprint
    // rewrite actually changed what went on the wire
    json(res, 200, { sp: req.headers['x-super-properties'] || null, ua: req.headers['user-agent'] || null });
    return;
  }
  if (p === '/mock-page') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(HARNESS);
    return;
  }
  if (p === '/api/v9/users/@me' && req.method === 'GET') {
    json(res, 200, USER);
    return;
  }
  if (p === '/api/v10/users/@me' && req.method === 'GET') {
    json(res, 200, USER);
    return;
  }
  if (p === '/api/v9/users/@me' && req.method === 'PATCH') {
    // Discord's server-side rejection of a birthday it does not accept.
    json(res, 400, { code: 50171, message: 'Invalid date of birth', data: { date_of_birth: '2007-03-03' } });
    return;
  }
  if (p === '/api/v9/auth/login' && req.method === 'POST') {
    json(res, 400, { code: 50035, message: 'Invalid login', data: { date_of_birth: '2007-03-03', email: 'gatest@example.com' } });
    return;
  }
  if (p === '/api/v9/age-verification/methods') {
    json(res, 200, { methods: [{ method: 'id', vendor: 'incode', external_window: true }] });
    return;
  }
  if (p === '/api/v9/guilds/888333222111888333' && req.method === 'GET') {
    json(res, 200, GUILD);
    return;
  }
  if (p === '/api/v9/users/@me/age-verification/check') {
    json(res, 200, { status: 'miss', miss_at: Date.now() });
    return;
  }
  json(res, 404, { code: 0, message: 'not found: ' + p });
}

/* ---------------------------------------------------- minimal websocket srv */

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeFrame(text, binary) {
  const payload = binary ? Buffer.from(text) : Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = binary ? 0x82 : 0x81; // binary vs text
  return Buffer.concat([header, payload]);
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );

  // Discord's gateway runs zlib-stream compression: the frames arrive as
  // binary and the client inflates them itself. Mirror that exactly.
  const ready = { op: 0, t: 'READY', s: 1, d: { user: USER, session_id: 'mock', resume_gateway_url: 'ws://127.0.0.1/' } };
  const gCreate = { op: 0, t: 'GUILD_CREATE', s: 2, d: GUILD };
  const upd = { op: 1, t: 'USER_UPDATE', s: 3, d: { user: USER } };
  socket.write(encodeFrame(zlib.deflateSync(Buffer.from(JSON.stringify(ready), 'utf8')), true));
  setTimeout(() => socket.write(encodeFrame(zlib.deflateSync(Buffer.from(JSON.stringify(gCreate), 'utf8')), true)), 250);
  setTimeout(() => socket.write(encodeFrame(zlib.deflateSync(Buffer.from(JSON.stringify(upd), 'utf8')), true)), 500);

  let buf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const maskLen = masked ? 4 : 0;
      if (buf.length < off + maskLen + len) break;
      const mask = masked ? buf.slice(off, off + 4) : null;
      const data = buf.slice(off + maskLen, off + maskLen + len);
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
      buf = buf.slice(off + maskLen + len);
      if ((buf.length || true) && (data[0] === 0x88)) { socket.end(); return; }
    }
  });
  socket.on('error', () => { /* ignore */ });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('mock discord on http://127.0.0.1:' + PORT + ' (harness: /mock-page)');
});
