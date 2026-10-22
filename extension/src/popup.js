(function () {
  'use strict';

  const configKey = 'agegate_config';

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

  const switches = ['enabled', 'forceNsfw', 'hideUi', 'autoDob', 'keepAlive', 'rewriteFingerprint'];
  const wantedOrigins = ['https://discord.com/*', 'https://*.discord.com/*', 'https://discordapp.com/*', 'https://*.discordapp.com/*'];

  let config = Object.assign({}, defaults);

  const $ = function (id) { return document.getElementById(id); };

  function paint() {
    switches.forEach(function (id) { $(id).checked = !!config[id]; });
    $('status').value = String(config.status);
    $('dob').value = config.dob || '';
  }

  function save() {
    chrome.storage.local.set({ [configKey]: config });
  }

  chrome.storage.local.get(configKey, function (res) {
    config = Object.assign({}, defaults, res[configKey] || {});
    paint();
  });

  switches.forEach(function (id) {
    $(id).addEventListener('change', function () {
      config[id] = $(id).checked;
      save();
    });
  });

  $('status').addEventListener('change', function () {
    config.status = Number($('status').value);
    save();
  });

  $('dob').addEventListener('change', function () {
    config.dob = $('dob').value.trim() || defaults.dob;
    save();
  });

  $('footVersion').textContent = 'v' + chrome.runtime.getManifest().version;

  const spec = chrome.runtime.getManifest().browser_specific_settings || {};
  const isGecko = !!spec.gecko;

  function refreshAccess() {
    if (!isGecko || !chrome.permissions || !chrome.permissions.getAll) {
      $('accessRow').style.display = 'none';
      return;
    }
    chrome.permissions.getAll(function (p) {
      const granted = ((p && p.origins) || []).some(function (o) {
        return wantedOrigins.indexOf(o) !== -1 || o === '*://*/*';
      });
      $('accessRow').style.display = granted ? 'none' : '';
    });
  }

  $('grant').addEventListener('click', function () {
    chrome.permissions.request({ origins: wantedOrigins }, function (granted) {
      chrome.storage.local.set({ agegate_access: granted ? Date.now() : null });
      refreshAccess();
    });
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes.agegate_access) refreshAccess();
  });

  refreshAccess();
})();
