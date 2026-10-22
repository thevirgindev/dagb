const fs = require('node:fs');
const path = require('node:path');
const web = fs.readFileSync(path.join('recon', 'hits', 'web.31d1cd3e6e440749.js'), 'utf8');
const map = new Map();
let m;
const re = /(\d{1,6}):"([0-9a-f]{8,32})"/g;
while ((m = re.exec(web)) !== null) map.set(m[1], m[2]);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

for (const id of ['1', '2', '442610', '543521', '638797']) {
  const hash = map.get(id);
  const url = 'https://discord.com/assets/' + hash + '.js';
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  console.log(id, hash, 'status', r.status, (r.headers.get('content-length') || '?'), 'ct', r.headers.get('content-type'));
  if (r.ok) {
    const t = Buffer.from(await r.arrayBuffer()).toString('utf8');
    console.log('  len', t.length, 'has 323073:', t.includes('323073'), 'has nsfwLevel:', t.includes('nsfwLevel'));
    if (t.length) fs.writeFileSync(path.join('recon', 'lazy-hits3', id + '.js'), t);
  }
}
