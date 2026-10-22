import fs from 'node:fs';
import path from 'node:path';

const targets = [path.join('recon', 'hits', 'web.31d1cd3e6e440749.js')];
for (const d of ['lazy-hits', 'lazy-hits2', 'lazy-hits3']) {
  const dir = path.join('recon', d);
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.js')) targets.push(path.join(dir, f));
    }
  }
}

for (const p of targets) {
  const t = fs.readFileSync(p, 'utf8');
  let idx = 0, c = 0;
  while (c < 4) {
    const i = t.indexOf('323073', idx);
    if (i === -1) break;
    const ctx = t.slice(Math.max(0, i - 70), i + 300).replace(/\n/g, '\\n');
    console.log('###', p.replace(/\\/g, '/').replace(/^recon\//, ''), '@', i, '\n   ', ctx, '\n');
    idx = i + 6;
    c++;
  }
}
