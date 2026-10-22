// grep helper: print contexts around needles in the recon chunk files
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const file = process.argv[2];
const needles = process.argv.slice(3);
const width = Number(process.env.CTX || 320);
const maxPer = Number(process.env.MAX || 12);

const text = fs.readFileSync(file, 'utf8');
console.log(`# ${path.basename(file)}  ${(text.length / 1048576).toFixed(2)}MB`);
for (const n of needles) {
  const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  let m, c = 0;
  const lines = [];
  while ((m = re.exec(text)) !== null && c < maxPer) {
    lines.push(`--- @${m.index} ---\n` + text.slice(Math.max(0, m.index - width), m.index + width).replace(/\s+/g, ' '));
    c++;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  const total = (text.match(re) || []).length;
  console.log(`\n===== ${n}  (${total} total) =====`);
  console.log(lines.join('\n'));
}
