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

const IDS = [652215, 66834, 260509, 874850, 204925, 272767, 306537, 597306, 36149, 398884];
const text = ['JOIN_LARGE_GUILD_UNDERAGE', 'nsfwLevel:', 'isNSFW(){'];

const outDir = path.join(DIR, 'lazy-hits5');
fs.mkdirSync(outDir, { recursive: true });
const labels = {};
let ok = 0, done = 0, fail = 0;
const queue = [...map.keys()];

const idRes = IDS.map((id) => new RegExp('[,\\[{;]' + id + '(?::|\\(\\w)'));

async function grab(id) {
  try {
    const r = await fetch('https://discord.com/assets/' + map.get(id) + '.js', { headers: { 'user-agent': UA } });
    if (!r.ok) { fail++; return; }
    const t = Buffer.from(await r.arrayBuffer()).toString('utf8');
    const found = [];
    for (const re2 of idRes) if (re2.test(t)) found.push('def:' + re2.source.slice(1, 7));
    for (const x of text) if (t.includes(x)) found.push(x);
    if (found.length) {
      fs.writeFileSync(path.join(outDir, id + '.js'), t);
      labels[id] = { hash: map.get(id), markers: [...new Set(found)] };
      ok++;
    }
  } catch { fail++; }
  done++;
  if (done % 300 === 0) process.stderr.write(`\r${done}/${queue.length} kept=${ok}  `);
}

await Promise.all(Array.from({ length: 16 }, async () => {
  while (queue.length) { const id = queue.shift(); await grab(id); }
}));

console.log(`\nkept=${ok} fail=${fail}`);
for (const id of Object.keys(labels)) console.log(id, map.get(id), labels[id].markers.join(','));
fs.writeFileSync(path.join(DIR, 'labels5.json'), JSON.stringify(labels, null, 1));
