/*
 * Code cleanup: strip every comment and rename the shouty constants.
 *
 *   node tools/cleanup.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

const renames = {
  'extension/src/main.js': {
    DEFAULTS: 'defaults', STATUS: 'statusCodes', CFG: 'config', VERSION: 'version',
    origFetch: 'nativeFetch', origText: 'nativeText', origJson: 'nativeJson',
    XHROpen: 'xhrOpen', XHRSetHeader: 'xhrSetHeader', XHRSend: 'xhrSend',
  },
  'extension/src/content.js': {
    DEFAULTS: 'defaults', CFG_KEY: 'configKey', LOG_KEY: 'logKey',
    LS_KEY: 'localKey', BUBBLE_KEY: 'bubbleKey',
    MARKERS: 'markers', TEXT_MARKERS: 'textMarkers',
  },
  'extension/src/bg.js': {
    DEFAULTS: 'defaults', CFG_KEY: 'configKey', LOG_KEY: 'logKey',
    SP_KEY: 'spKey', SP_RULE_ID: 'spRuleId', API_MATCHES: 'apiMatches',
  },
  'extension/src/popup.js': {
    DEFAULTS: 'defaults', CFG_KEY: 'configKey', LOG_KEY: 'logKey',
    SWITCHES: 'switches',
  },
};

function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let state = 'code';
  const lastSignificant = () => {
    for (let k = out.length - 1; k >= 0; k--) {
      const ch = out[k];
      if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') return ch;
    }
    return '';
  };
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line'; i += 2; continue; }
      if (c === '/' && c2 === '*') { state = 'block'; i += 2; continue; }
      if (c === "'") { state = 'sq'; out += c; i++; continue; }
      if (c === '"') { state = 'dq'; out += c; i++; continue; }
      if (c === '`') { state = 'tpl'; out += c; i++; continue; }
      if (c === '/') {
        const prev = lastSignificant();
        let word = '';
        for (let k = out.length - 1; k >= 0; k--) {
          const ch = out[k];
          if (/[A-Za-z0-9_$]/.test(ch)) word = ch + word;
          else break;
        }
        const keyword = /^(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/.test(word);
        if (prev === '' || keyword || '(,;={:+!&|?*-~^<>[]'.indexOf(prev) !== -1) { state = 'regex'; out += c; i++; continue; }
      }
      out += c; i++; continue;
    }
    if (state === 'line') { if (c === '\n') { state = 'code'; out += '\n'; } i++; continue; }
    if (state === 'block') {
      if (c === '*' && c2 === '/') { state = 'code'; i += 2; continue; }
      if (c === '\n') out += '\n';
      i++; continue;
    }
    if (state === 'sq' || state === 'dq') {
      if (c === '\\') { out += c + (c2 || ''); i += 2; continue; }
      if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"')) state = 'code';
      out += c; i++; continue;
    }
    if (state === 'tpl') {
      if (c === '\\') { out += c + (c2 || ''); i += 2; continue; }
      if (c === '`') { state = 'code'; }
      out += c; i++; continue;
    }
    if (state === 'regex') {
      let inClass = false;
      let j = i;
      // consume the whole regex literal, honouring escapes and character classes
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '[') { inClass = true; j++; continue; }
        if (ch === ']') { inClass = false; j++; continue; }
        if (ch === '/' && !inClass) break;
        if (ch === '\n') break;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      state = 'code';
      continue;
    }
  }
  return out;
}

function stripHtmlComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function squeezeBlank(src) {
  return src
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .filter((l, idx, arr) => !(l === '' && arr[idx - 1] === ''))
    .join('\n');
}

const files = [
  'extension/src/main.js',
  'extension/src/content.js',
  'extension/src/bg.js',
  'extension/src/popup.js',
  'extension/src/popup.html',
];

for (const rel of files) {
  const p = path.join(ROOT, rel);
  let src = fs.readFileSync(p, 'utf8');
  const before = src.length;
  src = rel.endsWith('.html') ? stripHtmlComments(src) : stripComments(src);
  src = squeezeBlank(src);
  const map = renames[rel];
  if (map) {
    for (const [from, to] of Object.entries(map)) {
      const re = new RegExp('\\b' + from.replace(/[$]/g, '\\$') + '\\b', 'g');
      src = src.replace(re, to);
    }
  }
  fs.writeFileSync(p, src, 'utf8');
  console.log(rel + ': ' + before + ' -> ' + src.length + ' bytes');
}
