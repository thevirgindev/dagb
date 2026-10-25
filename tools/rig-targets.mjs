import { connect } from './cdp.mjs';

const cdp = await connect(9333, { timeout: 15000 });
const t = await cdp.targets();
for (const x of t) {
  console.log((x.type || '?').padEnd(12), (x.title || '').slice(0, 30).padEnd(30), (x.url || '').slice(0, 100));
}
cdp.close();
