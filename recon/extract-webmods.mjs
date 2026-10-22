import fs from 'node:fs';
import path from 'node:path';

const t = fs.readFileSync(path.join('recon', 'hits', 'web.31d1cd3e6e440749.js'), 'utf8');
const ids = [652215, 66834, 260509, 874850, 204925, 272767, 306537, 597306, 36149, 398884];

fs.mkdirSync('recon/mods', { recursive: true });
for (const id of ids) {
  const re = new RegExp('[,\\[{;]' + id + '(?::|\\(\\w)', 'g');
  let m, n = 0;
  while ((m = re.exec(t)) !== null) {
    const at = m.index + 1;
    // brace-balance the factory body
    const ps = t.indexOf('(', at);
    const bs = t.indexOf('{', ps);
    if (ps === -1 || bs === -1 || bs - ps > 40) { console.log('###', id, '@', at, '(no brace form)', t.slice(Math.max(0, at - 30), at + 160).replace(/\n/g, '\\n')); n++; continue; }
    let depth = 0, i = bs, end = -1;
    for (; i < t.length; i++) {
      const c = t[i];
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) { console.log('###', id, '@', at, 'unbalanced ctx', t.slice(at, at + 160)); n++; continue; }
    const body = t.slice(at, end + 1);
    fs.writeFileSync(path.join('recon', 'mods', 'web-' + id + '.js'), body);
    console.log('###', id, '@', at, 'len', body.length);
    n++;
    if (n >= 4) break;
  }
  if (!n) console.log('###', id, 'CLEAN');
}
