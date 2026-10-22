import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const NEEDLES = [
  'age_verification', 'ageVerification', 'AGE_VERIFICATION', 'age-verification',
  'date_of_birth', 'AGE_GATE', 'ageGate', 'age_gate', 'age-gate',
  'age_restricted', 'AGE_RESTRICTED', 'ageRestricted', 'age-restricted',
  'guild_age', 'server_age', 'nsfw_gate', 'NSFW_LEVEL', 'nsfw_level',
  'ageCheck', 'age_check', 'AGE_CHECK',
  'member_age', 'age_assurance', 'AGE_ASSURURANCE', 'ageAssurance', 'AGE_ASSURANCE',
  '18 years', '18+ years', 'over 18', 'Are you 18', 'are you 18', 'you must be 18', 'You must be 18',
  'be at least 18', 'at least 18 years',
  'restricted server', 'age-gated server', 'age gated server', 'age-gated community',
  'requires_age', 'requiresAge', 'ageRequired', 'age_required',
  'AtLeast18', 'atLeast18', 'isAdult', 'is_adult',
  'verification_gate', 'verificationGate', 'join_gate', 'joinGate', 'JOIN_GATE',
  'dateOfBirth', 'birthdate',
];

let text = '';
const r0 = await fetch('https://discord.com/login', { headers: { 'user-agent': UA } });
text = await r0.text();
const scriptNames = [...new Set([...text.matchAll(/\/assets\/([\w~.-]+\.js)/g)].map((m) => m[1]))];
const runtimeName = scriptNames.find((s) => /^web\.[0-9a-f]+\.js$/.test(s));
console.log('runtime on /login:', runtimeName, 'scripts:', scriptNames.length);

let webJs = null;
const cachedPath = path.join(DIR, 'hits', runtimeName);
if (fs.existsSync(cachedPath)) {
  webJs = fs.readFileSync(cachedPath, 'utf8');
  console.log('using cached runtime from recon/hits');
} else {
  const r = await fetch('https://discord.com/assets/' + runtimeName, { headers: { 'user-agent': UA } });
  webJs = await r.text();
  fs.mkdirSync(path.join(DIR, 'hits'), { recursive: true });
  fs.writeFileSync(path.join(DIR, 'hits', runtimeName), webJs);
  console.log('fetched fresh runtime', (webJs.length / 1024).toFixed(0) + 'KB');
}

const map = new Map();
const re = /(\d{1,6}):"([0-9a-f]{8,32})"/g;
let m;
while ((m = re.exec(webJs)) !== null) map.set(m[1], m[2]);
console.log('chunk map entries:', map.size);

const hits = [];
let bytes = 0, ok = 0, fail = 0, done = 0;
const queue = [...map.keys()].map((i) => ({ id: i, file: '/assets/' + map.get(i) + '.js' }));

async function grab(item) {
  try {
    const r = await fetch('https://discord.com' + item.file, { headers: { 'user-agent': UA } });
    if (!r.ok) { fail++; return; }
    const buf = Buffer.from(await r.arrayBuffer());
    bytes += buf.length; ok++;
    const t = buf.toString('utf8');
    const found = NEEDLES.filter((n) => t.includes(n));
    if (found.length) {
      const outDir = path.join(DIR, 'lazy-hits2');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, item.id + '.js'), buf);
      hits.push({ file: item.file, bytes: buf.length, needles: found });
    }
  } catch { fail++; }
  done++;
  if (done % 100 === 0) process.stderr.write(`\r${done}/${queue.length} ${(bytes / 1048576).toFixed(1)}MB hits=${hits.length}   `);
}

await Promise.all(Array.from({ length: 16 }, async () => {
  while (queue.length) { const it = queue.shift(); if (!it) break; await grab(it); }
}));

console.log(`\nchunks=${queue.length + done} ok=${ok} fail=${fail} bytes=${(bytes / 1048576).toFixed(1)}MB hitChunks=${hits.length}`);
for (const h of hits.sort((a, b) => b.bytes - a.bytes).slice(0, 40)) {
  console.log(`  ${h.file}  ${(h.bytes / 1024).toFixed(0)}KB  [${h.needles.join(', ')}]`);
}
fs.writeFileSync(path.join(DIR, 'summary2.json'), JSON.stringify(hits.map(({ file, bytes, needles }) => ({ file, bytes, needles })), null, 1));
