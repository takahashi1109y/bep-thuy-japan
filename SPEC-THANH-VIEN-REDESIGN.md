# SPEC: Redesign /thanh-vien (Member Dashboard) — Amazon Account Hub Style

**Status**: Proposed
**Author**: em (Claude)
**Date**: 2026-05-02
**Target file**: `K:\bep-thuy-japan\thanh-vien.html` (~2900 lines, single-file SPA)
**Estimated effort**: ~3 hours

---

## 1. Why We're Redesigning

### Anh's pain points (current state)
- Vào trang là thấy điểm thưởng (points-circle 120×120px) chiếm hết khung nhìn.
- Đơn hàng bị đẩy xuống dưới một loạt tabs — phải scroll + click mới thấy.
- Tabs chen chúc 7 cái trên 1 hàng (📦 Đơn Hàng, 📘 HD Thanh Toán, 💬 Tin Nhắn, 👤 Thông Tin, 📍 Địa Chỉ, 🔐 Mật Khẩu, 📊 Điểm Thưởng) — wrap xuống 2-3 hàng trên mobile.
- Tin nhắn unread không có badge ở welcome banner — khách dễ bỏ qua.

### Anh's specific request
> *"Khi truy cập vào thì sẽ thấy ngay thông tin đơn hàng chứ không phải số điểm"*

### Reference: Amazon account hub style
- **Account screen**: 8 cards on a 4×2 grid (注文履歴 lớn nhất ở top-left), mỗi card có icon + 2-line description.
- **Orders screen** (注文履歴): danh sách đơn dạng card lớn — header xám với date/total/recipient → body trắng với product image + items + status → footer là pill buttons (配送状況を確認 vàng = primary; 納品書の印刷 / レビュー / 再度購入 / 返品 = secondary outline).

---

## 2. Information Architecture

**Priority order (top → bottom)** when user lands on `/thanh-vien` already logged in:

| # | Section | Visibility | Notes |
|---|---------|-----------|-------|
| 0 | Hero (existing) | always | giữ nguyên `<a href="/">` clickable hero |
| 1 | **Top Bar** | always | ← Trang Chủ · 🚪 Đăng Xuất (giữ nguyên) |
| 2 | **Compact Welcome Header** | always | 1 line: `Xin chào [Tên]` · 💎 [N điểm] · 💬 [unread badge nếu có] |
| 3 | **Đơn Hàng (expanded by default)** | always | THE FOCUS. Render orders Amazon-style. Empty state nếu 0 đơn. |
| 4 | **Account Hub Grid** (6 cards 3×2 mobile, 6×1 desktop) | always | Profile · Address · Password · Points & Coupons · Messages · HD Thanh Toán |
| 5 | **Active Panel** (lazy mount) | conditional | Khi anh click 1 card, panel mở ra inline phía dưới grid (accordion-style). Click lần 2 = đóng. Hoặc tab-style: panel thay nhau show/hide. |

**Key change vs current**:
- Welcome banner (256px tall với points-circle) → 56px compact header.
- Orders panel mở sẵn (KHÔNG nằm sau tab click) — show ngay khi DOM ready.
- 7 dash-tabs → 6 cards trong grid (visual, không phải tab buttons).

---

## 3. Layout Wireframe (ASCII art)

### 3.1 Desktop (≥1024px)

