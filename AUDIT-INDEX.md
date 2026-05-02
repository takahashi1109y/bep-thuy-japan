# Audit Report — `K:\bep-thuy-japan\index.html`

**Audit date:** 2026-05-02
**File:** `K:\bep-thuy-japan\index.html` (132,535 bytes, 2,195 lines)
**Auditor:** Claude (read-only, no modifications made)

Severity legend: 🔴 critical / 🟡 should-fix / 🟢 nice-to-have

---

## Executive Summary

The homepage is functional and well-structured for a hand-rolled single-file storefront. It does most things right: pre-compiled Tailwind (24KB local instead of 300KB CDN), `<picture>` with WebP first, `loading="lazy"` on product images, deferred external scripts, font preconnect, and a proper Option B payment-then-create-order flow. The previously known **silent-fail bug at line ~1395 has been fixed**: `finalizeOrderWithPayment` no longer fabricates an order number on fetch failure (line 1588–1593 now shows a "🔄 Thử Lại" button and keeps `orderNo` empty until the backend returns one at line 1558).

Top concerns:

1. **SEO is essentially absent** — no meta description, no OpenGraph/Twitter cards, no Product/Organization schema.org. This is the largest single fix for search visibility and social sharing.
2. **JPG fallbacks are oversized** — `cha.jpg` is 943KB, `nem-lui.jpg` is 839KB. WebP is served first so most users are fine, but the JPGs ship to ~5–10% of clients.
3. **Touch targets fail** — cart `+`/`−` buttons are 28×28px (need ≥44×44px); 🗑 delete button is similar. This is a real mobile UX blocker.
4. **Accessibility gaps** — zero `aria-*` attributes anywhere; `outline:none` on all inputs without strong replacement focus ring; no skip-link; many emoji-only buttons have no text label for screen readers; `<label>` elements on form fields are siblings (not wrapping), but the `for=` attribute is missing — they're decorative only.
5. **Form validation uses `alert()`** disruptively, no inline error messages.
6. **Cart is in-memory only** — `migrateCart()` is defined (line 1082) but never invoked, and cart is never persisted to localStorage. Refreshing the page wipes the cart silently.
7. **Hidden checkbox on the wrong element** — `f-mailbox` and `f-r-mailbox` are `type="hidden"` (lines 726, 780) but the page has no UI to set them. Effectively dead inputs.

Cart logic, payment flow (Option B), and out-of-stock handling are solid.

---

## 1. Performance

| Sev | Finding | Line(s) | Fix |
|-----|---------|---------|-----|
| 🟡 | JPG fallbacks oversized: `cha.jpg` 943KB, `nem-lui.jpg` 839KB, `moc.jpg` 603KB, `gio.jpg` 573KB. WebP versions are 100-230KB which is fine; but the JPG fallback ships to old browsers and the disk usage / git size is bloated. | `images/*.jpg` | Re-export JPGs at quality 75–80 max-width 1200px → expect 80–150KB each. |
| 🟢 | Render-blocking is well-handled: Tailwind preloaded `media=print onload=all`, fonts preloaded with same trick, external JS (`qrcode.min.js`, `supabase-js`) before `</body>`, `pull-to-refresh.js`, `gtm.js`, `back-button.js` all marked `defer`. | 24-29, 1000-1001, 2191-2193 | None. Already optimized. |
| 🟢 | Critical CSS is inline (lines 30-110, 121-205) which is correct for above-the-fold. External `tailwind.css` and `app-mobile.css` are loaded synchronously with `<link rel="stylesheet">` — could in principle be deferred, but at 24KB+1.7KB the cost is minimal. | 28-29 | None. |
| 🟡 | Two duplicate hero `<style>` blocks: one in `<head>` (line 30-110) and one inline inside the hero `<section>` (line 121-205). The second block defines `.btn-3d*` classes — this is fine functionally but slightly hurts maintainability. | 121-205 | Move all `.btn-3d*` rules into the head `<style>` block or the external `tailwind.css`. |
| 🟢 | Images use `<picture>` with WebP-first source and JPG fallback, plus `loading="lazy"`. Good. | 255, 265, 283, 293, 303, 316, 337, 347, 365, 377 | None. |
| 🟢 | Preconnect to fonts.googleapis.com, fonts.gstatic.com, cdn.jsdelivr.net, cdnjs.cloudflare.com, supabase, script.google.com — all required origins covered. | 18-23 | None. |
| 🟡 | Scroll listener on every scroll event without throttle/passive — `window.addEventListener('scroll', ...)` at line 475-481. Cheap (only one DOM read + style write) but should be `{passive: true}` to avoid blocking scroll on iOS. | 475 | Add `{passive: true}` as third arg. |
| 🟢 | Cart UI re-renders entire `<div>` on every change (`list.innerHTML = cart.map(...)`). Fine for cart sizes <100 items. | 1148-1156 | None at current scale. |

