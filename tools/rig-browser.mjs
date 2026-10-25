import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/*
 * Spawn the test Helium instance: fresh profile, the staged 1.0.2 extension,
 * CDP on its own port. It is a separate browser from the operator's.
 */
const PORT = 9333;
const PROFILE = path.join(os.tmpdir(), 'dagb-test-profile');
const EXE = process.env.HELIUM_EXE || path.join(os.homedir(), 'AppData', 'Local', 'imput', 'Helium', 'Application', 'chrome.exe');
const EXT = 'C:\\Users\\user\\Documents\\smth-new\\helium-ext\\discord-agegate';

const cmd = process.argv[2] || 'spawn';

if (cmd === 'spawn') {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(PROFILE, { recursive: true });
  const b = spawn(EXE, [
    '--user-data-dir=' + PROFILE,
    '--remote-debugging-port=' + PORT,
    '--remote-allow-origins=*',
    '--load-extension=' + EXT,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--no-first-run', '--no-default-browser-check',
    '--window-position=60,60', '--window-size=900,760',
    'about:blank',
  ], { stdio: 'ignore', detached: true });
  b.unref();
  console.log('splitting off on port ' + PORT + ', profile ' + PROFILE);
  process.exit(0);
} else if (cmd === 'status') {
  const portFile = path.join(PROFILE, 'DevToolsActivePort');
  if (!fs.existsSync(portFile)) { console.log('no port file'); process.exit(1); }
  const parts = fs.readFileSync(portFile, 'utf8').split('\n').filter(Boolean);
  console.log('port=' + parts[0] + ' ws=' + (parts[1] || ''));
} else {
  console.log('spawn | status');
}
