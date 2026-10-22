/*
 * Minimal Marionette client (Firefox / Zen remote protocol).
 *
 * Frames are "<byteLength>:<json>". A command is [0, id, name, params] and
 * the reply is [1, id, error, result].
 */
import net from 'node:net';

export function connect(port = 2828, { timeout = 40000 } = {}) {
  const socket = net.connect(port, '127.0.0.1');
  let buffer = Buffer.alloc(0);
  let nextId = 1;
  const pending = new Map();
  const errors = [];

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const colon = buffer.indexOf(0x3a);
      if (colon === -1) return;
      const len = parseInt(buffer.slice(0, colon).toString('utf8'), 10);
      if (!Number.isFinite(len)) return;
      if (buffer.length < colon + 1 + len) return;
      const payload = buffer.slice(colon + 1, colon + 1 + len).toString('utf8');
      buffer = buffer.slice(colon + 1 + len);
      let msg;
      try { msg = JSON.parse(payload); } catch { continue; }
      if (Array.isArray(msg) && msg.length >= 4) {
        const [, id, err, res] = msg;
        const p = pending.get(id);
        if (!p) continue;
        pending.delete(id);
        if (err) p.rej(new Error(JSON.stringify(err)));
        else p.res(res);
      } else if (msg && msg.applicationType) {
        // server handshake
      }
    }
  });

  socket.on('error', (e) => { errors.push(e); });

  function send(name, params = {}, { timeout: cmdTimeout = 60000 } = {}) {
    const id = nextId++;
    const body = JSON.stringify([0, id, name, params]);
    const frame = Buffer.byteLength(body) + ':' + body;
    return new Promise((res, rej) => {
      pending.set(id, { res, rej });
      socket.write(frame);
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          rej(new Error('marionette timeout: ' + name));
        }
      }, cmdTimeout);
    });
  }

  return {
    send,
    async newSession() { return send('WebDriver:NewSession', { capabilities: {} }); },
    async navigate(url) { return send('WebDriver:Navigate', { url }); },
    async script(src, args = []) {
      const r = await send('WebDriver:ExecuteScript', { script: src, args, sandbox: null });
      return r && 'value' in r ? r.value : r;
    },
    async screenshot() {
      const r = await send('WebDriver:TakeScreenshot', { full: true, hash: false });
      return r && r.value ? Buffer.from(r.value, 'base64') : null;
    },
    async installAddon(addonPath, temporary = true) {
      return send('Addon:Install', { path: addonPath, temporary });
    },
    close() { try { socket.end(); } catch { /* ignore */ } },
  };
}
