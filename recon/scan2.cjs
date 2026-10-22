const fs = require('node:fs');
const path = require('node:path');

const CHUNKS = ['584018', '649362', '122990', '159617', '971430', '630267'];
const PATS = ['nsfwAgree', 'nsfwLevel', 'k$:()=>', 'xq:()=>', 'NSFW_LEVELS', 'AGE_RESTRICTED'];

for (const id of CHUNKS) {
  const p = path.join('recon', 'lazy-hits3', id + '.js');
  if (!fs.existsSync(p)) { console.log('missing', id); continue; }
  const t = fs.readFileSync(p, 'utf8');
  console.log('############ chunk', id, (t.length / 1024).toFixed(0) + 'KB');
  for (const pat of PATS) {
    let idx = 0, c = 0;
    while (c < 3) {
      const i = t.indexOf(pat, idx);
      if (i === -1) break;
      console.log('[' + pat + ']', t.slice(Math.max(0, i - 150), i + pat.length + 330).replace(/\n/g, '\\n'));
      idx = i + pat.length;
      c++;
    }
  }
}
