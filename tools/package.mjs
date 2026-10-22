/*
 * Package the extension for hand-off.
 *
 *   node tools/package.mjs
 *
 * Produces two zip files next to the project:
 *   dist/discord-agegate-1.6.0-chromium.zip   unzip, then "Load unpacked"
 *   dist/discord-agegate-1.6.0-zen.zip        same, for Zen / Firefox
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const DIST = path.join(ROOT, 'dist');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8')).version;

const READMES = {
  chromium: [
    'Discord Age Gate Bypass - Chromium (Chrome, Edge, Helium, Brave, Arc)',
    '',
    'Install:',
    '  1. unzip this folder',
    '  2. open chrome://extensions (or edge://extensions)',
    '  3. turn on Developer mode (top right)',
    '  4. Load unpacked -> pick the folder that has manifest.json in it',
    '  5. open https://discord.com/app - a small toast confirms it is running',
    '',
    'The toolbar icon shows the live status, the toggles and the event log.',
  ],
  zen: [
    'Discord Age Gate Bypass - Zen / Firefox',
    '',
    'Install:',
    '  1. unzip this folder',
    '  2. open about:debugging#/runtime/this-firefox',
    '  3. "Load Temporary Add-on..." -> pick manifest.json inside the folder',
    '  4. open https://discord.com/app - a small toast confirms it is running',
    '',
    'For a permanent install, sign the folder with your own key and ship it as an',
    'xpi, or use the signed build. The toolbar icon shows the live status, the',
    'toggles and the event log.',
  ],
};

function stage(kind, srcDir) {
  const stage = path.join(DIST, '.stage-' + kind);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  fs.cpSync(path.join(srcDir, 'src'), path.join(stage, 'src'), { recursive: true });
  fs.cpSync(path.join(srcDir, 'icons'), path.join(stage, 'icons'), { recursive: true });
  fs.copyFileSync(path.join(srcDir, 'manifest.json'), path.join(stage, 'manifest.json'));
  fs.writeFileSync(path.join(stage, 'INSTALL.txt'), READMES[kind].join('\n') + '\n');
  return stage;
}

function zip(kind, stage) {
  const out = path.join(DIST, 'discord-agegate-' + VERSION + '-' + kind + '.zip');
  fs.rmSync(out, { force: true });
  const ps = 'Compress-Archive -Path "' + path.join(stage, '*') + '" -DestinationPath "' + out + '" -Force';
  execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
  return out;
}

fs.mkdirSync(DIST, { recursive: true });

const chromiumStage = stage('chromium', path.join(ROOT, 'extension'));
const zenStage = stage('zen', path.join(ROOT, 'extension-firefox'));

const a = zip('chromium', chromiumStage);
const b = zip('zen', zenStage);

for (const f of [chromiumStage, zenStage]) fs.rmSync(f, { recursive: true, force: true });

for (const f of [a, b]) {
  const st = fs.statSync(f);
  console.log(path.relative(ROOT, f) + '  ' + st.size + ' bytes');
}
