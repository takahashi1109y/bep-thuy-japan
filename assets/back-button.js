/* Floating back / close button for Bếp Thuỷ Japan
 * Pure-JS, no deps. Auto-mounts a fixed top-right button that:
 *   - On any page other than "/" or "/index*" → navigates to "/"
 *   - On home → smooth-scrolls to top (only visible after scrolling past hero)
 *
 * Disable on a specific page:  window.__BT_NO_BACK__ = true; before this script.
 */
(function() {
  'use strict';
  if (window.__BT_NO_BACK__) return;

  // Skip on admin
  if (location.pathname.startsWith('/thuythang')) return;

  var path = location.pathname;
  var isHome = path === '/' || path === '' || /^\/index(\.html)?$/.test(path);

  function build() {
    var btn = document.createElement('button');
    btn.id = '__bt_back_btn__';
    btn.setAttribute('aria-label', isHome ? 'Lên đầu trang' : 'Về trang chủ');
    btn.innerHTML = isHome
      ? '<span style="font-size:18px;line-height:1">↑</span>'
      : '<span style="font-size:20px;line-height:1;font-weight:600">✕</span>';
    btn.style.cssText =
      'position:fixed;top:env(safe-area-inset-top,12px);right:14px;' +
      'width:44px;height:44px;border-radius:50%;' +
      'background:rgba(255,255,255,0.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
      'border:1px solid rgba(200,16,46,0.18);' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.14);' +
      'color:#C8102E;cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center;' +
      'z-index:99998;padding:0;' +
      'transition:opacity 0.2s,transform 0.2s,background 0.15s;' +
      'font-family:-apple-system,Inter,sans-serif;';
    btn.style.marginTop = '8px';
    btn.onmouseenter = function() { btn.style.background = '#C8102E'; btn.style.color = 'white'; };
    btn.onmouseleave = function() { btn.style.background = 'rgba(255,255,255,0.92)'; btn.style.color = '#C8102E'; };
    btn.onclick = function() {
      if (isHome) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.location.href = '/';
      }
    };

    if (isHome) {
      btn.style.opacity = '0';
      btn.style.transform = 'scale(0.8)';
      btn.style.pointerEvents = 'none';
      var visible = false;
      function onScroll() {
        var shouldShow = window.scrollY > 600;
        if (shouldShow === visible) return;
        visible = shouldShow;
        btn.style.opacity = visible ? '1' : '0';
        btn.style.transform = visible ? 'scale(1)' : 'scale(0.8)';
        btn.style.pointerEvents = visible ? 'auto' : 'none';
      }
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
