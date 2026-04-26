/* Pull-to-refresh for Bếp Thuỷ Japan
 * Pure-JS, no dependencies. Works in mobile browsers + Capacitor WebView.
 * Auto-initializes on DOMContentLoaded.
 *
 * Behavior: when user pulls down ≥80px at the top of the page (scrollY=0),
 * a brand spinner animates in. On release, page reloads. Below threshold,
 * animation reverses.
 *
 * Disable on a specific page:  window.__BT_NO_PTR__ = true; before this script.
 */
(function() {
  'use strict';
  if (window.__BT_NO_PTR__) return;

  // Skip on admin (thuythang) — they have their own refresh buttons + tables
  if (location.pathname.startsWith('/thuythang')) return;

  var THRESHOLD = 80;          // px to trigger refresh
  var MAX_PULL  = 140;         // max visual pull
  var startY    = 0;
  var pullDist  = 0;
  var pulling   = false;
  var armed     = false;       // user has pulled past threshold
  var indicator = null;
  var arrow, spinner, label;

  function buildIndicator() {
    indicator = document.createElement('div');
    indicator.id = '__bt_ptr__';
    indicator.style.cssText =
      'position:fixed;top:0;left:0;right:0;height:0;display:flex;align-items:center;justify-content:center;' +
      'background:linear-gradient(180deg,#FFF8F0,#FEF3C7);' +
      'box-shadow:0 4px 12px rgba(200,16,46,0.12);' +
      'transition:none;overflow:hidden;z-index:99999;pointer-events:none;' +
      'font-family:-apple-system,Inter,sans-serif;';
    indicator.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;color:#8B0A1F;font-weight:600;font-size:13px;">' +
        '<span id="__bt_ptr_arrow__" style="display:inline-block;font-size:20px;transition:transform 0.2s;">⬇</span>' +
        '<span id="__bt_ptr_spinner__" style="display:none;width:18px;height:18px;border:2px solid rgba(139,10,31,0.2);border-top-color:#C8102E;border-radius:50%;animation:__bt_ptr_spin__ 0.8s linear infinite;"></span>' +
        '<span id="__bt_ptr_label__">Kéo xuống để tải lại</span>' +
      '</div>';
    document.body.appendChild(indicator);

    if (!document.getElementById('__bt_ptr_style__')) {
      var style = document.createElement('style');
      style.id = '__bt_ptr_style__';
      style.textContent = '@keyframes __bt_ptr_spin__{to{transform:rotate(360deg);}}';
      document.head.appendChild(style);
    }
    arrow   = document.getElementById('__bt_ptr_arrow__');
    spinner = document.getElementById('__bt_ptr_spinner__');
    label   = document.getElementById('__bt_ptr_label__');
  }

  function setIndicator(h, isArmed) {
    if (!indicator) return;
    indicator.style.height = h + 'px';
    if (h > 0) indicator.style.transition = 'none';
    if (isArmed !== armed) {
      armed = isArmed;
      if (arrow) arrow.style.transform = armed ? 'rotate(180deg)' : 'rotate(0deg)';
      if (label) label.textContent = armed ? 'Thả ra để tải lại' : 'Kéo xuống để tải lại';
    }
  }

  function reset(animate) {
    if (!indicator) return;
    if (animate) indicator.style.transition = 'height 0.25s ease-out';
    indicator.style.height = '0px';
    setTimeout(function() { armed = false; if (arrow) arrow.style.transform = 'rotate(0deg)'; }, 250);
  }

  function triggerRefresh() {
    if (!indicator) return;
    indicator.style.transition = 'height 0.2s ease-out';
    indicator.style.height = '60px';
    if (arrow)   arrow.style.display   = 'none';
    if (spinner) spinner.style.display = 'inline-block';
    if (label)   label.textContent     = 'Đang tải lại...';
    setTimeout(function() { window.location.reload(); }, 350);
  }

  function onTouchStart(e) {
    if (window.scrollY > 0) return;
    if (!indicator) buildIndicator();
    startY = e.touches[0].clientY;
    pullDist = 0;
    pulling = true;
  }

  function onTouchMove(e) {
    if (!pulling) return;
    if (window.scrollY > 0) { pulling = false; reset(true); return; }
    var dy = e.touches[0].clientY - startY;
    if (dy <= 0) { reset(false); return; }
    // Apply rubber-band damping after threshold
    pullDist = dy < MAX_PULL ? dy : MAX_PULL + (dy - MAX_PULL) * 0.15;
    setIndicator(Math.min(pullDist, MAX_PULL + 20), pullDist >= THRESHOLD);
    // Prevent native overscroll bounce only when actually pulling
    if (e.cancelable && pullDist > 5) e.preventDefault();
  }

  function onTouchEnd() {
    if (!pulling) return;
    pulling = false;
    if (pullDist >= THRESHOLD) triggerRefresh();
    else reset(true);
    pullDist = 0;
  }

  function init() {
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove',  onTouchMove,  { passive: false });
    document.addEventListener('touchend',   onTouchEnd,   { passive: true });
    document.addEventListener('touchcancel',onTouchEnd,   { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
