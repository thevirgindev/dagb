/*
 * Install the header probes before Discord's bundle runs and see which JS API
 * it uses to put X-Super-Properties on the wire.
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; }
const PORT = Number(arg('--port', '9222'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connect(PORT, { timeout: 20000 });
const r = await cdp.send('Target.createTarget', { url: 'about:blank', background: true });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: r.targetId, flatten: true });
await cdp.send('Runtime.enable', {}, sessionId);
await cdp.send('Page.enable', {}, sessionId);

const probe = `
window.__hdrProbe = { headersSet: [], headersAppend: [], requests: [], xhr: [], fetchCalls: 0 };
(function () {
  const origSet = Headers.prototype.set;
  const origAppend = Headers.prototype.append;
  Headers.prototype.set = function (n, v) {
    if (String(n).toLowerCase().indexOf('super-properties') !== -1) window.__hdrProbe.headersSet.push(String(v).slice(0, 24));
    return origSet.call(this, n, v);
  };
  Headers.prototype.append = function (n, v) {
    if (String(n).toLowerCase().indexOf('super-properties') !== -1) window.__hdrProbe.headersAppend.push(String(v).slice(0, 24));
    return origAppend.call(this, n, v);
  };
  const NativeRequest = window.Request;
  function PatchedRequest(input, init) {
    if (init && init.headers) {
      try {
        const h = new Headers(init.headers);
        const v = h.get('x-super-properties');
        if (v) window.__hdrProbe.requests.push(v.slice(0, 24));
      } catch (e) {}
    }
    return init === undefined ? new NativeRequest(input) : new NativeRequest(input, init);
  }
  PatchedRequest.prototype = NativeRequest.prototype;
  window.Request = PatchedRequest;
  const origXhrSet = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (n, v) {
    if (String(n).toLowerCase().indexOf('super-properties') !== -1) window.__hdrProbe.xhr.push(String(v).slice(0, 24));
    return origXhrSet.call(this, n, v);
  };
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    window.__hdrProbe.fetchCalls++;
    return origFetch.call(this, input, init);
  };
})();
`;

await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: probe }, sessionId);
await cdp.send('Page.navigate', { url: 'https://discord.com/app' }, sessionId);
await sleep(14000);

const out = await cdp.evaluate(sessionId, 'JSON.stringify(window.__hdrProbe || null)');
console.log('probe:', out);
try { await cdp.send('Target.closeTarget', { targetId: r.targetId }); } catch { /* ignore */ }
cdp.close();
