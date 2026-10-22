/*
 * Install the extension into a Chromium/Helium profile as an unpacked
 * developer extension (persists across restarts, no launch flag needed).
 *
 *   node tools/install-unpacked.mjs --port <cdpPort> [--path <extDir>]
 *
 * Uses the CDP Extensions domain, which needs the browser to have been
 * started with --enable-unsafe-extension-debugging.
 */
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : dflt;
}

const PORT = Number(arg('--port', '8900'));
const EXT = arg('--path', new URL('../extension', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

const cdp = await connect(PORT, { timeout: 20000 });

let result;
try {
  result = await cdp.send('Extensions.loadUnpacked', { path: EXT });
  console.log('Extensions.loadUnpacked ->', JSON.stringify(result));
} catch (e) {
  console.error('Extensions.loadUnpacked failed:', e.message);
  console.error('the browser probably needs --enable-unsafe-extension-debugging');
  process.exitCode = 1;
}

if (result && result.id) {
  await new Promise((r) => setTimeout(r, 1200));
  const targets = await cdp.targets();
  const sw = targets.filter((t) => (t.url || '').startsWith('chrome-extension://' + result.id));
  console.log('extension id     :', result.id);
  console.log('extension targets:', sw.map((t) => t.type + ' ' + t.url).join(', ') || 'none yet');
}
cdp.close();
