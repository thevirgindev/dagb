import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const t = fs.readFileSync(path.join(DIR, 'hits', 'web.31d1cd3e6e440749.js'), 'utf8');

function extractModule(id) {
  const heads = [];
  for (const head of [id + '(', id + ':)(']) {
    let idx = 0;
    while (true) {
      const j = t.indexOf(head, idx);
      if (j === -1) break;
      const pre = t[j - 1];
      if ((pre === ',' || pre === '{' || pre === ';' || j === 0) && /^[,(]$|^\{$/.test(head.slice(-1)) === false) {
        heads.push(j);
      }
      idx = j + head.length;
    }
  }
  const out = [];
  for (const start of heads) {
    const ps = t.indexOf('(', start);
    const bs = t.indexOf('{', ps);
    if (bs === -1) continue;
    let depth = 0, i = bs, end = -1;
    for (; i < t.length; i++) {
      const c = t[i];
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) continue;
    out.push(t.slice(start, end + 1));
  }
  return out;
}

const targets = [36149, 597306, 652215, 204925, 874850, 207560, 272767, 66834, 669281];
const bodies = {};
for (const id of targets) {
  const bs = extractModule(id);
  if (!bs.length) { bodies[id] = ['NOT_FOUND']; continue; }
  bodies[id] = bs;
  for (let k = 0; k < bs.length; k++) {
    fs.writeFileSync(path.join(DIR, 'mods', 'web-' + id + (bs.length > 1 ? '-' + k : '') + '.js'), bs[k]);
  }
}
console.log('extracted:', Object.entries(bodies).map(([id, bs]) => id + '=' + bs.map((b) => b.length).join('+')).join(' | '));
const all = Object.values(bodies).flat().join('\n\n@@@SEPARATOR@@@\n\n');
fs.writeFileSync(path.join(DIR, 'mods', 'web-bodies.txt'), all);
console.log('\n===== 36149 =====\n' + bodies[36149].join('\n---\n').slice(0, 1200));
console.log('\n===== 597306 =====\n' + bodies[597306].join('\n---\n').slice(0, 1200));
