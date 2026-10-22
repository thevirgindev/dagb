const fs = require('node:fs');
const path = require('node:path');
const dir = path.join('recon', 'lazy-hits2');
const pats = ['GUILD_LARGE_SERVER', 'k$:()=>' , 'largeServer'];
for (const f of fs.readdirSync(dir)) {
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const p of pats) {
    const n = t.split(p).length - 1;
    if (!n) continue;
    let idx = 0, c = 0;
    while (c < 6) {
      const i = t.indexOf(p, idx);
      if (i === -1) break;
      console.log('###', f, '[' + p + '] x' + n);
      console.log('   ', t.slice(Math.max(0, i - 200), i + p.length + 420).replace(/\n/g, '\\n'));
      idx = i + p.length;
      c++;
    }
  }
}
