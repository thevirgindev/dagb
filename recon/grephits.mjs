// grep every recon chunk (initial + lazy) for a needle, print file + context
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const dirs = [path.join(DIR, 'hits'), path.join(DIR, 'lazy-hits')];
const needle = process.argv[2];
const width = Number(process.env.CTX || 300);
const maxPer = Number(process.env.MAX || 4);
const fileFilter = process.env.FILE ? new RegExp(process.env.FILE) : null;

for (const d of dirs) {
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) {
    if (fileFilter && !fileFilter.test(f)) continue;
    const text = fs.readFileSync(path.join(d, f), 'utf8');
    let i = text.indexOf(needle), c = 0;
    while (i !== -1 && c < maxPer) {
      console.log(`\n### ${d.endsWith('hits') && !d.includes('lazy') ? 'init' : 'lazy'}/${f} @${i}`);
      console.log(text.slice(Math.max(0, i - width), i + width).replace(/\s+/g, ' '));
      i = text.indexOf(needle, i + 1); c++;
    }
  }
}
