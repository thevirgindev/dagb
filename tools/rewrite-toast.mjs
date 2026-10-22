// One-off rewrite of the in-Discord toast: shadcn-sized, top right, 4.5s.
import fs from 'node:fs';

const p = 'C:/Users/user/Documents/smth-new/discord-agegate/extension/src/content.js';
let s = fs.readFileSync(p, 'utf8');

const startMarker = '  /* -------------------------------------------------------------- the bubble */';
const endMarker = '  startObserver();\n\n  // Ask MAIN';
const start = s.indexOf(startMarker);
const end = s.indexOf(endMarker);
if (start === -1 || end === -1) { console.error('markers not found'); process.exit(1); }

const block = `  /* ------------------------------------------------------------- the toast */

  let toastEl = null;

  function showToast() {
    let cfg = DEFAULTS;
    try { cfg = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch (e) { /* ignore */ }
    if (!cfg.enabled || !cfg.showBadge) return;
    if (toastEl) return;

    toastEl = document.createElement('div');
    toastEl.id = '__agegate_toast';
    toastEl.style.cssText = [
      'position:fixed', 'top:12px', 'right:12px', 'z-index:2147483647',
      'width:236px', 'padding:9px 11px',
      'border-radius:8px',
      'background:oklch(0.21 0.006 285.885 / .94)',
      'border:1px solid oklch(0.274 0.006 286.033)',
      'box-shadow:0 8px 24px rgba(0,0,0,.42)',
      'backdrop-filter:blur(8px)', '-webkit-backdrop-filter:blur(8px)',
      'color:oklch(0.985 0 0)',
      'font:400 12px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
      'opacity:0', 'transform:translateY(-6px)',
      'transition:opacity .25s ease, transform .25s cubic-bezier(.2,.9,.3,1.1)',
    ].join(';');

    const title = document.createElement('div');
    title.style.cssText = 'display:flex;align-items:center;gap:6px;font-weight:600;font-size:12px;letter-spacing:-.01em;';
    const dot = document.createElement('span');
    dot.style.cssText = 'width:6px;height:6px;border-radius:999px;background:oklch(0.723 0.192 149.579);flex:0 0 auto;';
    const label = document.createElement('span');
    label.textContent = 'Age verification bypassed';
    title.appendChild(dot);
    title.appendChild(label);

    const sub = document.createElement('div');
    sub.textContent = 'Verified adult, device fingerprint moved';
    sub.style.cssText = 'margin-top:2px;font-size:10.5px;color:oklch(0.552 0.016 285.938);';

    toastEl.appendChild(title);
    toastEl.appendChild(sub);
    (document.body || document.documentElement).appendChild(toastEl);

    requestAnimationFrame(function () {
      if (!toastEl) return;
      toastEl.style.opacity = '1';
      toastEl.style.transform = 'translateY(0)';
    });

    let gone = false;
    const dismiss = function () {
      if (gone || !toastEl) return;
      gone = true;
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateY(-6px)';
      setTimeout(function () {
        if (toastEl && toastEl.parentElement) toastEl.parentElement.removeChild(toastEl);
        toastEl = null;
      }, 320);
    };
    toastEl.addEventListener('click', dismiss);
    setTimeout(dismiss, 4500);
  }

  function publishVersion() {
    try {
      const v = window.__AGEGATE__ && window.__AGEGATE__.version;
      if (v) chrome.storage.local.set({ agegate_version: v });
    } catch (e) { /* ignore */ }
  }

`;

s = s.slice(0, start) + block + s.slice(end);
s = s.split('showBubble();').join('showToast();');
s = s.replace('  startObserver();\n\n  // Ask MAIN', '  startObserver();\n  publishVersion();\n  setTimeout(publishVersion, 1500);\n\n  // Ask MAIN');

fs.writeFileSync(p, s, 'utf8');
console.log('showToast refs:', (s.match(/showToast/g) || []).length, '| showBubble refs:', (s.match(/showBubble/g) || []).length);
