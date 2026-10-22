// Build a dev copy of the extension whose content scripts also run on
// http://127.0.0.1/* so the mock Discord can be verified without touching
// the shipped manifest.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SRC = path.join(ROOT, 'extension');
const DST = path.join(ROOT, 'extension-dev');

fs.rmSync(DST, { recursive: true, force: true });
fs.cpSync(SRC, DST, { recursive: true });

const mfPath = path.join(DST, 'manifest.json');
const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
const extra = ['http://127.0.0.1/*', 'http://localhost/*'];
mf.content_scripts.forEach((cs) => {
  for (const e of extra) if (!cs.matches.includes(e)) cs.matches.push(e);
});
mf.host_permissions = [...new Set([...(mf.host_permissions || []), ...extra])];
mf.name = 'Discord Age Gate Bypass (dev)';
fs.writeFileSync(mfPath, JSON.stringify(mf, null, 2));

// the DNR rule has to be able to match the mock endpoint for the rewrite to be
// observable in the test
const bgPath = path.join(DST, 'src', 'bg.js');
let bg = fs.readFileSync(bgPath, 'utf8');
bg = bg.replace(
  "const dnrFilters = ['*discord.com/api/*'];",
  "const dnrFilters = ['*discord.com/api/*', '*mock-echo*'];"
);
bg = bg.replace(
  "const apiMatches = ['https://discord.com/api/*', 'https://*.discord.com/api/*'];",
  "const apiMatches = ['https://discord.com/api/*', 'https://*.discord.com/api/*', 'http://127.0.0.1:8799/mock-echo*'];"
);
fs.writeFileSync(bgPath, bg);

console.log('dev extension written to', DST);