```
┌────────────────────────────────────────────────────────────────┐
│  HERO (clickable, existing — gradient red→gold)                 │
│  ✦ Bếp Thuỷ Japan ✦                                             │
│  Xin Chào!                                                      │
│  ─── gold-line ───                                              │
│  Quản lý tài khoản và điểm thưởng                              │
└────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────┐
  │  ← Trang Chủ                              🚪 Đăng Xuất   │  ← top bar (existing)
  └──────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────┐
  │  Xin chào, anh Thắng    💎 1,250 điểm    💬 2 mới        │  ← compact welcome (NEW)
  └──────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────┐
  │  📦 Đơn Hàng Của Anh           🔄 Làm mới   [Xem tất cả] │  ← section header
  ├──────────────────────────────────────────────────────────┤
  │  ╔═════════════════════════════════════════════════════╗ │
  │  ║ 注文日: 2026年4月29日   合計: ¥4,800   #0042  Anh T║ │  ← order card header (gray bg)
  │  ╠═════════════════════════════════════════════════════╣ │
  │  ║ [thumb] • Giò lụa Bắc 500g × 2     ¥3,600           ║ │
  │  ║ [thumb] • Giò bò 250g × 1          ¥1,200           ║ │
  │  ║                                                       ║
  │  ║ [⏳ Chờ thanh toán] (yellow pill)                     ║
  │  ║                                                       ║
  │  ║ [💳 Thanh Toán]  [配送状況] [📄 Hóa đơn] [🗑 Hủy 25p]║ │  ← actions (yellow primary + outlines)
  │  ╚═════════════════════════════════════════════════════╝ │
  │  ╔═════════════════════════════════════════════════════╗ │
  │  ║ ... order #0041 ...                                  ║ │
  │  ╚═════════════════════════════════════════════════════╝ │
  └──────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────┐
  │  Tài Khoản Của Anh                                       │  ← grid section header
  ├──────────────────────────────────────────────────────────┤
  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───┐ │
  │  │👤      │ │📍      │ │🔐      │ │📊 1250 │ │💬 2   │ │📘 │ │
  │  │Thông   │ │Địa chỉ │ │Mật     │ │điểm    │ │tin    │ │HD │ │
  │  │tin     │ │giao    │ │khẩu    │ │+coupons│ │nhắn   │ │TT │ │
  │  └───────┘ └───────┘ └───────┘ └───────┘ └───────┘ └───┘ │
  └──────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────┐
  │  [Active Panel — nội dung của card được click]            │
  │  Vd: anh click 📊 Điểm → render redeem-box + my-coupons  │
  │  + points-history (giữ nguyên markup hiện tại)            │
  └──────────────────────────────────────────────────────────┘
```

### 3.2 Mobile (<640px)

```
[Hero]
[← Trang Chủ]              [🚪 Đăng Xuất]   ← stays 2-col, smaller padding

┌────────────────────────────────────────┐
│ Xin chào, anh Thắng                    │   ← welcome stacks 2 lines on narrow
│ 💎 1,250 điểm     💬 2 tin nhắn mới   │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ 📦 Đơn Hàng    🔄 Làm mới             │
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │
│ │ 2026/04/29  ¥4,800  #0042         │ │
│ │ ────────────────────────────────  │ │
│ │ [80px] Giò lụa Bắc 500g × 2       │ │
│ │ [80px] Giò bò 250g × 1            │ │
│ │                                    │ │
│ │ [⏳ Chờ thanh toán]                │ │
│ │                                    │ │
│ │ [💳 Thanh Toán]                    │ │  ← primary full-width
│ │ [配送状況]   [🗑 Hủy 25p]          │ │  ← secondary 2-col
│ │ [📄 Hóa đơn] [💬 Liên hệ shop]    │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ Tài Khoản Của Anh                      │
├────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐              │
│ │ 👤 Thông │ │ 📍 Địa   │   2 col on   │
│ │ tin      │ │ chỉ      │   mobile     │
│ └──────────┘ └──────────┘              │
│ ┌──────────┐ ┌──────────┐              │
│ │ 🔐 Mật   │ │ 📊 Điểm  │              │
│ │ khẩu     │ │ +Coupons │              │
│ └──────────┘ └──────────┘              │
│ ┌──────────┐ ┌──────────┐              │
│ │ 💬 Tin   │ │ 📘 HD    │              │
│ │ nhắn (2) │ │ TT       │              │
│ └──────────┘ └──────────┘              │
└────────────────────────────────────────┘
```

### 3.3 Hybrid (640–1024px tablet)

3 columns for cards (3×2 grid). Order cards remain full-width. Welcome header stays 1 line.

---

## 4. Component Specs

### 4.1 Compact Welcome Header (NEW)

Replaces the existing 256px tall welcome banner with points-circle.

```html
<div class="bg-white rounded-2xl shadow-sm border border-orange-100 px-5 py-3 mb-5
            flex items-center justify-between flex-wrap gap-3">
  <div class="flex items-center gap-3 flex-wrap">
    <span class="text-gray-500 text-sm">Xin chào,</span>
    <strong id="dash-name" class="text-base font-bold text-brand-dark"></strong>
  </div>
  <div class="flex items-center gap-4">
    <a href="javascript:void(0)" onclick="openCard('points')"
       class="flex items-center gap-1.5 text-sm font-semibold text-brand-red hover:underline">
      <span style="background:linear-gradient(135deg,#D4A017,#F5C842);
                   color:white;border-radius:9999px;padding:2px 10px;font-size:13px;">
        💎 <span id="dash-points-big">0</span> điểm
      </span>
    </a>
    <a href="javascript:void(0)" onclick="openCard('messages')"
       id="welcome-msg-link"
       class="flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline hidden">
      💬 <span id="welcome-msg-unread-count">0</span> mới
    </a>
  </div>
</div>
```

