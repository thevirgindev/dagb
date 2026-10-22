
const configKey = 'agegate_config';
const logKey = 'agegate_log';
const spKey = 'agegate_sp';

const spRuleId = 1;
const apiMatches = ['https://discord.com/api/*', 'https://*.discord.com/api/*', 'http://127.0.0.1:8799/mock-echo*'];
const dnrFilters = ['*discord.com/api/*', '*mock-echo*'];
const origins = [
  'https://discord.com/*',
  'https://*.discord.com/*',
  'https://discordapp.com/*',
  'https://*.discordapp.com/*',
];

const defaults = {
  enabled: true,
  status: 3,
  forceNsfw: true,
  hideUi: true,
  autoDob: true,
  keepAlive: true,
  dob: '1995-06-15',
  forceJsonGateway: true,
  rewriteFingerprint: true,
};

let currentSp = null;
let webRequestInstalled = false;

function dnrUsable() {
  return !!(chrome.declarativeNetRequest && chrome.declarativeNetRequest.updateDynamicRules);
}

function dnrRule(spValue, id, filter) {
  return {
    id: id,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'X-Super-Properties', operation: 'set', value: spValue }],
    },
    condition: {
      urlFilter: filter,
      resourceTypes: ['xmlhttprequest', 'other'],
    },
  };
}

