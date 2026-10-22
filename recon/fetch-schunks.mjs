import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const files = [
  'discord-2022.schunk.36b8fb49256177c8.js',
  'discord-2022.schunk.c42549641b7d4501.js',
  'discord-2022.schunk.9f877b96d9d6a0c1.js',
  'discord-2022.schunk.1480913c3571b049.js',
];

const defRe = /[,\[{;]323073(?::|(\(\w))/g;
const other = ['isNSFW', 'GUILD_LARGE_SERVER'];

const outDir = path.join(DIR, 'hits');
fs.mkdirSync(outDir, { recursive: true });

for (const f of files) {
  const r = await fetch('https://discord.com/assets/' + f, { headers: { 'user-agent': UA } });
  if (!r.ok) { console.log('FAIL', f, r.status); continue; }
  const t = Buffer.from(await r.arrayBuffer()).toString('utf8');
  fs.writeFileSync(path.join(outDir, f), t);
  console.log('===', f, (t.length / 1024).toFixed(0) + 'KB');
  let m, n = 0;
  while ((m = defRe.exec(t)) !== null && n < 3) {
    console.log('  [323073 def?]', t.slice(Math.max(0, m.index - 40), m.index + 200).replace(/\n/g, '\\n'));
    n++;
  }
  for (const o of other) {
    const c = t.split(o).length - 1;
    if (c) console.log('  [' + o + '] x' + c);
  }
}
