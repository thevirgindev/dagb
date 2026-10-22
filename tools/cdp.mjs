/*
 * Minimal CDP client over Node's global WebSocket (Node 22+). No deps.
 */
export async function connect(port, { timeout = 15000 } = {}) {
  const deadline = Date.now() + timeout;
  let ver = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) { ver = await r.json(); break; }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ver) throw new Error('CDP endpoint never came up on port ' + port);

  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', (e) => rej(new Error('ws error ' + (e.message || ''))), { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const listeners = [];

  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message + ' ' + JSON.stringify(msg.error.data || '')));
      else res(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  });

  function send(method, params = {}, sessionId) {
    const id = nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((res, rej) => {
      pending.set(id, { res, rej });
      ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); rej(new Error('CDP timeout: ' + method)); }
      }, 30000);
    });
  }

  return {
    ws,
    send,
    on(fn) { listeners.push(fn); },
    async newPage(url) {
      const { targetId } = await send('Target.createTarget', { url });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      return { targetId, sessionId };
    },
    async evaluate(sessionId, expression, awaitPromise = true) {
      const r = await send('Runtime.evaluate', {
        expression, awaitPromise, returnByValue: true, userGesture: true,
      }, sessionId);
      if (r.exceptionDetails) throw new Error('eval threw: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result?.value;
    },
    async targets() {
      const { targetInfos } = await send('Target.getTargets');
      return targetInfos;
    },
    close() { try { ws.close(); } catch { /* ignore */ } },
  };
}
