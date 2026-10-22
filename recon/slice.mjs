// slice a char range out of a minified chunk and wrap it for reading
import fs from 'node:fs';
const [file, start, end, out] = process.argv.slice(2);
const text = fs.readFileSync(file, 'utf8');
const s = Number(start), e = Number(end);
let body = text.slice(s, e).replace(/\s+/g, ' ');
const lines = [];
for (let i = 0; i < body.length; i += 150) lines.push(String(s + i).padStart(9) + '| ' + body.slice(i, i + 150));
if (out) { fs.writeFileSync(out, lines.join('\n')); console.log('wrote ' + out + ' (' + lines.length + ' lines)'); }
else console.log(lines.join('\n'));
