import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const web = fs.readFileSync(path.join(DIR, 'hits', 'web.31d1cd3e6e440749.js'), 'utf8');
const map = new Map();
const re = /(\d{1,6}):"([0-9a-f]{8,32})"/g;
let m;
while ((m = re.exec(web)) !== null) map.set(m[1], m[2]);
console.log('chunks:', map.size);

const MARKERS = [
  '323073(e', '323073:(e', '323073:function',
  'zS:()=>', 'xq:()=>', 'n7:()=>', 'nsfwAgree', 'nsfwLevel:',
  'ownerConfiguredContentLevel', 'k$:()=',
];
const outDir = path.join(DIR, 'lazy-hits3');
fs.mkdirSync(outDir, { recursive: true });
const labels = {};
let ok = 0, fail = 0, done = 0;
const queue = [...map.keys()];

async function grab(id) {
  try {
    const r = await fetch('https://discord.com/assets/' + map.get(id) + '.js', { headers: { 'user-agent': UA } });
    if (!r.ok) { fail++; return; }
    const t = Buffer.from(await r.arrayBuffer()).toString('utf8');
    const found = MARKERS.filter((x) => t.includes(x));
    if (found.length) {
      fs.writeFileSync(path.join(outDir, id + '.js'), t);
      labels[id] = { hash: map.get(id), markers: found };
      ok++;
    }
  } catch { fail++; }
  done++;
  if (done % 200 === 0) process.stderr.write(`\r${done}/${queue.length} kept=${ok}   `);
}

await Promise.all(Array.from({ length: 16 }, async () => {
  while (queue.length) { const id = queue.shift(); await grab(id); }
}));

console.log(`\nkept=${ok} fail=${fail}`);
fs.writeFileSync(path.join(DIR, 'labels3.json'), JSON.stringify(labels, null, 1));
