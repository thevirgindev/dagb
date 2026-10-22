import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const dir4 = path.join(DIR, 'hits');
const fresh = path.join(dir4, 'web.31d1cd3e6e440749.js');
const t = fs.readFileSync(fresh, 'utf8');
console.log('web.js size:', (t.length / 1024).toFixed(0) + 'KB');

// 1) locate module 323073 def
const defRe = /[,\[{;]323073(?::|(\(\w))/g;
let m, defIdx = -1;
while ((m = defRe.exec(t)) !== null) {
  if (t[m.index + 1] !== '3') continue; // '323073' at position+1? m.index points at preceding char
  const at = m.index + (t[m.index] === ',' || t[m.index] === '{' ? 1 : 1);
  console.log('candidate def at', at, JSON.stringify(t.slice(Math.max(0, m.index), m.index + 30)));
  if (/[,\[{;]323073\s*[(:]/.test(m[0]) && defIdx === -1) defIdx = at;
}
if (defIdx === -1) {
  console.log('no def found; exit');
  process.exit(1);
}

const paramsStart = t.indexOf('(', defIdx);
const bodyStart = t.indexOf('{', paramsStart);
let depth = 0, i = bodyStart, end = -1;
for (; i < t.length; i++) {
  const c = t[i];
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const body = t.slice(defIdx, end + 1);
fs.writeFileSync(path.join(DIR, 'hits', 'mod-323073.body.js'), body);
console.log('def at', defIdx, 'body chars:', body.length);
console.log('\n===== module 323073 head 3500 =====\n' + body.slice(0, 3500));

// 2) all isNSFW occurrences with a bit of context, keep the method-looking ones
const spots = [];
let idx = 0;
while (true) {
  const j = t.indexOf('isNSFW', idx);
  if (j === -1) break;
  spots.push(j);
  idx = j + 6;
}
console.log('isNSFW occurrences in web.js:', spots.length);
const fsx = fs.mkdirSync(path.join(DIR, 'isnsfw'), { recursive: true });
spots.forEach((j, k) => fs.writeFileSync(path.join(DIR, 'isnsfw', String(k).padStart(4, '0') + '.txt'), String(j) + '\n' + t.slice(Math.max(0, j - 250), j + 500)));

// 3) nsfwLevel enum hunt
const lv = [];
idx = 0;
while (true) {
  const j = t.indexOf('AGE_RESTRICTED', idx);
  if (j === -1) break;
  lv.push(j);
  idx = j + 14;
}
console.log('AGE_RESTRICTED hits in web.js:', lv.length, '->', lv.slice(0, 8).join(','));