---

## 2. SEO

| Sev | Finding | Line(s) | Fix |
|-----|---------|---------|-----|
| 🔴 | **No meta description.** Only `google-site-verification` and `viewport` exist. Google will auto-generate a snippet from page text — usually low quality. | 5-6 | Add `<meta name="description" content="Bếp Thuỷ Japan — Giò chả handmade chuẩn vị Phố Cổ Hà Nội, ship toàn Nhật. Giò lụa, chả quế, mọc, nem lụi Huế, pate phố cổ.">` |
| 🔴 | **No OpenGraph tags.** Sharing on Facebook/Zalo/Messenger will show no preview image, no title, no description. | head | Add `og:title`, `og:description`, `og:image` (e.g. `images/gio.webp`), `og:url`, `og:type=website`, `og:locale=vi_VN`. |
| 🔴 | **No Twitter Card** tags. | head | Add `twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`. |
| 🔴 | **No Schema.org structured data.** No Organization, no Product, no LocalBusiness. Critical for Google rich results, especially for an e-commerce site. | head | Add `<script type="application/ld+json">` with: `Organization` (name, logo, telephone, sameAs), `Product` for each item (with `offers`, `priceCurrency: "JPY"`, `availability`), and ideally `WebSite` with `SearchAction` (if you add search later). |
| 🟡 | Heading hierarchy issue: `<h1>` is the brand name (line 210, good), but each product has its own `<h3>` (line 257, 267, 285, etc.) before its category-level `<h3>` ancestor (line 251, 279, 333, 361). Result: `<h3>Giò</h3>` (category) is sibling-level to `<h3>Giò</h3>` (product card title). Google may misread which is the section heading. | 251 vs 257; 279 vs 285; etc. | Either change category headings to `<h2>` (more semantically correct — they're page sections under the "Đặc Sản Của Chúng Tôi" `<h2>` at line 244) or change product titles to `<h4>`. |
| 🟡 | Some product images have generic alt text. `alt="Giò"` (line 255) is OK but `alt="Chả Lụa"` (line 316) for the "Không Tiêu" variant doesn't describe variant. | 255, 265, 283, 293, 303, 316, 337, 347, 365, 377 | Match alt text to the actual variant being shown (e.g. `alt="Chả Lụa Không Tiêu, không quế"`). |
| 🟢 | `<title>` is good: "Bếp Thuỷ Japan — Đặc Sản Phố Cổ Hà Nội Tại Nhật". | 16 | None. |
| 🟢 | `<html lang="vi">` correctly set. | 2 | None. |

---

## 3. Accessibility

| Sev | Finding | Line(s) | Fix |
|-----|---------|---------|-----|
| 🔴 | **Zero `aria-*` attributes** anywhere in the file. The cart drawer (`#cart-panel`), the bulk popup (`#si-popup`), and the receipt overlay all lack `role="dialog"`, `aria-modal="true"`, `aria-labelledby`. Screen reader users have no way to know a modal is open. | 514-562, 581-997 | Add `role="dialog" aria-modal="true" aria-labelledby="cart-title"` on `#cart-panel`; mirror for `#si-popup`. Set `id="cart-title"` on the cart's `<h2>`. |
| 🔴 | **Buttons that are emoji-only have no text label for screen readers.** E.g. `<button>🗑</button>` (line 1155) — the `title="Xóa sản phẩm"` only shows on hover; screen readers ignore it. The cart `+`/`−` buttons have `title=` attrs but no `aria-label`. | 1151, 1153, 1155 | Add `aria-label="Giảm 0.5kg"`, `aria-label="Tăng 0.5kg"`, `aria-label="Xóa sản phẩm khỏi giỏ"`. |
| 🔴 | **`outline: none` is set globally on all `input, select`** (line 80) but the replacement focus indicator is only `border-color`. For sighted keyboard users with sluggish vision, a 1-2px border color change is hard to spot. | 80 | Use `:focus-visible { box-shadow: 0 0 0 3px rgba(200,16,46,0.3); }` instead of removing outline entirely, or restore outline with a styled ring. |
| 🟡 | **Form `<label>` elements are siblings of inputs without `for=`.** E.g. line 658-659: `<label>...</label> <input id="f-name">` — the label is positionally adjacent but not associated. Clicking the label doesn't focus the input; screen readers don't announce label when input is focused. | 658-740, 758-779 | Add `for="f-name"` (etc.) to every `<label>`. ~12 fields. |
| 🟡 | **No skip-link** to jump to main content for keyboard users. | After `<body>` line 112 | Add `<a href="#products" class="sr-only focus:not-sr-only">Bỏ qua đến menu</a>`. |
| 🟡 | **Color contrast** — 22 instances of `text-gray-400` (#9CA3AF) on cream/white backgrounds yield ~3:1 contrast (fails WCAG AA for body text 4.5:1). Frequently used for helper text like "Đặt hàng giúp người khác / 配達時間帯". | many lines | Replace `text-gray-400` for body-sized helper text with `text-gray-500` (#6B7280, ~4.6:1) where used as informational copy. |
| 🟡 | **Tab order through cart drawer is fine on open**, but when drawer closes, focus is not returned to the floating cart button — keyboard users are stranded. | 1235-1241 | After `closeCart()`, call `document.querySelector('button[onclick="openCart()"]').focus()`. |
| 🟢 | Form labels exist (just need `for=`) and key form fields are logically grouped. | 657-740 | Bundled with label `for=` fix above. |

---

## 4. Mobile UX

| Sev | Finding | Line(s) | Fix |
|-----|---------|---------|-----|
| 🔴 | **Cart `+`/`−` buttons are 28×28px** (`.qty-btn` at line 79). Apple/Google guidelines require ≥44×44px. The 🗑 delete button is also small (16px font + 8/10px padding ≈ 32×32px). | 79, 1151, 1153, 1155 | Change `.qty-btn { width: 44px; height: 44px; }`. Increase trash button padding. |
| 🟡 | **Member banner close-X button** (line 1984, 2012 — birthday/inactive banners) uses small `padding:2px 10px` — likely <44px tall. | 1984, 2012 | Increase padding to `padding: 8px 14px`. |
| 🟡 | **Receipt preview "Chọn ảnh khác" link** (line 911) is plain text underline — small tap target. | 911 | Wrap in a button with min-height 44px. |
| 🟢 | Viewport meta is correct: `width=device-width, initial-scale=1.0, viewport-fit=cover`. The `viewport-fit=cover` is needed for safe-area handling on iPhone notch — good. | 6 | None. |
| 🟢 | iOS auto-zoom prevention is solid: `app-mobile.css` forces `font-size: 16px` on all input types. Inputs in checkout also explicitly set `font-size:16px` in the `@media (max-width:480px)` block (line 107). | `app-mobile.css` 32-43; `index.html` 107 | None. |
| 🟢 | Cart drawer behavior: `#cart-panel` is `width:100%; max-width:480px` so on phones it covers the screen. Body scroll locked when open (line 1234, 1239). Close on overlay click (line 579). | 77, 1234, 1239 | None. |
| 🟢 | Safe-area insets respected via `app-mobile.css`. | `app-mobile.css` 21-26 | None. |

---

## 5. Cart Logic

| Sev | Finding | Line(s) | Fix |
|-----|---------|---------|-----|
| 🟡 | **`migrateCart()` is defined but never called.** Function at line 1082 handles legacy cart shape (filling `unitPrice`, deriving `isBox`, normalizing `qty`), but no code path invokes it. Combined with the next bullet, this is dead code. | 1082-1105 | Either remove the function or call it once on load (with cart data restored from localStorage — see next finding). |
| 🟡 | **Cart is not persisted to localStorage.** `let cart = []` (line 1045) is the only state; it never saves. Refresh = empty cart. This is likely unintentional given the existence of `migrateCart()`. | 1045, 1082 | Add `localStorage.setItem('bepthuy_cart', JSON.stringify(cart))` in `updateCartUI()`. On load, parse from localStorage and call `migrateCart()`. |
| 🟢 | **No race condition in `addToCart`** — function is synchronous (line 1047). Multiple rapid clicks just append the same item correctly via the `cart.find(i => i.id === id)` consolidation. | 1047-1069 | None. |
| 🟢 | **Empty cart UX** is good: large 🛒 emoji, helpful copy ("Hãy thêm sản phẩm vào giỏ nhé!"), CTA "Xem Thực Đơn" button to close drawer (line 597). Help guides also visible at bottom of cart. | 593-630 | None. |
| 🟡 | **Loose-match string compare in `removeFromCart`/`changeQty`** uses `String(i.key) !== String(key)` (line 1115, 1122). Comment says "onclick passes string but stored key is number". Smell of bug history; would be cleaner if `key` were always numeric. Functional, just brittle. | 1113-1134 | Standardize: in cart-list HTML, do `data-key="${i.key}"` and bind via `addEventListener` instead of `onclick` strings. |
| 🟢 | **+/− on weight items steps by 0.5kg** (`step = 0.5` at line 1124). Consistent with the half-kg pricing model. | 1119-1134 | None. |

---

## 6. Checkout Flow

| Sev | Finding | Line(s) | Fix |
|-----|---------|---------|-----|
| 🟢 | **The known silent-fail bug at line ~1395 is FIXED.** Current line 1395 is the address-confirm checkbox warning. The actual order-creation point is `finalizeOrderWithPayment` (line 1504). On fetch failure (network or HTTP error), the catch block at 1588-1593 displays the error message and shows a "🔄 Thử Lại" button — `orderNo` stays empty. The only path that sets `orderNo` is line 1558 `orderNo = data.orderNo;` inside the success-only branch. Verified by full file scan: `orderNo =` appears at lines 1045 (init), 1558 (from server), 1687 (reset). **No fake-order-number generation exists.** | 1504-1594 | None — please confirm by intentionally pointing `SCRIPT_URL` at an unreachable host in a test env. |
| 🔴 | **Form validation uses `alert()`** for every error (lines 1373-1396, 1479, 1505-1506). On mobile, alert dialogs interrupt flow and break focus context. No inline field-level error messages exist. | 1373-1396 | Replace each `alert()` with an inline error: e.g. add `<p class="text-red-600 text-xs hidden" id="err-name">...</p>` under each input, toggle on validation, and scroll input into view + focus it. |
| 🟡 | **Email is not validated.** Field has `type="email"` (line 663) but `submitOrder` does not check it. Customer can leave it blank or invalid. Server-side may also accept it. The email is later used in optimistic cache (line 1566) and group-order text (line 1631). | 1362-1396, 663 | Add `if (email && !/^\S+@\S+\.\S+$/.test(email)) { ... }` check. Decide whether email is required (currently field has no `*` indicator at line 662, suggesting optional). |
| 🟡 | **Phone is not validated** — placeholder shows `080-XXXX-XXXX` but no format check or required-attr. | 666-668 | Add JS check: `if (!phone || phone.replace(/\D/g,'').length < 9) { ... }`. |
| 🟡 | **Loading state on Continue → Payment button is missing.** `submitOrder()` is sync until the receipt step, but the button doesn't disable while validation/calc runs. Multiple rapid clicks could cause issues if validation later becomes async. | 822 | Add `submit-btn` disable at start of `submitOrder()`. |
| 🟢 | **Loading state on Finalize is excellent.** Button disables, shows spinner, displays progressive status messages: "Đang đọc ảnh..." → "Đang xác minh số tiền..." → final result. | 1510-1521 | None. |
| 🟢 | **Error messages from server are well-formatted.** `verify_failed` errors with reason text are displayed in a styled red box with newlines converted to `<br>` (line 1545-1549). Helpful "Vui lòng chọn ảnh biên lai khác" CTA. | 1538-1554 | None. |

---

## 7. Payment Flow (Option B)

| Sev | Finding | Line(s) | Fix |
|-----|---------|---------|-----|
| 🟢 | **Receipt upload UI is clear.** Big dashed-border button "📷 Chọn ảnh biên lai" (line 905-908), preview image after select, "Chọn ảnh khác" option for re-pick (line 911). Step indicators (1, 2) are visually obvious. | 897-913 | None. |
| 🟢 | **Total cần thanh toán** is prominently shown in red (line 836-839). Reduces customer's mental math. | 834-839 | None. |
| 🟢 | **Payment method tabs work cleanly.** PayPay default (matches anh's preference). Bank tab shows ゆうちょ details with copy button for account number. | 849-893 | None. |
| 🟡 | **PayPay QR is regenerated each time payment-section opens** (`generatePayPayQRPayment()` at line 1424). Not a bug, but slightly wasteful. | 1424, 1449-1458 | Cache one QR DOM node and reuse — minor. |
| 🟡 | **No retry pathway when AI verify fails for amount mismatch** other than "Choose another image". If the user actually paid the right amount but the AI mis-reads (e.g. blurry photo), they're stuck. | 1538-1552 | Consider adding a "Liên hệ Thuỷ qua Zalo" fallback button that pre-fills a message with order details so anh can manually verify. |
| 🟢 | **5MB upload limit** (line 1478) is sensible for a phone receipt screenshot. Friendly Vietnamese error if exceeded. | 1478-1481 | None. |
| 🟢 | **Progress indication during AI verify is good.** Three distinct status messages shown progressively. | 1511-1521 | None. |
| 🟡 | **Spinner is just `<span class="spin">⏳</span>`** (line 1511, 1517, 1520). Emoji animation depends on font support — on some Android devices ⏳ may not animate consistently. | 1511 | Use a CSS-rendered spinner (border + animation) for reliability. |

---

## 8. Out-of-Stock Handling

| Sev | Finding | Line(s) | Fix |
|-----|---------|---------|-----|
| 🟢 | **"🔴 Hết hàng" is clear.** Replaces the qty selector with a red-bordered notice ("Sản phẩm đang được sản xuất, anh/chị quay lại sau nhé!") AND adds a 45%-opacity overlay with white-text-on-red "HẾT HÀNG" badge over the image. | 1883-1902 | None. |
| 🟢 | **Add-to-cart properly disabled** because the entire `.weight-selector` / `.box-selector` markup is replaced — no button to click. | 1886-1889 | None. |
| 🟢 | **Card opacity reduced to 0.85** to visually de-emphasize. | 1901 | None. |
| 🟢 | **Low-stock badge** ("Sắp hết — chỉ còn X kg") shown when `stock <= low_stock_threshold`. Yellow-amber styling, readable. | 1904-1916 | None. |
| 🟡 | **Box products' max is capped by stock**, but weight products have no equivalent cap — customer can always pick up to 15kg even if only 2kg is in stock. | 1864-1874 | For weight products, regenerate options up to `Math.min(15, stock)` — re-render via `initWeightSelector` after capping. |

---

## 9. Security

| Sev | Finding | Line(s) | Fix |
|-----|---------|---------|-----|
| 🟢 | **Supabase key is the public anon key** (`sb_publishable_*` at line 1936). Correct for client-side. No service_role key leaked. | 1935-1936 | None. |
| 🟢 | **All fetch URLs are HTTPS.** No `http://` URLs found in fetch/script/link contexts — only inside SVG namespace (line 54) which is fine. | scan | None. |
| 🟢 | **Apps Script URL** (line 1005) is the only backend endpoint and is HTTPS. The receipt + order body is sent there. | 1005, 1532 | None. |
| 🟡 | **GA4 tracking-id and script paths** (`/assets/gtm.js`, etc.) — assuming gtm.js doesn't expose secrets. Outside scope of this audit but worth a separate spot-check. | 2192 | Spot-check `assets/gtm.js` for hardcoded GTM/GA tokens — public is OK, private API keys are not. |
| 🟡 | **`innerHTML` injections of customer-supplied strings.** `recipientName`, `recipientPhone` (line 1625), `pref/postal/address` (line 1622-1624) all flow into `innerHTML`. Apps Script likely sanitizes, but if a Vietnamese name contains `<script>`, it would execute. | 1620-1626, 1631 (textContent — safer), 1148-1156 | Replace `${i.name}` etc. inside `.innerHTML = template literals` with `textContent` writes via DOM API, OR explicitly HTML-escape. Lower-priority because input source is the customer themselves, not an attacker — they'd only XSS themselves. |
| 🟢 | **Receipt image is sent as base64** in JSON body (line 1526) — content-type `text/plain` is unusual but Apps Script's preference; not a security issue. | 1532-1535 | None. |
| 🟢 | **No localStorage tokens or session secrets** stored client-side. Only `bepthuy_member`, `bepthuy_orders_cache`, `register_prefill` — all profile data, no auth tokens. (Supabase itself manages session in its own keyed storage.) | 1264, 1573, 1647 | None. |

---

## 10. Internationalization

| Sev | Finding | Line(s) | Fix |
|-----|---------|---------|-----|
| 🟢 | **Vietnamese text quality is excellent throughout.** Natural diaspora-Vietnamese tone, friendly without being too formal. "Hạnh phúc là được ăn ngon" tagline is on-brand. Colloquialisms like "anh/chị" (line 932), "Thuỷ giao hàng!" (line 468) match the Bếp Thuỷ Japan voice. | full file | None. |
| 🟢 | **Japanese terms are accurate.** 北海道, 東京都, 関西, クール宅急便, 普通, 口座番号, 配達時間帯, 郵便番号 — all correct. The 47 prefectures dropdown has correct kanji + romaji. | 673-715, 720, 732 | None. |
| 🟢 | **Bilingual labels** for delivery time slots are well done (e.g. "午前中 — Buổi sáng (trước 12h)", line 734). | 733-739 | None. |
| 🟢 | **PayPay account name** タカハラ ケイイチロウ uses correct katakana. | 890 | None. |
| 🟢 | **Yen formatting** uses `toLocaleString('ja-JP')` (line 1138, 1159, 1909). Consistent. | 1138 | None. |
| 🟡 | **Mixed VN/EN/JP font fallbacks.** `font-family: 'Inter', sans-serif` for body, `'Playfair Display', serif` for headings. Both are Latin-only fonts; Japanese kanji in dropdown options will fall back to system font (fine on most platforms but visually inconsistent with the brand serif headings on pages with mixed text). | 31-32 | Optional: add Noto Sans JP as fallback after Inter for cleaner cross-script rendering. Low priority. |

---

## Top 10 Prioritized Fixes

| # | Sev | Fix | Effort | Why first |
|---|-----|-----|--------|-----------|
| 1 | 🔴 | Add meta description, OpenGraph (og:title, og:description, og:image, og:url, og:type, og:locale=vi_VN), Twitter cards, and JSON-LD `Organization` + `Product` schema. | M (1-2h) | Single biggest SEO/social-share lift; site is invisible to FB/Zalo previews today. |
| 2 | 🔴 | Increase `.qty-btn` from 28×28 to 44×44 px, and 🗑 delete button likewise. Mobile users can't tap reliably today. | S (15min) | Real UX blocker on the most-used surface (cart). |
| 3 | 🔴 | Replace all `alert()` validation errors in `submitOrder` with inline `<p>` error messages under each field. Add real email + phone validation. | M (1-2h) | Improves checkout completion rate, reduces support questions. |
| 4 | 🔴 | Add `aria-label` to all emoji-only buttons (cart +/-, 🗑, ✕ close, copy buttons) and `role="dialog" aria-modal="true"` on `#cart-panel`, `#si-popup`. | S (30min) | Screen reader compliance; quick win. |
| 5 | 🔴 | Persist cart to localStorage on every `updateCartUI()` and call `migrateCart()` on load. Currently cart wipes on refresh — silent data loss. | S (15min) | Lost-cart abandonment is real revenue loss. |
| 6 | 🟡 | Re-export `images/*.jpg` at quality 75–80, max-width 1200px. Targets: each <200KB. | S (10min) | Saves ~3MB total in repo + faster fallback loads. |
| 7 | 🟡 | Add `for=` attribute to all 12+ `<label>` elements in checkout. Improves screen reader experience and click-to-focus. | S (15min) | Trivial fix, real accessibility win. |
| 8 | 🟡 | Replace `outline:none` global rule (line 80) with `:focus-visible { box-shadow: 0 0 0 3px rgba(200,16,46,.3); }`. | S (5min) | Keyboard users can't see focus today. |
| 9 | 🟡 | Fix heading hierarchy: change `<h3>` category headings (Giò, Chả, Mọc, Đặc Sản) to `<h2>` since they're top-level page sections under "Đặc Sản Của Chúng Tôi" `<h2>`. | S (5min) | Cleaner SEO + screen-reader navigation. |
| 10 | 🟡 | Cap weight-product selector max to `Math.min(15, stock)` in `applyProductOverride` for parity with box-product behavior. | S (10min) | Prevents overselling on items where stock < 15kg. |

---

## Items Verified OK (No Action Needed)

- Silent-fail bug at line ~1395: **fixed**, no fake order numbers generated on fetch failure.
- Race conditions in `addToCart`: **none** (synchronous function, idempotent merge by id).
- Hardcoded credentials: **none leaked** (only `sb_publishable_*` public anon key, which is correct).
- HTTPS enforcement: all fetches go to HTTPS endpoints.
- Out-of-stock UX: clear overlay, disabled purchase, helpful messaging.
- Mobile viewport, safe-area, and iOS auto-zoom prevention.
- Vietnamese and Japanese text quality.
- WebP-first image strategy.
- Render-blocking minimization (preconnect, deferred scripts, font preload trick).

---

*End of report.*