**Behaviors**:
- `dash-name`, `dash-points-big`: same IDs as existing → JS doesn't change.
- Points pill is clickable → opens points panel (replaces "click `points` tab").
- Unread message link is `hidden` by default; JS removes `hidden` if `unread_count > 0`.

### 4.2 Order Card (Amazon-style — REVISED)

Current code already has a decent card (`renderOrdersToUI`). Refactor to match Amazon more closely.

**Card structure** (top → bottom):

```
┌───────────────────────────────────────────────────────────┐
│ HEADER (gray bg, 3-col on desktop / stacks on mobile)     │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────────────┐ │
│  │ 注文日       │ │ 合計          │ │ #0042              │ │
│  │ 2026/04/29  │ │ ¥4,800       │ │ Người nhận: anh T │ │
│  └─────────────┘ └──────────────┘ └────────────────────┘ │
├───────────────────────────────────────────────────────────┤
│ BODY (white bg)                                           │
│  [Status pill: ⏳ Chờ thanh toán]                         │
│                                                            │
│  ┌──┐  Giò lụa Bắc 500g × 2          ¥3,600              │
│  │📷│  Giò bò 250g × 1               ¥1,200              │
│  └──┘                                                      │
│                                                            │
│  Phí ship: ¥800 · Đã dùng 100 điểm · +48 điểm sẽ cộng    │
├───────────────────────────────────────────────────────────┤
│ ACTIONS (flex-wrap, 1 primary yellow + N outline gray)    │
│  [💳 Thanh Toán]  ← primary (yellow #FFD814 like Amazon)  │
│  [配送状況を確認] [📄 Hóa đơn] [🗑 Hủy đơn (25p)]         │
│  [💬 Liên hệ shop]                                         │
└───────────────────────────────────────────────────────────┘
```

**Status badge mapping** (extends current):

| Status | Text | Color (border / bg / text) |
|--------|------|------------------------------|
| `pending` | ⏳ Chờ thanh toán | yellow-300 / yellow-100 / yellow-800 |
| `customer_paid` | 💰 Khách báo TT (chờ shop) | blue-300 / blue-100 / blue-800 |
| `confirmed` | ✅ Đã xác nhận | green-300 / green-100 / green-800 |
| `shipped` | 🚚 Đã gửi hàng | green-300 / green-100 / green-800 |
| `delivered` | ✅ Đã nhận | gray-300 / gray-100 / gray-800 (less attention) |
| `cancelled` | ❌ Đã hủy | red-300 / red-50 / red-700 |

**Action button rules** (per status):

