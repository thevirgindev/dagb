
(function () {
  'use strict';

  const configKey = 'agegate_config';
  const logKey = 'agegate_log';
  const localKey = 'agegate_config';

  const defaults = {
    enabled: true,
    status: 3,
    forceNsfw: true,
    hideUi: true,
    autoDob: true,
    keepAlive: true,
    dob: '1995-06-15',
    forceJsonGateway: true,
  };

  function sendCfg(cfg) {
    try { localStorage.setItem(localKey, JSON.stringify(cfg)); } catch (e) {  }
    window.postMessage({ __agegate_cfg__: cfg }, '*');
  }

  function loadAndPush() {
    chrome.storage.local.get(configKey, function (res) {
      const cfg = Object.assign({}, defaults, res[configKey] || {});
      sendCfg(cfg);
    });
  }

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes[configKey]) {
      const cfg = Object.assign({}, defaults, changes[configKey].newValue || {});
      sendCfg(cfg);
    }
  });

  loadAndPush();

  function publishFingerprint() {
    let props = null;
    try { props = JSON.parse(localStorage.getItem('deviceProperties') || 'null'); } catch (e) { props = null; }
    if (!props || typeof props !== 'object') return false;
    let sp;
    try { sp = btoa(JSON.stringify(props)); } catch (e) { return false; }
    try {
      chrome.runtime.sendMessage({ type: 'setSuperProperties', value: sp }, function (res) {
        if (res && res.ok) chrome.storage.local.set({ agegate_fp_active: Date.now(), agegate_fp_error: null });
        else chrome.storage.local.set({ agegate_fp_error: (res && res.error) || 'unknown' });
      });
    } catch (e) {  }
    return true;
  }

  publishFingerprint();
  setTimeout(publishFingerprint, 2500);
  setTimeout(publishFingerprint, 8000);

  function appendLog(entry) {
    chrome.storage.local.get(logKey, function (res) {
      const list = Array.isArray(res[logKey]) ? res[logKey] : [];
      list.push(entry);
      while (list.length > 100) list.shift();
      chrome.storage.local.set({ [logKey]: list });
    });
  }

  window.addEventListener('message', function (e) {
    const d = e && e.data;
    if (!d || typeof d !== 'object') return;
    if (d.__agegate_log__) {
      appendLog(d.__agegate_log__);
      if (d.__agegate_log__.kind === 'boot') chrome.storage.local.set({ agegate_ready: Date.now() });
    }
    if (d.__agegate_ready__) {
      chrome.storage.local.set({ agegate_ready: Date.now() });
    }
    if (d.__agegate_active__) {
      chrome.storage.local.set({ agegate_active: Date.now() });
    }
  });

  const markers = [
    '[data-testid="age-verification-container"]',
    '[data-testid^="age-gate-"]',
    '[class*="ageVerification"]',
    '[class*="age-verification"]',
    '[class*="AgeVerification"]',
    '[class*="ageGate"]',
  ];

  const textMarkers = [
    /verify your age/i,
    /age verification/i,
    /enter your birthday/i,
    /confirm your age/i,
    /scan your id to know your age/i,
    /we need to know your age/i,
    /age-restricted server/i,
    /age restricted server/i,
    /age-restricted channel/i,
    /must be 18 or over/i,
    /at least 18 years old/i,
    /18 years or older/i,
    /are you 18/i,
  ];

  function isMarker(el) {
    if (!el || el.nodeType !== 1) return false;
    for (const sel of markers) {
      try { if (el.matches(sel)) return true; } catch (e) {  }
    }
    return false;
  }

  function looksLikeLayer(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.getAttribute) {
      if (el.getAttribute('role') === 'dialog') return true;
      if (el.getAttribute('aria-modal') === 'true') return true;
    }
    const cls = typeof el.className === 'string' ? el.className : '';
    return /modal|dialog|layer/i.test(cls);
  }

  let uiRemoved = 0;

  function removeMarker(el) {
    if (!el || !el.parentElement) return false;
    const tag = el.tagName;
    const cls = typeof el.className === 'string' ? el.className.slice(0, 120) : '';
    try {
      el.remove();
      uiRemoved++;
      chrome.storage.local.set({ agegate_ui_removed: uiRemoved });
      appendLog({ t: Date.now(), kind: 'ui:removed', detail: { tag: tag, cls: cls } });
      return true;
    } catch (e) { return false; }
  }

  function scanSubtree(root) {
    if (!root || root.nodeType !== 1) return 0;
    let hits = 0;
    const nodes = [root];
    let budget = 300;
    if (root.querySelectorAll) {
      for (const el of root.querySelectorAll('*')) {
        if (budget-- <= 0) break;
        nodes.push(el);
      }
    }
    for (const el of nodes) {
      if (isMarker(el) && removeMarker(el)) hits++;
    }
    for (const el of nodes) {
      if (isMarker(el)) continue;
      if (!looksLikeLayer(el)) continue;
      let txt = '';
      try { txt = (el.textContent || '').slice(0, 500); } catch (e) { txt = ''; }
      if (txt && textMarkers.some(function (re) { return re.test(txt); })) {
        if (removeMarker(el)) hits++;
      }
    }
    return hits;
  }

  let queued = [];
  let scanScheduled = false;

  function flushScan() {
    scanScheduled = false;
    const roots = queued;
    queued = [];
    if (!roots.length) return;
    let cfg = defaults;
    try { cfg = Object.assign({}, defaults, JSON.parse(localStorage.getItem(localKey) || '{}')); } catch (e) {  }
    if (!cfg.enabled || !cfg.hideUi) return;
    const t0 = performance.now();
    for (const r of roots) scanSubtree(r);
    const ms = performance.now() - t0;
    try { chrome.storage.local.set({ agegate_scan_ms: Math.round(ms * 100) / 100 }); } catch (e) {  }
  }

  function queueScan(node) {
    if (!node || node.nodeType !== 1) return;
    queued.push(node);
    if (queued.length > 20) queued = queued.slice(-20);
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(flushScan);
  }

  function startObserver() {
    const mo = new MutationObserver(function (records) {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n.nodeType === 1) queueScan(n);
        }
      }
    });
    const start = function () {
      if (!document.documentElement) return setTimeout(start, 50);
      mo.observe(document.documentElement, { childList: true, subtree: true });
    };
    start();

    setTimeout(function () { queueScan(document.body); }, 1200);
  }

  function publishVersion() {
    try {
      const v = window.__AGEGATE__ && window.__AGEGATE__.version;
      if (v) chrome.storage.local.set({ agegate_version: v });
    } catch (e) {  }
  }

  function watchMainWorld() {
    let last = null;
    const tick = function () {
      let v = null;
      try { v = document.documentElement.getAttribute('data-agegate'); } catch (e) {  }
      if (v && v !== last) {
        last = v;
        chrome.storage.local.set({ agegate_version: v });
      }
    };
    setInterval(tick, 250);
    tick();
  }

  try {
    document.documentElement.setAttribute('data-agegate-ext', chrome.runtime.getURL(''));
  } catch (e) {  }

  document.addEventListener('agegate-open-popup', function () {
    try { chrome.runtime.sendMessage({ type: 'openPopup' }); } catch (e) {  }
  });

  startObserver();
  publishVersion();
  setTimeout(publishVersion, 1500);
  watchMainWorld();
})();
