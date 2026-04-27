/* Google Tag Manager loader + lightweight tracking helper for Bếp Thuỷ Japan
 * Auto-injects GTM script. Exposes window.btTrack(event, params) for app code
 * to push standardized e-commerce events to dataLayer.
 */
(function() {
  'use strict';
  var GTM_ID = 'GTM-MN5QPB6G';

  // Skip on localhost / admin to keep analytics clean
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
  if (location.pathname.startsWith('/thuythang')) return;

  // GTM standard snippet (head)
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  var f = document.getElementsByTagName('script')[0];
  var j = document.createElement('script');
  j.async = true;
  j.src = 'https://www.googletagmanager.com/gtm.js?id=' + GTM_ID;
  f.parentNode.insertBefore(j, f);

  // GTM noscript fallback (body) — added after DOM ready
  function addNoscript() {
    var ns = document.createElement('noscript');
    var iframe = document.createElement('iframe');
    iframe.src = 'https://www.googletagmanager.com/ns.html?id=' + GTM_ID;
    iframe.height = '0'; iframe.width = '0';
    iframe.style.cssText = 'display:none;visibility:hidden';
    ns.appendChild(iframe);
    document.body.insertBefore(ns, document.body.firstChild);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addNoscript);
  } else {
    addNoscript();
  }

  // Lightweight tracking API for app code
  window.btTrack = function(eventName, params) {
    try {
      var payload = Object.assign({ event: eventName }, params || {});
      window.dataLayer.push(payload);
      // Helpful console output during dev
      if (location.hostname.indexOf('localhost') >= 0) console.log('[btTrack]', payload);
    } catch (e) { console.warn('btTrack err:', e); }
  };
})();