| Status | Primary (yellow #FFD814) | Secondary (white outline) |
|--------|--------------------------|----------------------------|
| `pending` | 💳 Thanh Toán | 🗑 Hủy đơn (Xp) · 💬 Liên hệ shop |
| `customer_paid` | 📸 Gửi biên lai khác | 🗑 Hủy đơn (Xp) · 💬 Liên hệ shop |
| `confirmed` | (none) | 💬 Liên hệ shop · 📄 Hóa đơn |
| `shipped` | 🔄 Đặt lại | 🚚 Track shipping (URL nếu có) · 📄 Hóa đơn · 💬 Liên hệ |
| `delivered` | 🔄 Đặt lại | ⭐ Đánh giá · 📄 Hóa đơn · 🔁 Đổi/trả (nếu < 7 ngày) |
| `cancelled` | (none) | 🔄 Đặt lại |

**New buttons (ko có trong code hiện tại)**:
- `📄 Hóa đơn` → mở modal in PDF (deferred — chỉ render disabled stub `title="Sắp ra mắt"`).
- `🚚 Track shipping` → nếu order có `tracking_url` field, mở external link; else disabled.
- `⭐ Đánh giá` → hiện form review inline (deferred — disabled stub).
- `🔁 Đổi/trả` → mở Tin Nhắn pre-fill subject "Yêu cầu đổi/trả đơn #X" (giống `contactShopForCancel`).

### 4.3 Account Hub Grid (NEW — replaces dash-tabs row)

```html
<section id="account-hub" class="mb-6">
  <h3 class="font-bold text-gray-700 text-sm mb-3 px-1">Tài Khoản Của Anh</h3>
  <div class="grid gap-3"
       style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));">
    <button onclick="openCard('profile')" class="hub-card">
      <div class="text-3xl mb-1">👤</div>
      <p class="font-bold text-sm">Thông Tin</p>
      <p class="text-xs text-gray-500">Tên, SĐT, sinh nhật</p>
    </button>
    <button onclick="openCard('address')" class="hub-card">
      <div class="text-3xl mb-1">📍</div>
      <p class="font-bold text-sm">Địa Chỉ</p>
      <p class="text-xs text-gray-500">Nơi nhận hàng</p>
    </button>
    <button onclick="openCard('password')" class="hub-card">
      <div class="text-3xl mb-1">🔐</div>
      <p class="font-bold text-sm">Mật Khẩu</p>
      <p class="text-xs text-gray-500">Bảo mật tài khoản</p>
    </button>
    <button onclick="openCard('points')" class="hub-card">
      <div class="text-3xl mb-1">📊</div>
      <p class="font-bold text-sm">Điểm Thưởng</p>
      <p class="text-xs text-gray-500"><span id="hub-points">0</span> điểm · coupon</p>
    </button>
    <button onclick="openCard('messages')" class="hub-card relative">
      <div class="text-3xl mb-1">💬</div>
      <p class="font-bold text-sm">Tin Nhắn</p>
      <p class="text-xs text-gray-500">Liên hệ Bếp Thuỷ</p>
      <span id="hub-msg-badge"
            class="absolute top-2 right-2 bg-red-500 text-white text-xs rounded-full
                   px-2 py-0.5 font-bold hidden"></span>
    </button>
    <a href="/huong-dan-thanh-toan" class="hub-card no-underline">
      <div class="text-3xl mb-1">📘</div>
      <p class="font-bold text-sm">HD Thanh Toán</p>
      <p class="text-xs text-gray-500">Cách trả PayPay/NH</p>
    </a>
  </div>
</section>
```

**`.hub-card` CSS** (add to `<style>`):
```css
.hub-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 16px 12px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-decoration: none;
  color: inherit;
  min-height: 110px;
}
.hub-card:hover {
  border-color: #C8102E;
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(200,16,46,0.08);
}
.hub-card.active {
  border-color: #C8102E;
  background: #FFF8F0;
  box-shadow: 0 4px 12px rgba(200,16,46,0.12);
}
```

### 4.4 Empty State (NEW)

When `orders.length === 0` after load completes:

```html
<div class="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center">
  <div class="text-5xl mb-3">🛒</div>
  <h4 class="font-bold text-brand-dark text-base mb-1">Chưa có đơn hàng nào</h4>
  <p class="text-gray-500 text-sm mb-4">
    Khám phá menu giò chả handmade — giao tận nhà toàn Nhật Bản, 1% tích điểm mỗi đơn.
  </p>
  <a href="/#products"
     class="btn-primary inline-block px-6 py-3 text-sm">
    Mua Hàng Đầu Tiên Ngay →
  </a>
  <p class="text-xs text-gray-400 mt-3">
    💎 Anh có sẵn <strong id="empty-points">0</strong> điểm để dùng cho đơn đầu
  </p>
</div>
```

Set `empty-points` text từ `localStorage.bepthuy_points` khi render — giúp khách hiểu họ có points sẵn.

### 4.5 Active Panel (refactor existing)

Current code uses `panel-orders / panel-points / panel-messages / panel-profile / panel-address / panel-password`. **Keep these IDs and markup** — only change which one is visible by default.

**New logic**:
- `panel-orders` → render at top (luôn visible, không cần "active class").
- `panel-{profile,address,password,points,messages}` → mặc định hidden. Click hub-card → show panel + scroll into view + add `.active` to card.
- Click cùng card lần 2 → close panel + remove `.active`.

---

## 5. JS State Changes

### 5.1 New helper: `openCard(name)`

Replaces `switchDashTab(tab)`. Cleaner UX vì user thấy ngay đơn hàng + có thể mở/đóng panel khác bên dưới.

```javascript
let _activeCard = null;

function openCard(name) {
  // Toggle: clicking same card closes it
  if (_activeCard === name) {
    closeAllPanels();
    _activeCard = null;
    return;
  }

  // Hide all secondary panels
  ['profile', 'address', 'password', 'points', 'messages'].forEach(p => {
    const el = document.getElementById('panel-' + p);
    if (el) el.classList.add('hidden');
  });

  // Show requested panel
  const panel = document.getElementById('panel-' + name);
  if (panel) {
    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Update card visual state
  document.querySelectorAll('.hub-card').forEach(c => c.classList.remove('active'));
  const card = document.querySelector(`[onclick="openCard('${name}')"]`);
  if (card) card.classList.add('active');

  _activeCard = name;

  // Lazy-load messages
  if (name === 'messages') loadMessages();
}

function closeAllPanels() {
  ['profile', 'address', 'password', 'points', 'messages'].forEach(p => {
    const el = document.getElementById('panel-' + p);
    if (el) el.classList.add('hidden');
  });
  document.querySelectorAll('.hub-card').forEach(c => c.classList.remove('active'));
}
```

### 5.2 Loading Skeleton (for order list while fetching)

Currently shows `⏳ Đang tải đơn hàng...`. Replace with skeleton card (Amazon pattern) — 2 placeholder cards với gray bars:

```html
<div id="order-skeleton" class="space-y-3">
  <!-- Repeat 2× -->
  <div class="bg-white border border-gray-200 rounded-2xl overflow-hidden">
    <div class="bg-gray-100 px-4 py-3 flex justify-between">
      <div class="h-3 w-24 bg-gray-200 rounded animate-pulse"></div>
      <div class="h-3 w-16 bg-gray-200 rounded animate-pulse"></div>
    </div>
    <div class="p-4 space-y-2">
      <div class="h-4 w-3/4 bg-gray-100 rounded animate-pulse"></div>
      <div class="h-4 w-1/2 bg-gray-100 rounded animate-pulse"></div>
      <div class="flex gap-2 mt-3">
        <div class="h-9 w-32 bg-yellow-100 rounded-full animate-pulse"></div>
        <div class="h-9 w-24 bg-gray-100 rounded-full animate-pulse"></div>
      </div>
    </div>
  </div>
  <!-- Second skeleton card (same markup) -->
</div>
```

`animate-pulse` đã có trong Tailwind. Skeleton chỉ hiện khi `!hasCache && retryAttempt === 0`.

### 5.3 Error Retry (existing logic stays)

Lines 1509-1516 (`hangTimeout`) → keep, but upgrade error UI:

```html
<div class="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
  <div class="text-3xl mb-2">⚠️</div>
  <p class="text-red-700 font-semibold text-sm">Kết nối chậm</p>
  <p class="text-gray-500 text-xs mb-3">Đơn hàng chưa tải được. Vui lòng thử lại.</p>
  <button onclick="loadDashboard()" class="btn-primary px-5 py-2 text-sm">🔄 Thử Lại</button>
</div>
```

### 5.4 Optimistic Cache Logic (existing, document only)

Current implementation (lines 781-790, 1693-1711) is correct. Document for future maintenance:

1. **Read cache** on init → call `renderOrdersToUI(cached.orders)` immediately. Show before network response.
2. **Fetch fresh** in background.
3. **Merge optimistic orders** (orders just placed, may not be in DB yet) — filter by `_optimistic` flag + `order_no` not in fresh result.
4. **Write cache** with merged result, keyed by `userId`.
5. **Cache key**: `localStorage.bepthuy_orders_cache` = `{ userId, orders, ts }`.

### 5.5 Welcome Header Updates

In `loadDashboard` after `totalPoints` is computed:

```javascript
// Update welcome header
document.getElementById('dash-name').textContent = displayName;
document.getElementById('dash-points-big').textContent = totalPoints.toLocaleString();
document.getElementById('hub-points').textContent = totalPoints.toLocaleString();
document.getElementById('empty-points').textContent = totalPoints.toLocaleString();

// Compute unread message count (NEW — query message_threads where unread_by_user = true)
const { data: unreadThreads } = await sb.from('message_threads')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', uid).eq('unread_by_user', true);
const unreadCount = unreadThreads?.length || 0;

const welcomeMsgLink = document.getElementById('welcome-msg-link');
const hubMsgBadge = document.getElementById('hub-msg-badge');
if (unreadCount > 0) {
  welcomeMsgLink.classList.remove('hidden');
  document.getElementById('welcome-msg-unread-count').textContent = unreadCount;
  hubMsgBadge.classList.remove('hidden');
  hubMsgBadge.textContent = unreadCount;
} else {
  welcomeMsgLink.classList.add('hidden');
  hubMsgBadge.classList.add('hidden');
}
```

**Better**: extend `get_member_dashboard` RPC to return `unread_message_count` in single roundtrip (no extra query).

---

## 6. Migration Plan

### 6.1 Code to KEEP (no change)

| File location | Rationale |
|--------------|-----------|
| Lines 1-49 (head, fonts, base CSS) | Brand styles unchanged |
| Lines 50-64 (hero) | Anh muốn giữ |
| Lines 67-308 (auth, forgot, reset sections) | Out of scope |
| Lines 348-367 (`panel-orders` markup) | Reuse — chỉ move ra ngoài tabs container |
| Lines 369-400 (`panel-points`) | Keep ID + content, change visibility logic |
| Lines 402-420 (`panel-messages`) | Same |
| Lines 422-456 (`panel-profile`) | Same |
| Lines 458-491 (`panel-address`) | Same |
| Lines 493-508 (`panel-password`) | Same |
| Lines 522-630 (payment modal) | Out of scope |
| Lines 644-1064 (Supabase init, auth flows, hCaptcha) | Out of scope |
| Lines 796-889 (`renderOrdersToUI`) | Refactor button list (Section 4.2 table) — keep core structure |
| Lines 1452-1796 (`loadDashboard` body) | Keep — only change loading/empty UI markup |
| Lines 1801-1904 (saveProfile/saveAddress/changePassword) | Keep — no UI change |
| Lines 1988-2333 (payment + cancel modals) | Keep — work as-is |
| Lines 2338-2445 (messaging) | Keep — same panel ID |

### 6.2 Code to REFACTOR

| Lines | What changes |
|-------|--------------|
| 326-335 (welcome banner with points-circle) | **Remove**, replace with compact welcome header (Section 4.1) |
| 338-346 (dash-tabs row) | **Remove**, replace with account hub grid (Section 4.3) |
| 348-367 (panel-orders) | Move out of tabs container — render after welcome header. Remove the `<div id="panel-orders">` wrapper and rename to `<section id="orders-section">`. Keep inner markup. |
| 1430-1448 (`switchDashTab`) | **Replace** with `openCard(name)` (Section 5.1). Keep `?tab=` URL param compatibility — map old tab names → card names. |
| 811-889 (action button building inside `renderOrdersToUI`) | Update button list per Section 4.2 table (add 📄 Hóa đơn, ⭐ Đánh giá stubs as disabled). |
| 798-803 (empty state in `renderOrdersToUI`) | Replace with rich empty state (Section 4.4). |
| 1505-1506 (loading text) | Replace with skeleton markup (Section 5.2). |
| 1511 (error markup) | Upgrade with icon + clearer CTA (Section 5.3). |
| 46 (`.points-circle` CSS) | Can DELETE — no longer used. |
| 36-40 (`.dash-tab*` CSS) | Can DELETE — replaced by `.hub-card`. |

### 6.3 Code to ADD

1. `.hub-card` CSS rule (Section 4.3).
2. Compact welcome header HTML (Section 4.1).
3. Account hub grid HTML (Section 4.3).
4. Empty state markup (Section 4.4).
5. Skeleton loader markup (Section 5.2).
6. `openCard(name)` + `closeAllPanels()` JS functions (Section 5.1).
7. Unread message count fetch in `loadDashboard` (Section 5.5) — or extend RPC.
8. URL param compat: when `?tab=orders` arrives, scroll to `#orders-section`. When `?tab=points/messages/etc`, call `openCard(...)`.

### 6.4 Backwards compat

- All panel IDs (`panel-orders`, `panel-points`, etc.) stay the same → existing JS functions (`saveProfile`, `loadMessages`, `doRedeem`, etc.) need ZERO changes.
- `switchDashTab` is called from 4 places (lines 938, 1217, 1445, 2206). Replace with `openCard` — same name signature. Keep `switchDashTab` as alias for 1 release: `function switchDashTab(t) { openCard(t); }`.
- `?tab=` URL param still honored (Section 6.3 step 8).

---

## 7. Effort Breakdown

| Task | Lines changed | Time |
|------|---------------|------|
| **A. Compact welcome header** — remove banner+circle, add 1-line header with points pill + msg link | ~15 lines removed, ~25 added | **30 min** |
| **B. Account hub grid** — remove dash-tabs row, add 6-card grid + `.hub-card` CSS | ~10 removed, ~50 added | **30 min** |
| **C. Order card redesign** — refactor `renderOrdersToUI` action list per status table, add 📄/⭐ stubs | ~80 lines refactored | **1h** |
| **D. Action buttons polish** — Amazon yellow primary, white outline secondaries, mobile stack | inline | (incl. in C) |
| **E. Mobile responsive** — verify breakpoints, test 360px, fix any overflow | ~20 lines CSS tweaks | **30 min** |
| **F. Empty state** — replace 1-line empty msg with rich CTA card | ~5 removed, ~15 added | **15 min** |
| **G. Skeleton + error UI** — replace loading text and error retry markup | ~5 removed, ~30 added | **15 min** |
| **H. JS rewire** — `openCard` replaces `switchDashTab`, unread badge fetch, URL param compat | ~30 lines modified | **30 min** |
| | **TOTAL** | **~3h 30min** |

(Anh cho ngân sách 3h — em sẽ skip phần stub buttons 📄 Hóa đơn / ⭐ Đánh giá nếu chạy quá thời gian, để release sau.)

---

## 8. Acceptance Criteria

Sau khi xong, em test trên thiết bị thật:

- [ ] Vào `/thanh-vien` đã đăng nhập → thấy đơn hàng đầu tiên trong viewport (không cần scroll).
- [ ] Welcome header chiếm ≤ 80px (đo bằng DevTools).
- [ ] Click hub-card "Điểm Thưởng" → panel mở ra dưới grid, scroll smooth tới nó.
- [ ] Click cùng card lần 2 → panel đóng.
- [ ] Tin nhắn unread hiện badge đỏ ở welcome + hub-card.
- [ ] Order card: status pill đổi màu đúng theo bảng Section 4.2.
- [ ] Order pending: nút "💳 Thanh Toán" màu vàng #FFD814 + nút outline "🗑 Hủy đơn (Xp)" hoạt động.
- [ ] Order delivered: chỉ thấy outline buttons (no yellow primary).
- [ ] Empty state (test bằng tài khoản 0 đơn): thấy CTA "Mua Hàng Đầu Tiên Ngay" + điểm hiện tại.
- [ ] Mobile 360px: tất cả buttons và cards không overflow ngang.
- [ ] Chrome DevTools Lighthouse: CLS ≤ 0.1, LCP ≤ 2s (đã có cache).
- [ ] `?tab=orders` URL → scroll tới orders section.
- [ ] `?tab=points` URL → mở points card.
- [ ] Existing flows (đăng nhập, đăng ký, forgot pw, payment modal, cancel order, send message) — KHÔNG bị regress.

---

## 9. Out of Scope (Defer)

- 📄 Hóa đơn PDF print → cần backend endpoint riêng. Render disabled stub button với tooltip "Sắp ra mắt".
- ⭐ Review form → cần `product_reviews` table + RPC. Disabled stub.
- 🚚 Shipping tracking link → chỉ enable nếu order có `tracking_url` (hiện tại schema chưa có).
- Giỏ hàng đã lưu / Wishlist (Amazon có nhưng anh chưa cần).
- Đa ngôn ngữ JP/VN cho card text (hiện viết tiếng Việt).

---

## 10. Open Questions (em hỏi anh trước khi code)

1. Có muốn em giữ nguyên text Nhật **注文日 / 合計** trong order header (giống Amazon JP) hay đổi sang tiếng Việt **Ngày đặt / Tổng tiền**? — Mặc định em sẽ dùng tiếng Việt vì khách Việt là chủ yếu.
2. Có cần thêm filter ở orders section (vd: "Chỉ hiện đơn 30 ngày" / "Tất cả") không? Amazon có dropdown này. — Em đề xuất defer cho lần 2.
3. Card "📘 HD Thanh Toán" có nên loại khỏi grid không? Vì nó là external link, không phải chức năng tài khoản. Em đề xuất giữ vì khách mới hay tìm chỗ này.
4. Ưu tiên A (anh thấy đơn ngay = scope chính) — nếu hết giờ, em skip phần grid hub và chỉ giữ welcome compact + orders top + nút tabs cũ ở dưới được không?
