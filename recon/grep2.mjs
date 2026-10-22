import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const files = process.argv.slice(2);
const perNeedle = 6;

const terms = process.env.TERMS ? JSON.parse(process.env.TERMS) : [
  'server_age', 'AGE_CHECK', 'age_gate', 'AGE_GATE', 'AGE_RESTRICTED',
];

for (const f of files) {
  const p = path.join(DIR, 'lazy-hits2', f.endsWith('.js') ? f : f + '.js');
  if (!fs.existsSync(p)) { console.error('missing', p); continue; }
  const t = fs.readFileSync(p, 'utf8');
  console.log('\n########', f, (t.length / 1024).toFixed(0) + 'KB');
  for (const term of terms) {
    let idx = 0, n = 0;
    while (n < perNeedle) {
      const i = t.indexOf(term, idx);
      if (i === -1) break;
      const start = Math.max(0, i - 130);
      const end = Math.min(t.length, i + term.length + 130);
      console.log(`  [${term}] ...${t.slice(start, end).replace(/\n/g, '\\n')}...`);
      idx = i + term.length;
      n++;
    }
    if (n >= perNeedle) console.log(`  [${term}] (more occurrences cut)`);
  }
}
