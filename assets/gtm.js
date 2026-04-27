/* Analytics + Marketing Pixels for Bếp Thuỷ Japan
 * Loads GA4, GTM, Meta Pixel, TikTok Pixel in one place.
 * Exposes window.btTrack(event, params) which fans out to all 4.
 */
(function() {
  'use strict';
  var GA4_ID    = 'G-VT9TKWT1YV';
  var GTM_ID    = 'GTM-MN5QPB6G';
  var META_ID   = '934052532836859';
  var TIKTOK_ID = 'D7NB5O3C77U44OJIM0H0';

  // Skip on localhost / admin to keep analytics clean
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
  if (location.pathname.startsWith('/thuythang')) return;

  // ────────────────────────────────────────────────────────────
  // 1. Google Tag Manager (load only — user can configure pixels in GTM UI later)
  // ────────────────────────────────────────────────────────────
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  (function() {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + GTM_ID;
    document.head.appendChild(s);
  })();
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

  // ────────────────────────────────────────────────────────────
  // 2. GA4 (gtag.js — fires direct, independent of GTM)
  // ────────────────────────────────────────────────────────────
  (function() {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
    document.head.appendChild(s);
  })();
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA4_ID, { send_page_view: true });

  // ────────────────────────────────────────────────────────────
  // 3. Meta (Facebook) Pixel
  // ────────────────────────────────────────────────────────────
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
    (window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', META_ID);
  fbq('track', 'PageView');
  // Noscript fallback for Meta
  if (document.readyState !== 'loading') addMetaNoscript();
  else document.addEventListener('DOMContentLoaded', addMetaNoscript);
  function addMetaNoscript() {
    var ns = document.createElement('noscript');
    var img = document.createElement('img');
    img.height = 1; img.width = 1; img.style.display = 'none';
    img.src = 'https://www.facebook.com/tr?id=' + META_ID + '&ev=PageView&noscript=1';
    ns.appendChild(img);
    document.body.appendChild(ns);
  }

  // ────────────────────────────────────────────────────────────
  // 4. TikTok Pixel
  // ────────────────────────────────────────────────────────────
  !function (w, d, t) {
    w.TiktokAnalyticsObject = t;
    var ttq = w[t] = w[t] || [];
    ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off",
      "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent",
      "revokeConsent", "grantConsent"];
    ttq.setAndDefer = function(t, e) { t[e] = function() { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) }; };
    for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
    ttq.instance = function(t) {
      for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]);
      return e;
    };
    ttq.load = function(e, n) {
      var r = "https://analytics.tiktok.com/i18n/pixel/events.js";
      var o = n && n.partner;
      ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = r;
      ttq._t = ttq._t || {}; ttq._t[e] = +new Date;
      ttq._o = ttq._o || {}; ttq._o[e] = n || {};
      var s = document.createElement("script");
      s.type = "text/javascript"; s.async = !0;
      s.src = r + "?sdkid=" + e + "&lib=" + t;
      var u = document.getElementsByTagName("script")[0];
      u.parentNode.insertBefore(s, u);
    };
    ttq.load(TIKTOK_ID);
    ttq.page();
  }(window, document, 'ttq');

  // ────────────────────────────────────────────────────────────
  // 5. Unified btTrack(event, params) — fans out to all 3
  // ────────────────────────────────────────────────────────────
  // Maps standard GA4 events → equivalent Meta + TikTok event names
  var META_MAP = {
    add_to_cart:    'AddToCart',
    begin_checkout: 'InitiateCheckout',
    purchase:       'Purchase',
    sign_up:        'CompleteRegistration',
    login:          'Login'
  };
  var TIKTOK_MAP = {
    add_to_cart:    'AddToCart',
    begin_checkout: 'InitiateCheckout',
    purchase:       'CompletePayment',
    sign_up:        'CompleteRegistration',
    login:          'Login'
  };
  window.btTrack = function(eventName, params) {
    try {
      params = params || {};
      // 1. GTM dataLayer (in case user configures GTM later)
      window.dataLayer.push(Object.assign({ event: eventName }, params));
      // 2. GA4
      if (typeof gtag === 'function') gtag('event', eventName, params);
      // 3. Meta Pixel
      var metaEv = META_MAP[eventName];
      if (metaEv && typeof fbq === 'function') {
        var metaParams = {};
        if (params.value !== undefined) { metaParams.value = params.value; metaParams.currency = params.currency || 'JPY'; }
        if (params.items) {
          metaParams.contents = params.items.map(function(i){ return { id: String(i.item_id || ''), quantity: i.quantity || 1, item_price: i.price || 0 }; });
          metaParams.content_type = 'product';
        }
        fbq('track', metaEv, metaParams);
      }
      // 4. TikTok Pixel
      var ttEv = TIKTOK_MAP[eventName];
      if (ttEv && typeof ttq !== 'undefined' && ttq.track) {
        var ttParams = {};
        if (params.value !== undefined) { ttParams.value = params.value; ttParams.currency = params.currency || 'JPY'; }
        if (params.items) {
          ttParams.contents = params.items.map(function(i){ return { content_id: String(i.item_id || ''), content_name: i.item_name || '', quantity: i.quantity || 1, price: i.price || 0 }; });
        }
        ttq.track(ttEv, ttParams);
      }
    } catch (e) { console.warn('btTrack err:', e); }
  };
})();
