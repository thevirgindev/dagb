import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const web = fs.readFileSync(path.join(DIR, 'hits', 'web.31d1cd3e6e440749.js'), 'utf8');
const hashToId = new Map();
const re = /(\d{1,6}):"([0-9a-f]{8,32})"/g;
let m;
while ((m = re.exec(web)) !== null) hashToId.set(m[2], m[1]);

const perNeedle = Number(process.env.PER || 8);
const window = Number(process.env.WIN || 150);
const terms = JSON.parse(process.env.TERMS || '[]');
const hashes = process.argv.slice(2);

for (const h of hashes) {
  const id = hashToId.get(h);
  if (!id) { console.error('no id for hash', h); continue; }
  const p = path.join(DIR, 'lazy-hits2', id + '.js');
  if (!fs.existsSync(p)) { console.error('missing file', p); continue; }
  const t = fs.readFileSync(p, 'utf8');
  console.log('\n########', h, '-> chunk', id, (t.length / 1024).toFixed(0) + 'KB');
  for (const term of terms) {
    let idx = 0, n = 0;
    while (n < perNeedle) {
      const i = t.indexOf(term, idx);
      if (i === -1) break;
      const start = Math.max(0, i - window);
      const end = Math.min(t.length, i + term.length + window);
      console.log(`[${term}] ...${t.slice(start, end).replace(/\n/g, '\\n')}...`);
      idx = i + term.length;
      n++;
    }
    if (n >= perNeedle) console.log(`[${term}] (cut)`);
  }
}
