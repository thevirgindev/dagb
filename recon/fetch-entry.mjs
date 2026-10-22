import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const r = await fetch('https://discord.com/login', { headers: { 'user-agent': UA } });
const html = await r.text();
const srcs = [...new Set([...html.matchAll(/src="([^"]+\.js)"/g)].map((x) => x[1]))];
console.log('src scripts:', srcs.length);

const defRe = /[,\[{;]323073(?::|(\(\w))/g;
const needles = ['isNSFW', 'GUILD_LARGE_SERVER', 'nsfwLevel', 'NETHERNER', 'NSFW_CHANNEL_AGE_VERIFY'];

for (const s of srcs) {
  const rr = await fetch('https://discord.com' + s, { headers: { 'user-agent': UA } });
  if (!rr.ok) { console.log('FAIL', s, rr.status); continue; }
  const t = Buffer.from(await rr.arrayBuffer()).toString('utf8');
  const marks = needles.filter((n) => t.includes(n));
  let m, defs = 0;
  while ((m = defRe.exec(t)) !== null) defs++;
  const keep = defs || marks.length;
  if (keep) {
    fs.writeFileSync(path.join(DIR, 'hits', path.basename(s)), t);
    console.log(s, (t.length / 1024).toFixed(0) + 'KB', 'defs323073=' + defs, marks.join(','), '-- saved');
  } else {
    console.log(s, (t.length / 1024).toFixed(0) + 'KB', 'clean');
  }
}
