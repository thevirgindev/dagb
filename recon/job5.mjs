import fs from 'node:fs';
import path from 'node:path';

const dirs = ['recon/lazy-hits3', 'recon/lazy-hits2'];
const bundles = [['zS:()=>', 'ni:()=>'], ['zS:()=>', 'p5:()=>'], ['323073', 'nsfwLevel'], ['zS', 'AGE_RESTRICTED', 'k$']];

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const p = path.join(dir, f);
    const t = fs.readFileSync(p, 'utf8');
    for (let bi = 0; bi < bundles.length; bi++) {
      const combo = bundles[bi];
      if (combo.every((pat) => t.includes(pat))) {
        console.log('MATCH bundle', bi, p);
        for (const pat of combo) {
          let idx = 0, c = 0;
          while (c < 3) {
            const i = t.indexOf(pat, idx);
            if (i === -1) break;
            console.log('  [' + pat + ']', t.slice(Math.max(0, i - 100), i + pat.length + 300).replace(/\n/g, '\\n'));
            idx = i + pat.length;
            c++;
          }
        }
      }
    }
  }
}
