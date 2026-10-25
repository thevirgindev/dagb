// ==UserScript==
// @name         DAGB k-ID Auto-Verify
// @namespace    dagb
// @version      1.1.0
// @description  Feeds a static image to k-ID's camera so age verification completes without a real selfie. Handles liveness, CORS, and camera detection.
// @match        https://*.k-id.com/*
// @match        https://k-id.com/*
// @match        https://age.k-id.com/*
// @match        https://*.age.k-id.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  const IMG_KEY = 'dagb_kid_image_url';
  const DEFAULT_IMG = '';

  function getImageUrl() {
    try { return GM_getValue(IMG_KEY, DEFAULT_IMG); } catch (e) { return DEFAULT_IMG; }
  }

  function setImageUrl(url) {
    try { GM_setValue(IMG_KEY, url); } catch (e) {  }
  }

  // Menu commands
  try {
    GM_registerMenuCommand('Set verification image URL', function () {
      const url = prompt('Enter image URL (imgur, etc.):', getImageUrl());
      if (url) setImageUrl(url);
    });
    GM_registerMenuCommand('Load image from file', function () {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = function () {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function () {
          setImageUrl(reader.result);
          alert('Image loaded. Reload the page to apply.');
        };
        reader.readAsDataURL(file);
      };
      input.click();
    });
  } catch (e) {  }

  // Load image with CORS fallback
  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      if (!url) { reject(new Error('no url')); return; }

      // If it's a data URL, load directly
      if (url.startsWith('data:')) {
        const img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('data url failed')); };
        img.src = url;
        return;
      }

      // Try crossOrigin anonymous first
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = function () {
        // Fallback: fetch with GM_xmlhttpRequest (bypasses CORS)
        try {
          GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            responseType: 'blob',
            onload: function (resp) {
              const blobUrl = URL.createObjectURL(resp.response);
              const img2 = new Image();
              img2.onload = function () { resolve(img2); };
              img2.onerror = function () { reject(new Error('blob load failed')); };
              img2.src = blobUrl;
            },
            onerror: function () { reject(new Error('fetch failed')); },
          });
        } catch (e) {
          reject(new Error('all load methods failed'));
        }
      };
      img.src = url;
    });
  }

  // Intercept getUserMedia
  const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  navigator.mediaDevices.getUserMedia = function (constraints) {
    if (!constraints || !constraints.video) {
      return origGetUserMedia(constraints);
    }

    const imgUrl = getImageUrl();
    if (!imgUrl) {
      return origGetUserMedia(constraints);
    }

    return loadImage(imgUrl).then(function (img) {
      const W = 640;
      const H = 480;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');

      // Draw image covering the canvas (center crop)
      function drawFrame(t) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        // Subtle liveness: slight scale pulse + tiny pan
        const scale = 1.0 + 0.005 * Math.sin(t * 0.003);
        const panX = 2 * Math.sin(t * 0.0017);
        const panY = 1.5 * Math.cos(t * 0.0023);
        const iw = img.naturalWidth || W;
        const ih = img.naturalHeight || H;
        const aspect = iw / ih;
        const canvasAspect = W / H;
        let dw, dh, dx, dy;
        if (aspect > canvasAspect) {
          dh = H * scale;
          dw = dh * aspect;
        } else {
          dw = W * scale;
          dh = dw / aspect;
        }
        dx = (W - dw) / 2 + panX;
        dy = (H - dh) / 2 + panY;
        ctx.drawImage(img, dx, dy, dw, dh);

        // Subtle blink overlay every ~4 seconds
        const blinkPhase = (t % 4000) / 4000;
        if (blinkPhase > 0.92 && blinkPhase < 0.97) {
          const blinkAlpha = Math.sin((blinkPhase - 0.92) / 0.05 * Math.PI) * 0.15;
          ctx.fillStyle = 'rgba(0,0,0,' + blinkAlpha + ')';
          ctx.fillRect(0, 0, W, H);
        }
      }

      drawFrame(0);

      const stream = canvas.captureStream(30);
      const track = stream.getVideoTracks()[0];

      // Keep animating
      let rafId = null;
      let startTime = performance.now();
      function animate() {
        drawFrame(performance.now() - startTime);
        rafId = requestAnimationFrame(animate);
      }
      rafId = requestAnimationFrame(animate);

      // Override track properties to look like a real camera
      try {
        Object.defineProperty(track, 'label', { get: function () { return 'DAGB Virtual Camera'; }, configurable: true });
        Object.defineProperty(track, 'readyState', { get: function () { return 'live'; }, configurable: true });
      } catch (e) {  }

      // Override getSettings
      const origGetSettings = track.getSettings ? track.getSettings.bind(track) : null;
      track.getSettings = function () {
        return {
          width: W,
          height: H,
          frameRate: 30,
          facingMode: 'user',
          deviceId: 'dagb-virtual-cam',
          groupId: 'dagb',
        };
      };

      // Override getCapabilities
      track.getCapabilities = function () {
        return {
          width: { min: W, max: W },
          height: { min: H, max: H },
          frameRate: { min: 30, max: 30 },
          facingMode: ['user', 'environment'],
          deviceId: 'dagb-virtual-cam',
        };
      };

      // Clean up on stop
      track.addEventListener('ended', function () {
        if (rafId) cancelAnimationFrame(rafId);
      });

      // Also handle the case where the track is stopped externally
      const origStop = track.stop.bind(track);
      track.stop = function () {
        if (rafId) cancelAnimationFrame(rafId);
        origStop();
      };

      return stream;
    }).catch(function (e) {
      // Fall back to real camera on any failure
      console.warn('[DAGB k-ID] Image load failed, falling back to real camera:', e.message);
      return origGetUserMedia(constraints);
    });
  };

  // Override enumerateDevices to report a fake camera
  const origEnumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
  navigator.mediaDevices.enumerateDevices = function () {
    return origEnumerate().then(function (devices) {
      const hasCamera = devices.some(function (d) { return d.kind === 'videoinput'; });
      if (!hasCamera) {
        devices.push({
          deviceId: 'dagb-virtual-cam',
          kind: 'videoinput',
          label: 'DAGB Virtual Camera',
          groupId: 'dagb',
        });
      }
      return devices;
    });
  };

  console.log('[DAGB k-ID] Camera interceptor active. Image:', getImageUrl() || '(none set — using real camera)');
})();