function updateDynamicRules(options) {
  return new Promise(function (resolve, reject) {
    try {
      chrome.declarativeNetRequest.updateDynamicRules(options, function () {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function applyDnr(spValue) {
  if (!dnrUsable()) return { ok: false, error: 'declarativeNetRequest unavailable' };
  const rules = dnrFilters.map((f, i) => dnrRule(spValue, spRuleId + i, f));
  try {

    await updateDynamicRules({
      addRules: rules,
      removeRuleIds: dnrFilters.map((f, i) => spRuleId + i),
    });
    return { ok: true, via: 'dnr', rules: rules.length };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

function installWebRequestListener() {
  if (webRequestInstalled) return true;
  if (!chrome.webRequest || !chrome.webRequest.onBeforeSendHeaders) return false;
  try {
    chrome.webRequest.onBeforeSendHeaders.addListener(
      function (details) {
        if (!currentSp) return {};
        const headers = details.requestHeaders || [];
        const out = [];
        for (const h of headers) {
          if (h.name && h.name.toLowerCase() === 'x-super-properties') out.push({ name: h.name, value: currentSp });
          else out.push(h);
        }
        return { requestHeaders: out };
      },
      { urls: apiMatches },
      ['blocking', 'requestHeaders']
    );
    webRequestInstalled = true;
    return true;
  } catch (e) {
    return false;
  }
}

async function applyWebRequest(spValue) {
  if (!installWebRequestListener()) return { ok: false, error: 'blocking webRequest unavailable' };
  currentSp = spValue;
  return { ok: true, via: 'webRequest' };
}

async function applySpRule(spValue) {
  if (!spValue) return { ok: false, error: 'no fingerprint value' };
  const dnr = await applyDnr(spValue);
  if (dnr.ok) {
    currentSp = spValue;
    installWebRequestListener();
    return dnr;
  }
  const wr = await applyWebRequest(spValue);
  if (wr.ok) return wr;
  return { ok: false, error: (dnr.error || '') + ' | ' + (wr.error || '') };
}

async function clearSpRule() {
  currentSp = null;
  if (dnrUsable()) {
    try {
      await updateDynamicRules({ removeRuleIds: dnrFilters.map((f, i) => spRuleId + i) });
      return { ok: true, via: 'dnr' };
    } catch (e) {  }
  }
  return { ok: true, via: 'webRequest' };
}

function getGrantedOrigins() {
  return new Promise(function (resolve) {
    if (!chrome.permissions || !chrome.permissions.getAll) return resolve([]);
    try {
      chrome.permissions.getAll(function (p) { resolve((p && p.origins) || []); });
    } catch (e) { resolve([]); }
  });
}

async function ensureOrigins() {
  if (!chrome.permissions || !chrome.permissions.request) return { ok: true, skipped: true };
  const granted = await getGrantedOrigins();
  const missing = origins.filter(function (o) {
    return !granted.some(function (g) {
      return g === o || g === '*://*/*' || (g.indexOf('*://*.') === 0 && o.indexOf('*://*.') === 0);
    });
  });
  if (!missing.length) return { ok: true, granted: granted };
  const result = await new Promise(function (resolve) {
    try {
      chrome.permissions.request({ origins: missing }, function (r) { resolve(r); });
    } catch (e) { resolve(false); }
  });
  return { ok: !!result, requested: missing };
}

chrome.runtime.onInstalled.addListener(async function () {
  const cur = await chrome.storage.local.get(configKey);
  if (!cur[configKey]) await chrome.storage.local.set({ [configKey]: defaults });
  chrome.action.setBadgeText({ text: 'D' });
  chrome.action.setBadgeBackgroundColor({ color: '#1f7a3d' });
  await ensureOrigins();
  const sp = await chrome.storage.local.get(spKey);
  if (sp[spKey]) await applySpRule(sp[spKey]);
});

chrome.runtime.onStartup.addListener(async function () {
  chrome.action.setBadgeText({ text: 'D' });
  chrome.action.setBadgeBackgroundColor({ color: '#1f7a3d' });
  const sp = await chrome.storage.local.get(spKey);
  if (sp[spKey]) await applySpRule(sp[spKey]);
});

(async function ensureRule() {
  installWebRequestListener();
  const sp = await chrome.storage.local.get(spKey);
  if (sp[spKey]) {
    currentSp = sp[spKey];
    await applySpRule(sp[spKey]);
  }
})();

function sendStatus(out) {
  if (dnrUsable()) {
    try {
      chrome.declarativeNetRequest.getDynamicRules(function (rules) {
        out.rules = rules.map(function (r) { return { id: r.id, action: r.action, condition: r.condition }; });
        sendResponse(out);
      });
      return;
    } catch (e) {  }
  }
  sendResponse(out);
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'setSuperProperties') {
    chrome.storage.local.set({ [spKey]: msg.value }, function () {
      applySpRule(msg.value).then(function (r) { sendResponse(r); });
    });
    return true;
  }
  if (msg.type === 'clearSuperProperties') {
    chrome.storage.local.remove(spKey, function () {
      clearSpRule().then(function (r) { sendResponse(r); });
    });
    return true;
  }
  if (msg.type === 'openPopup') {
    try {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/popup.html') });
      sendResponse({ ok: true });
    } catch (e) { sendResponse({ ok: false, error: String(e) }); }
    return true;
  }
  if (msg.type === 'grantOrigins') {
    ensureOrigins().then(function (r) {
      chrome.storage.local.get(spKey, function (res) {
        if (res[spKey]) applySpRule(res[spKey]).then(function () { sendResponse(r); });
        else sendResponse(r);
      });
    });
    return true;
  }
  if (msg.type === 'getOrigins') {
    getGrantedOrigins().then(function (g) { sendResponse({ granted: g, wanted: origins }); });
    return true;
  }
  if (msg.type === 'ruleStatus') {
    chrome.storage.local.get([spKey], function (res) {
      const out = { hasSp: !!res[spKey], webRequestInstalled: webRequestInstalled, dnr: dnrUsable() };
      if (chrome.permissions && chrome.permissions.getAll) {
        try {
          chrome.permissions.getAll(function (p) {
            out.grantedOrigins = p && p.origins ? p.origins : [];
            out.grantedPermissions = p && p.permissions ? p.permissions : [];
            sendStatus(out);
          });
          return;
        } catch (e) {  }
      }
      sendStatus(out);
    });
    return true;
  }
  if (msg.type === 'getLog') {
    chrome.storage.local.get(logKey, function (res) {
      sendResponse({ log: Array.isArray(res[logKey]) ? res[logKey] : [] });
    });
    return true;
  }
  if (msg.type === 'clearLog') {
    chrome.storage.local.set({ [logKey]: [] });
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'getDefaults') {
    sendResponse({ defaults: defaults });
    return true;
  }
});

chrome.permissions.onAdded.addListener(function () {
  chrome.storage.local.get(spKey, function (res) { if (res[spKey]) applySpRule(res[spKey]); });
});

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== 'local' || !changes[configKey]) return;
  const cfg = Object.assign({}, defaults, changes[configKey].newValue || {});
  chrome.action.setBadgeText({ text: cfg.enabled ? 'D' : 'off' });
  chrome.action.setBadgeBackgroundColor({ color: cfg.enabled ? '#1f7a3d' : '#555555' });
  if (cfg.rewriteFingerprint === false) clearSpRule();
  else chrome.storage.local.get(spKey, function (res) { if (res[spKey]) applySpRule(res[spKey]); });
});
