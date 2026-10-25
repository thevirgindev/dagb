// ==UserScript==
// @name         DAGB k-ID Auto-Verify
// @namespace    dagb
// @version      1.0.0
// @description  Feeds a static image to k-ID's camera so age verification completes without a real selfie. Use any photo URL (Pinterest, etc.).
// @match        https://*.k-id.com/*
// @match        https://k-id.com/*
// @match        https://age.k-id.com/*
// @match        https://*.age.k-id.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  const IMG_KEY = 'dagb_kid_image_url';
  const DEFAULT_IMG = 'https://i.pinimg.com/736x/00/00/00/00000000000000000000000000000000.jpg';

  function getImageUrl() {
    try { return GM_getValue(IMG_KEY, DEFAULT_IMG); } catch (e) { return DEFAULT_IMG; }
  }

  function setImageUrl(url) {
    try { GM_setValue(IMG_KEY, url); } catch (e) {  }
  }

  // Register menu command to set image URL
  try {
    GM_registerMenuCommand('Set verification image URL', function () {
      const url = prompt('Enter image URL (Pinterest, etc.):', getImageUrl());
      if (url) setImageUrl(url);
    });
  } catch (e) {  }

  // Intercept getUserMedia
  const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  navigator.mediaDevices.getUserMedia = function (constraints) {
    // Only intercept video requests
    if (!constraints || !constraints.video) {
      return origGetUserMedia(constraints);
    }

    const imgUrl = getImageUrl();
    if (!imgUrl || imgUrl === DEFAULT_IMG) {
      // No image set, fall through to real camera
      return origGetUserMedia(constraints);
    }

    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 640;
        canvas.height = img.naturalHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Create a video-like stream from the canvas
        const stream = canvas.captureStream(30);
        const track = stream.getVideoTracks()[0];

        // Keep drawing the image (static frame, but stream stays alive)
        const interval = setInterval(function () {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }, 100);

        // Clean up when track stops
        track.addEventListener('ended', function () { clearInterval(interval); });

        resolve(stream);
      };
      img.onerror = function () {
        // Fall back to real camera on image load failure
        origGetUserMedia(constraints).then(resolve).catch(reject);
      };
      img.src = imgUrl;
    });
  };

  // Also override enumerateDevices to report a fake camera
  const origEnumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
  navigator.mediaDevices.enumerateDevices = function () {
    return origEnumerate().then(function (devices) {
      // Add a fake camera device if none exists
      const hasCamera = devices.some(function (d) { return d.kind === 'videoinput'; });
      if (!hasCamera) {
        devices.push({
          deviceId: 'dagb-fake-cam',
          kind: 'videoinput',
          label: 'DAGB Virtual Camera',
          groupId: 'dagb',
        });
      }
      return devices;
    });
  };

  console.log('[DAGB k-ID] Camera interceptor active. Image:', getImageUrl());
})();
