/* Password visibility toggle for Bếp Thuỷ Japan
 * Auto-mounts an eye icon on all <input type="password"> fields.
 * Click toggles between hidden (••••) and visible plain text.
 *
 * Re-runs when DOM changes (handles dynamically-shown forms like reset-password panel).
 */
(function() {
  'use strict';

  var EYE_OPEN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-10-7-10-7a19.79 19.79 0 0 1 5.06-5.94"/><path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 10 7 10 7a19.79 19.79 0 0 1-3.17 4.21"/><path d="M14.12 14.12a3 3 0 0 1-4.24-4.24"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';

  function attach(input) {
    if (input.dataset.ptInit === '1') return;
    input.dataset.ptInit = '1';

    var parent = input.parentNode;
    if (!parent) return;

    // Wrap input in a relative container
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:block;width:100%;';
    parent.insertBefore(wrap, input);
    wrap.appendChild(input);

    // Reserve space on the right for the eye button
    var currentPaddingRight = window.getComputedStyle(input).paddingRight;
    input.style.paddingRight = '44px';

    // Build eye toggle button
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.tabIndex = -1;
    btn.setAttribute('aria-label', 'Hiện mật khẩu');
    btn.innerHTML = EYE_OPEN_SVG;
    btn.style.cssText =
      'position:absolute;top:50%;right:8px;transform:translateY(-50%);' +
      'background:transparent;border:none;cursor:pointer;' +
      'color:#9CA3AF;padding:8px;line-height:0;' +
      'display:flex;align-items:center;justify-content:center;' +
      'border-radius:8px;transition:color 0.15s,background 0.15s;';

    btn.onmouseenter = function() { btn.style.color = '#C8102E'; btn.style.background = '#FEF2F2'; };
    btn.onmouseleave = function() { btn.style.color = '#9CA3AF'; btn.style.background = 'transparent'; };

    btn.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = EYE_OFF_SVG;
        btn.setAttribute('aria-label', 'Ẩn mật khẩu');
      } else {
        input.type = 'password';
        btn.innerHTML = EYE_OPEN_SVG;
        btn.setAttribute('aria-label', 'Hiện mật khẩu');
      }
    };

    wrap.appendChild(btn);
  }

  function scan() {
    var inputs = document.querySelectorAll('input[type="password"]');
    for (var i = 0; i < inputs.length; i++) attach(inputs[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  // Re-scan when new password fields appear (e.g. recovery panel toggled visible)
  if (typeof MutationObserver !== 'undefined') {
    var obs = new MutationObserver(function() { scan(); });
    obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  // Manual hook for legacy code paths
  window.__BT_PT_RESCAN__ = scan;
})();
