// Recon: pull every Discord web chunk and hunt for the age-verification surface.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const html = fs.readFileSync(path.join(DIR, 'app.html'), 'utf8');

const assets = new Set();
for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)) assets.add(m[1]);
for (const m of html.matchAll(/"\/assets\/([^"]+\.js)"/g)) assets.add('/assets/' + m[1]);
const list = [...assets];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const NEEDLES = [
  'age_verification', 'ageVerification', 'AGE_VERIFICATION', 'age-verification',
  'age_verification_attempt', 'ageGate', 'AGE_GATE', 'age_gate',
  'safetyLevel', 'safety_level', 'SAFETY_LEVEL', 'safetySetting', 'safety_setting',
  'ageAssurance', 'age_assurance', 'AGE_ASSURANCE',
  'veriff', 'k-id', 'kid_', 'idcheck', 'id_check', 'yoti', 'persona', 'verime', 'verifidentity',
  'isAdult', 'is_adult', 'underage', 'UNDERAGE',
  'adultOnly', 'ADULT_ONLY', 'ageRestricted', 'age_restricted',
  'matureContent', 'ageVerificationStatus',
];

const hits = [];
let total = 0, done = 0, failed = 0;

async function grab(asset) {
  const url = 'https://discord.com' + asset;
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, 'accept': '*/*' } });
    if (!r.ok) { failed++; return; }
    const buf = Buffer.from(await r.arrayBuffer());
    total += buf.length;
    const text = buf.toString('utf8');
    const found = NEEDLES.filter((n) => text.includes(n));
    if (found.length) {
      const name = asset.split('/').pop();
      const outDir = path.join(DIR, 'hits');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, name), buf);
      const ctx = [];
      for (const n of found) {
        let i = text.indexOf(n);
        let c = 0;
        while (i !== -1 && c < 6) {
          ctx.push({ needle: n, at: i, around: text.slice(Math.max(0, i - 140), i + 180).replace(/\s+/g, ' ') });
          i = text.indexOf(n, i + 1);
          c++;
        }
      }
      hits.push({ asset, bytes: buf.length, needles: found, ctx });
    }
  } catch (e) {
    failed++;
  }
  done++;
  if (done % 25 === 0) process.stderr.write(`\r${done}/${list.length}  ${(total / 1048576).toFixed(1)}MB  hits=${hits.length}`);
}

const CONC = 16;
const queue = [...list];
await Promise.all(Array.from({ length: CONC }, async () => {
  while (queue.length) {
    const a = queue.shift();
    if (!a) break;
    await grab(a);
  }
}));

fs.writeFileSync(path.join(DIR, 'hits.json'), JSON.stringify(hits, null, 2));
console.log(`\nchunks=${list.length} ok=${done - failed} failed=${failed} bytes=${(total / 1048576).toFixed(1)}MB hitChunks=${hits.length}`);
for (const h of hits) console.log(`  ${h.asset}  ${(h.bytes / 1024).toFixed(0)}KB  [${h.needles.join(', ')}]`);
