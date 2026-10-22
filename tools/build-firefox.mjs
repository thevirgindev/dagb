/*
 * Build the Firefox variant of the extension.
 *
 *   node tools/build-firefox.mjs
 *
 * Firefox keeps blocking webRequest in MV3 but does not allow the
 * webRequestBlocking permission in Chromium MV3, so the two browsers need
 * different manifests over the same source. Firefox also gets a gecko id so
 * the extension keeps one identity (and its storage) across restarts.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SRC = path.join(ROOT, 'extension');
const args = process.argv.slice(2);
const DEV = args.includes('--dev');
const OUT = path.join(ROOT, DEV ? 'extension-firefox-dev' : 'extension-firefox');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(SRC, 'src'), path.join(OUT, 'src'), { recursive: true });
fs.cpSync(path.join(SRC, 'icons'), path.join(OUT, 'icons'), { recursive: true });

const manifest = {
  manifest_version: 3,
  name: 'DAGB',
  version: '1.0.0',
  description: 'Lets you open Discord\'s age-restricted channels without an age check.',
  browser_specific_settings: {
    gecko: {
      id: 'discord-agegate@local.build',
      strict_min_version: '128.0',
    },
  },
  permissions: ['storage', 'declarativeNetRequest', 'declarativeNetRequestWithHostAccess', 'webRequest', 'webRequestBlocking'],
  host_permissions: [
    'https://discord.com/*',
    'https://*.discord.com/*',
    'https://discordapp.com/*',
    'https://*.discordapp.com/*',
  ],
  background: {
    scripts: ['src/bg.js'],
  },
  action: {
    default_title: 'DAGB',
    default_popup: 'src/popup.html',
  },
  icons: {
    128: 'icons/icon128.png',
  },
  content_scripts: [
    {
      matches: ['https://discord.com/*', 'https://*.discord.com/*', 'https://discordapp.com/*', 'https://*.discordapp.com/*'],
      js: ['src/main.js'],
      run_at: 'document_start',
      world: 'MAIN',
      all_frames: false,
    },
    {
      matches: ['https://discord.com/*', 'https://*.discord.com/*', 'https://discordapp.com/*', 'https://*.discordapp.com/*'],
      js: ['src/content.js'],
      run_at: 'document_start',
      world: 'ISOLATED',
      all_frames: false,
    },
  ],
};

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

if (DEV) {
  // dev build: also run on the local mock, and let the webRequest filter
  // cover the mock echo endpoint so the rewrite is observable in a test
  const mf = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
  const extra = ['http://127.0.0.1/*', 'http://localhost/*'];
  mf.content_scripts.forEach((cs) => { for (const e of extra) if (!cs.matches.includes(e)) cs.matches.push(e); });
  mf.host_permissions = [...new Set([...(mf.host_permissions || []), ...extra])];
  mf.name = 'DAGB (dev)';
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(mf, null, 2) + '\n');

  const bgPath = path.join(OUT, 'src', 'bg.js');
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
}

console.log('firefox build written to', OUT);
console.log('  background   :', JSON.stringify(manifest.background));
console.log('  permissions  :', manifest.permissions.join(', '));
console.log('  gecko id     :', manifest.browser_specific_settings.gecko.id);
