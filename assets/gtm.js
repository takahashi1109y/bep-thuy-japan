/* Google Tag Manager loader for Bếp Thuỷ Japan
 * GTM container manages all pixels (GA4, Meta, TikTok) via dashboard config.
 * Exposes window.btTrack(event, params) → pushes to dataLayer for GTM to consume.
 */
(function() {
  'use strict';
  var GTM_ID = 'GTM-MN5QPB6G';

  // Skip on localhost / admin to keep analytics clean
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
  if (location.pathname.startsWith('/thuythang')) return;

  // Standard GTM snippet (head)
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  (function() {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + GTM_ID;
    document.head.appendChild(s);
  })();

  // GTM noscript fallback (body)
  function addGtmNoscript() {
    var ns = document.createElement('noscript');
    var iframe = document.createElement('iframe');
    iframe.src = 'https://www.googletagmanager.com/ns.html?id=' + GTM_ID;
    iframe.height = '0'; iframe.width = '0';
    iframe.style.cssText = 'display:none;visibility:hidden';
    ns.appendChild(iframe);
    document.body.insertBefore(ns, document.body.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addGtmNoscript);
  else addGtmNoscript();

  // Tracking helper — pushes to dataLayer.
  // GTM tags (configured in dashboard) listen on these events and forward to GA4/Meta/TikTok.
  window.btTrack = function(eventName, params) {
    try {
      var payload = Object.assign({ event: eventName }, params || {});
      window.dataLayer.push(payload);
    } catch (e) { console.warn('btTrack err:', e); }
  };
})();
