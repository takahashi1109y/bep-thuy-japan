# SPEC — Tính năng "🔄 Mua lại" (One-Click Re-order) cho Bếp Thuỷ Japan

**Tác giả:** em (Claude) — viết theo yêu cầu của anh Thắng
**Ngày:** 2026-05-02
**Trạng thái:** Draft v1 — chờ anh duyệt rồi em mới code
**Phạm vi file ảnh hưởng:** `K:\bep-thuy-japan\thanh-vien.html` (UI nút + modal + redirect),
`K:\bep-thuy-japan\index.html` (đọc URL params + warning banner)

---

## 0. Mục tiêu & lý do

Hiện tại trên trang `/thanh-vien` (`thanh-vien.html`), khi đơn ở trạng thái `shipped` hoặc `delivered`, có nút `🔄 Đặt lại` — **nhưng nút đó chỉ link sang `/`**, khách phải tự nhớ rồi click lại từng sản phẩm. Đây là cơ hội bị bỏ lỡ:

- **Khách quen ăn 1 món lặp lại 5–10 lần / năm** → 1 click thay vì 5 click = giảm ma sát đáng kể.
- **Tăng repeat rate** (KPI quan trọng nhất của EC giò chả vì khách dùng đều).
- **Đơn lớn hơn**: khách thường order y hệt đơn cũ + thêm 1–2 món mới.

Mục tiêu: **1 click → giỏ hàng đầy y hệt đơn cũ → khách chỉ confirm địa chỉ + thanh toán**.

---

## 1. UX Flow (chi tiết click-by-click)

### 1.1. Trên trang `/thanh-vien`

Mỗi card đơn hàng (đoạn render bởi `renderOrdersToUI()` ở `thanh-vien.html` dòng 796–889) có thêm 1 nút **`🔄 Mua lại`** trong khu vực action buttons (dòng 839–887).

**Quy tắc hiển thị nút:**
- Hiển thị cho **mọi status TRỪ `cancelled`** (kể cả `pending` — vì khách có thể đặt thêm đơn 2 trong khi đơn 1 chưa thanh toán xong).
- **Thay thế** nút `🔄 Đặt lại` cũ (dòng 847) — nút cũ chỉ là link `<a href="/">`, không bằng được Mua lại.
- Style: dùng **secondary class** (white outline pill, giống "Liên hệ shop") để **không cướp ưu tiên** với primary action vàng (Thanh toán / Gửi biên lai).

### 1.2. Click `🔄 Mua lại` → modal xác nhận

Hiện modal overlay (giống pattern `pmModal` / `claimWelcome` đang có trong `thanh-vien.html`):

```
┌─────────────────────────────────────────────┐
│  🔄 Mua lại đơn #BT00123                     │
│                                             │
│  Em sẽ copy 4 sản phẩm trong đơn cũ vào    │
│  giỏ hàng:                                  │
│                                             │
│   • Giò có tiêu (1.5kg) × 1                │
│   • Chả quế có tiêu (1kg) × 1              │
│   • Nem lụi cuốn sả (3 hộp) × 1            │
│   • PA TE (2 hộp) × 1                       │
│                                             │
│  ⚠ Lưu ý: Nếu giỏ hàng hiện tại đang có    │
│  sản phẩm, em sẽ GỘP THÊM (không xoá).      │
│                                             │
│  [Huỷ]                  [✅ Đồng ý, mua lại]│
└─────────────────────────────────────────────┘
```

**Edge — đơn rỗng:** nếu `o.items.length === 0` → modal đổi nội dung: "Đơn này không có chi tiết sản phẩm. Anh/chị thử đặt từ trang chủ nhé!" + chỉ có nút `[Đóng]`. (Trường hợp hiếm — chỉ xảy ra với data legacy bị mất `items` JSONB.)

### 1.3. Click `✅ Đồng ý, mua lại`

1. Modal đóng, hiện toast "⏳ Đang kiểm tra hàng..." (~300ms).
2. Hàm `reorderFromOrder(orderNo)` chạy (xem section 5):
   - Lookup catalog cho từng item.
   - Validate stock + active.
   - Build danh sách `validItems` + `skippedItems`.
3. **Branch theo kết quả:**

   **A. Tất cả items hợp lệ:**
   - Lưu cart vào `localStorage['bepthuy_cart']` (xem section 4).
   - `window.location.href = '/?reorder=success&from=BT00123'`
   - Trang `/` load → tự gọi `openCart()` → khách thấy giỏ đầy → chỉ cần tiếp checkout.

   **B. Có items bị skip (out of stock / inactive):**
   - Vẫn lưu `validItems` vào cart.
   - Truyền danh sách skipped qua URL: `/?reorder=partial&from=BT00123&skipped=GT,Pte`
   - Trang `/` hiện banner cảnh báo (xem 1.4).

   **C. Tất cả items đều skip (cực hiếm):**
   - **Không** modify cart (giữ nguyên cart hiện tại nếu có).
   - Hiện alert ngay trên `/thanh-vien`: "Tiếc quá! Tất cả sản phẩm trong đơn cũ hiện đều hết hàng hoặc tạm ngừng bán. Anh/chị xem các sản phẩm khác ở trang chủ nhé."
   - **KHÔNG** redirect — khách ở lại `/thanh-vien`.

### 1.4. Trang `/` sau redirect

Khi `index.html` load, đoạn JS mới đọc `URLSearchParams`:
- Nếu `?reorder=success` → auto `openCart()` sau khi DOM ready 500ms (đợi product cards init xong).
- Nếu `?reorder=partial` → hiện banner đỏ phía trên giỏ hàng:
  ```
  ⚠ Có 2 sản phẩm trong đơn cũ #BT00123 không còn bán nữa
     và đã được bỏ qua: Giò có tiêu, PA TE.
     Em đã thêm các sản phẩm còn lại vào giỏ rồi nhé.
     [✕ Đóng]
  ```
- Sau khi xử lý xong → `history.replaceState({}, '', '/')` để dọn URL params (tránh khách F5 trigger lại).

---

## 2. Data Flow

### 2.1. Đầu vào: `orders.items` JSONB

Đã có sẵn từ `saveOrderToSupabase` (index.html dòng 1415):
```json
[
  { "name": "[GT] Giò có tiêu",    "size": "1.5kg",  "price": 2775, "qty": 1, "wt": 1.5 },
  { "name": "[Nem] Nem lụi cuốn sả Huế", "size": "3 hộp", "price": 3300, "qty": 1, "wt": 1.5 }
]
```

**Quan trọng:** shape lưu trong DB **THIẾU** `id`, `unitPrice`, `isBox` so với cart RAM. Phải reconstruct.

### 2.2. Pipeline xử lý từng item

```
orders.items[i]
  │
  ├── 1. Parse code từ name: regex /^\[([^\]]+)\]/
  │      "[GT] Giò có tiêu" → "GT"
  │
  ├── 2. Lookup product_catalog WHERE code = ?
  │      → { id, name, unit_price, stock_quantity, is_active, stock_unit }
  │
  ├── 3. Validate:
  │      a. Found?           → nếu NULL: skip, reason="not_found"
  │      b. is_active?       → nếu false: skip, reason="discontinued"
  │      c. stock_quantity?  → nếu <= 0: skip, reason="out_of_stock"
  │      d. Stock đủ?        → nếu stock < itemAmount: hạ qty xuống stock có sẵn,
  │                            reason="reduced_qty" (vẫn add nhưng cảnh báo)
  │
  ├── 4. Reconstruct cart shape:
  │      {
  │        id:        catalog.id,
  │        key:       catalog.id,                    // dùng id làm key
  │        name:      catalog.name,                  // dùng name từ catalog (mới nhất)
  │        size:      formatCartSize(...),           // tính lại từ wt + isBox
  │        price:     wt/0.5 * catalog.unit_price,   // tính lại theo giá hiện tại
  │        wt:        original_wt,
  │        qty:       1,                             // luôn 1 (cart gộp theo wt)
  │        unitPrice: catalog.unit_price,
  │        isBox:     (catalog.stock_unit === 'hộp' || stock_unit === 'túi')
  │      }
  │
  └── 5. Push vào validItems[] hoặc skippedItems[]
```

### 2.3. Quan trọng: dùng GIÁ MỚI hay giá cũ?

**Quyết định: dùng GIÁ MỚI từ `product_catalog`.**

Lý do:
- Nếu giá tăng từ 925 → 950, mà copy giá cũ vào giỏ → lúc submit Apps Script tính lại sẽ lệch → khách bực.
- Apps Script đã có logic verify giá ở backend khi tạo đơn → gửi giá cũ = fail validation.
- Khách quen với "giá hiển thị = giá tính tiền" — show giá mới ngay từ giỏ là đúng UX.

Ngược lại: **giữ nguyên `wt` (số kg / số hộp)** — đây là intent của khách lần trước.

### 2.4. Quan trọng: gộp duplicate code

Nếu đơn cũ có 2 dòng cùng code (ví dụ legacy data trùng) → gộp `wt` lại trước khi validate (giống logic `addToCart` ở index.html dòng 1054 — find theo `id`, tăng `wt`).

---

## 3. UI Components mới

### 3.1. Nút `🔄 Mua lại` trong order card

**File:** `thanh-vien.html`, sửa hàm `renderOrdersToUI()` (~dòng 838 — chỗ build `actions[]`).

Thêm nút **TRƯỚC** "Liên hệ shop", **THAY THẾ** nút "Đặt lại" cũ:

```js
// Hiển thị cho mọi đơn TRỪ cancelled
if (o.status !== 'cancelled' && Array.isArray(o.items) && o.items.length > 0) {
  actions.push(
    `<button onclick="openReorderModal('${o.order_no}')" class="${secondaryCls}">🔄 Mua lại</button>`
  );
}
```

**Lưu ý:** Cẩn thận escape `order_no` (đã thấy pattern `customerNameSafe` dòng 830 — em sẽ dùng pattern tương tự nếu order_no có ký tự lạ, dù thực tế order_no toàn ký tự an toàn `BT00xxx`).

### 3.2. Modal xác nhận

**File:** `thanh-vien.html`, thêm vào cuối phần body (gần các modal khác).

```html
<div id="reorder-modal" class="hidden fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center px-4">
  <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
    <h3 class="text-lg font-bold text-brand-dark mb-3" id="reorder-modal-title">
      🔄 Mua lại đơn
    </h3>
    <div id="reorder-modal-body" class="text-sm text-gray-700 space-y-2 mb-5">
      <!-- Filled by openReorderModal() -->
    </div>
    <div class="flex gap-2 justify-end">
      <button onclick="closeReorderModal()"
        class="px-4 py-2 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50">
        Huỷ
      </button>
      <button id="reorder-confirm-btn" onclick="confirmReorder()"
        class="px-5 py-2 rounded-full bg-brand-red text-white font-semibold hover:bg-red-700">
        ✅ Đồng ý, mua lại
      </button>
    </div>
  </div>
</div>
```

State JS:
```js
let _reorderState = null; // { orderNo, validItems, skippedItems }
```

### 3.3. Skipped-items warning banner trên `/`

**File:** `index.html`, thêm vào trên cùng `cart-items-section` (~dòng 592, trước `cart-empty`).

```html
<div id="reorder-warning-banner" class="hidden mx-5 mt-3 p-3 rounded-xl
     bg-orange-50 border border-orange-300 text-orange-900 text-sm">
  <p class="font-semibold mb-1">⚠ Một số sản phẩm không còn bán</p>
  <p id="reorder-warning-text" class="text-xs"></p>
  <button onclick="document.getElementById('reorder-warning-banner').classList.add('hidden')"
    class="mt-2 text-xs underline">Đã hiểu, đóng</button>
</div>
```

JS handler đọc URL ở init:
```js
function handleReorderRedirect() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('reorder');
  if (!mode) return;

  const fromOrder = params.get('from') || '';
  if (mode === 'partial') {
    const skippedNames = (params.get('skipped') || '').split(',').filter(Boolean);
    const banner = document.getElementById('reorder-warning-banner');
    document.getElementById('reorder-warning-text').textContent =
      `Đơn cũ #${fromOrder} có ${skippedNames.length} sản phẩm hết hàng / ngừng bán đã được bỏ qua: ${skippedNames.join(', ')}.`;
    banner.classList.remove('hidden');
  }

  // Auto-open cart sau 500ms (đợi syncProductsFromCatalog xong)
  setTimeout(() => {
    if (cart.length > 0) openCart();
  }, 500);

  // Dọn URL params
  history.replaceState({}, '', '/');
}
```

Gọi `handleReorderRedirect()` sau khi cart đã load từ localStorage (xem section 4).

---

## 4. Storage Strategy — phân tích 2 hướng

### Hướng A: Modify localStorage trực tiếp trên `/thanh-vien` rồi redirect

**Cách làm:** `/thanh-vien` ghi `localStorage['bepthuy_cart']`, sau đó redirect `/`. Trang `/` **đọc localStorage khi load** rồi populate biến `cart`.

**Pros:**
- Single source of truth cho cart (localStorage).
- Tự nhiên — sau này nếu muốn cart persist giữa các session (refresh trang `/` không mất giỏ) thì đã có sẵn cơ chế.
- URL sạch — chỉ cần `?reorder=success` để báo trang `/` biết phải open cart.
- Không lo URL quá dài (Chrome giới hạn ~2000 ký tự, đơn 10 món encode JSON có thể vượt).
- An toàn: data là JSON object, không cần escape URL.

**Cons:**
- Hiện tại `index.html` **không có** code load cart từ localStorage (em đã verify — `cart` là biến RAM khởi tạo `let cart = []` dòng 1045, không có `loadCart()`).
- Phải viết thêm `loadCart()` + `saveCart()` ở `index.html` → thay đổi nhiều hơn.
- Nếu khách mở `/` ở tab khác cùng lúc → 2 tab share cart (có thể là feature, có thể là bug).

### Hướng B: Truyền items qua URL params

**Cách làm:** Encode `validItems` thành base64 JSON → `?reorder=success&items=BASE64...`. Trang `/` decode và populate cart.

**Pros:**
- Không cần thay đổi cart persistence ở `index.html` — cart vẫn là RAM-only.
- Stateless — share link cũng được (dù không có use case).

**Cons:**
- URL dễ vượt 2000 ký tự với đơn lớn (10 món × ~80 byte/món JSON ≈ 800 byte raw, base64 = 1100 byte, OK với Chrome nhưng risky với SMS share).
- Phải base64 encode/decode + URI escape — thêm code phức tạp.
- Nếu khách bookmark URL hoặc share → trigger lại đơn cũ → khó chịu.
- Mọi người (bao gồm GA4) thấy items trong URL → privacy/log noise.

### **Quyết định: chọn Hướng A**

Lý do chính: **Hướng A đặt nền móng cho feature "cart persist giữa session"** — đây là QoL anh có thể muốn add sau (khách lỡ refresh trang `/` không mất giỏ). 1 mũi tên 2 chim.

**Cụ thể implementation cho Hướng A:**

**Cart key:** `localStorage['bepthuy_cart']` (snake_case, prefix `bepthuy_` đồng bộ với `bepthuy_member`, `bepthuy_orders_cache`).

**Cart format (versioned):**
```json
{
  "v": 1,
  "ts": 1746150000000,
  "items": [
    { "id": 1, "key": 1, "name": "[GT] Giò có tiêu", "size": "1.5kg",
      "price": 2775, "wt": 1.5, "qty": 1, "unitPrice": 925, "isBox": false }
  ]
}
```

`v: 1` để tương lai migration không vỡ. `ts` để TTL cleanup (giỏ cũ hơn 7 ngày → xoá khi load).

**Sửa ở `index.html`:**

1. Sau khi khởi tạo `let cart = []` (dòng 1045), thêm `loadCart()`:
```js
function loadCart() {
  try {
    const raw = localStorage.getItem('bepthuy_cart');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.items)) return;
    // TTL: 7 ngày
    if (parsed.ts && Date.now() - parsed.ts > 7 * 86400000) {
      localStorage.removeItem('bepthuy_cart');
      return;
    }
    cart = parsed.items;
    migrateCart(); // re-use logic có sẵn dòng 1082
    updateCartUI();
  } catch (e) {
    console.warn('[cart] load fail:', e);
    localStorage.removeItem('bepthuy_cart');
  }
}

function saveCart() {
  try {
    if (!cart || cart.length === 0) {
      localStorage.removeItem('bepthuy_cart');
      return;
    }
    localStorage.setItem('bepthuy_cart', JSON.stringify({
      v: 1, ts: Date.now(), items: cart
    }));
  } catch (e) { console.warn('[cart] save fail:', e); }
}
```

2. Gọi `saveCart()` ở cuối các hàm modify cart: `addToCart`, `removeFromCart`, `changeQty`, `resetAndClose`.

3. Gọi `loadCart()` + `handleReorderRedirect()` trong DOMContentLoaded handler:
```js
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.weight-selector').forEach(initWeightSelector);
  document.querySelectorAll('.box-selector').forEach(initBoxSelector);
  loadCart();              // ← MỚI
  handleReorderRedirect(); // ← MỚI
});
```

4. Trong `resetAndClose()` (dòng 1686), `cart=[]` rồi gọi `saveCart()` để xoá luôn key.

---

## 5. Code Stubs — signatures

### 5.1. `thanh-vien.html`

```js
/**
 * Mở modal mua lại — preview items + validate stock.
 * @param {string} orderNo - Order number, e.g. "BT00123"
 */
async function openReorderModal(orderNo) { /* ... */ }

/**
 * Đóng modal, reset state.
 */
function closeReorderModal() { /* ... */ }

/**
 * User click "Đồng ý" — ghi cart vào localStorage rồi redirect.
 */
function confirmReorder() { /* ... */ }

/**
 * Core logic: validate items chống catalog, build cart shape.
 * Trả về { valid, skipped }. Không có side effect.
 * @param {string} orderNo
 * @returns {Promise<{valid: Array, skipped: Array<{name:string, reason:string}>, originalOrder: object}>}
 */
async function reorderFromOrder(orderNo) {
  // 1. Tìm order trong `currentOrders` (đã cache sau renderOrdersToUI)
  //    Hoặc fetch lại nếu cần (fallback).
  // 2. Fetch product_catalog (1 query duy nhất, lọc is_active = true)
  //    SELECT id, code, name, unit_price, stock_quantity, stock_unit FROM product_catalog
  // 3. Build map: catalogByCode = { 'GT': {...}, 'Nem': {...} }
  // 4. Loop order.items:
  //    a. Parse code: name.match(/^\[([^\]]+)\]/)
  //    b. Lookup catalogByCode[code]
  //    c. Validate (found / active / stock)
  //    d. Push vào valid hoặc skipped
  // 5. Return { valid, skipped, originalOrder: order }
}
```

### 5.2. `index.html`

```js
/**
 * Load cart từ localStorage (nếu có). Gọi 1 lần ở DOMContentLoaded.
 */
function loadCart() { /* ... */ }

/**
 * Persist cart vào localStorage. Gọi sau mỗi modify cart.
 */
function saveCart() { /* ... */ }

/**
 * Đọc URL params ?reorder=... → hiện banner / auto-open cart.
 */
function handleReorderRedirect() { /* ... */ }
```

### 5.3. Storage shape (chi tiết)

**Key:** `bepthuy_cart`

**Value (JSON-stringified):**
```ts
type StoredCart = {
  v: 1;                    // schema version
  ts: number;              // Date.now() khi save
  items: Array<{
    id: number;            // catalog.id
    key: number;           // = id
    name: string;          // "[GT] Giò có tiêu"
    size: string;          // "1.5kg" hoặc "3 hộp"
    price: number;         // total ¥ cho row
    wt: number;            // kg (or boxCount × 0.5)
    qty: 1;                // luôn 1
    unitPrice: number;     // ¥ / 0.5kg hoặc ¥ / hộp
    isBox: boolean;
  }>;
};
```

---

## 6. Tests / Edge Cases (manual QA checklist)

### 6.1. Happy path
- [ ] Đơn 3 món hợp lệ → click Mua lại → modal hiện đủ 3 món → confirm → redirect `/` → cart mở tự động → giỏ có đúng 3 món, đúng wt, giá theo catalog hiện tại.
- [ ] Tổng tiền ở giỏ khớp với `wt × unit_price` mới (KHÔNG phải tổng đơn cũ).

### 6.2. Stock edge cases
- [ ] **Đơn rỗng** (`o.items` là `[]` hoặc null): Modal hiện "Đơn không có chi tiết" → không có nút confirm. Cart không đổi.
- [ ] **1 item out of stock** (stock = 0): hiện trong modal preview với strikethrough + "(Hết hàng)". Confirm → redirect với `?reorder=partial&skipped=...` → banner hiển thị đúng tên.
- [ ] **1 item inactive** (`is_active=false`): xử lý giống out of stock, message "(Ngừng bán)".
- [ ] **1 item not found** (catalog không có code đó — legacy data): skip, message "(Không còn bán)".
- [ ] **Stock không đủ** (đơn cũ 5kg, stock còn 2kg): hạ qty xuống 2kg + warning trong banner "Giò có tiêu: chỉ còn 2kg, đã giảm số lượng".
- [ ] **TẤT CẢ items đều skip**: alert tại `/thanh-vien`, KHÔNG redirect, KHÔNG modify cart hiện tại.

### 6.3. Cart state edge cases
- [ ] **Cart trống** + mua lại → cart đầy 3 món.
- [ ] **Cart đang có 2 món khác** + mua lại đơn 3 món **khác mã** → cart có 5 món.
- [ ] **Cart đang có 1 món** (Giò có tiêu 1kg) + mua lại đơn có cùng mã (Giò có tiêu 0.5kg) → **gộp** thành 1.5kg (giống logic `addToCart` dòng 1054 — find by id, tăng wt).
- [ ] **Cart legacy** (saved trước migration v1) → load detect `v != 1` → drop, không vỡ trang.
- [ ] **Cart > 7 ngày tuổi**: TTL trigger, xoá tự động khi load.

### 6.4. Data shape edge cases
- [ ] **Item name không có `[CODE]` prefix** (data legacy, ví dụ "Giò Lụa Bếp Thuỷ"): regex parse fail → skip với reason "format_invalid".
- [ ] **Item có `wt = 0`** (data hỏng): skip với reason "zero_weight".
- [ ] **Item có `qty > 1`** (legacy — cart bây giờ luôn qty=1): tính `effectiveWt = wt × qty` rồi validate.
- [ ] **Đơn có > 10 items** (paranoia, hiện tại catalog chỉ 10 SKU): không crash.

### 6.5. Concurrent / race
- [ ] Click Mua lại 2 lần liên tiếp nhanh: nút disable sau click 1, modal lock.
- [ ] Đang mở modal cho đơn A, click "Mua lại" đơn B: modal cập nhật sang đơn B (hoặc disable click khi modal đang mở — chọn cái sau cho an toàn).
- [ ] User F5 trang `/` sau khi đã reorder: URL đã `replaceState` → không trigger lại. Cart vẫn còn (do localStorage). OK.

### 6.6. Auth edge cases
- [ ] Khách KHÔNG đăng nhập click Mua lại: thực tế không xảy ra vì đơn list chỉ hiện sau auth. Nhưng nếu session expire giữa chừng → fetch product_catalog public read được (đã có policy "Public read active products" ở `supabase-inventory.sql` dòng 35). OK.
- [ ] Catalog query timeout / network error: hiện toast "Không kết nối được hệ thống, anh/chị thử lại sau nhé" → modal đóng, không modify cart.

### 6.7. Visual / UX
- [ ] Trên mobile (375px) modal hiển thị đầy đủ, không tràn.
- [ ] Banner skipped trên `/` không che logo / nút giỏ hàng.
- [ ] Toast feedback hiện đủ rõ (không bị cart panel che).

---

## 7. Câu hỏi mở cho anh Thắng

Em ghi rõ để anh quyết trước khi em code:

1. **Giá:** Có đồng ý dùng giá MỚI (catalog hiện tại) thay vì giá đơn cũ không? Em nghiêng về giá mới (lý do ở 2.3) nhưng đây là quyết định business.

2. **Cart persistence (Hướng A):** Anh có muốn cart giữ giữa các lần truy cập (ví dụ khách thêm vào giỏ tối qua, sáng quay lại vẫn còn) không? Nếu **có** → đây là QoL bonus. Nếu **không** → em chỉ save cart trong context reorder, sau khi `resetAndClose` (đặt thành công) hoặc `loadCart` xong là xoá luôn.

3. **TTL cart:** 7 ngày là em đề xuất. Anh thấy nên ngắn (1 ngày) hay dài (30 ngày)?

4. **Status `pending` / `customer_paid`:** Có nên cho mua lại đơn chưa thanh toán xong không? Em nghiêng về **CÓ** (linh hoạt cho khách), nhưng có nguy cơ khách đặt 2 đơn trùng. Cân nhắc.

5. **Vị trí nút trong action row:** Hiện em đề xuất "Mua lại" thay thế nút "Đặt lại" cũ ở status `shipped/delivered`. Còn ở status khác (`pending`, `customer_paid`, `confirmed`) thì nút "Mua lại" sẽ là **secondary** (white pill). Anh thấy OK chưa?

6. **Tracking GA4:** Em sẽ thêm event `bt_reorder_initiated` (khi click Mua lại) + `bt_reorder_confirmed` (khi confirm) để đo conversion. OK?

---

## 8. Implementation order (em sẽ làm theo thứ tự này)

1. **Phase A — Cart persistence** (foundation): viết `loadCart()` + `saveCart()` + tích hợp vào `index.html`. Test riêng (refresh trang giỏ vẫn còn). ~30 phút.
2. **Phase B — Validation logic**: viết `reorderFromOrder()` ở `thanh-vien.html`. Test bằng console với 1 order_no thật. ~45 phút.
3. **Phase C — UI modal**: thêm modal HTML + `openReorderModal` / `closeReorderModal` / `confirmReorder`. ~30 phút.
4. **Phase D — Trang `/`**: thêm `handleReorderRedirect()` + banner skipped. ~20 phút.
5. **Phase E — Manual QA** theo checklist section 6. ~30 phút.

**Tổng estimate:** ~2h30 (em cộng 30% buffer cho debug → 3h).

---

## 9. Files sẽ được modify

| File | Loại thay đổi | Lines (estimate) |
|---|---|---|
| `K:\bep-thuy-japan\thanh-vien.html` | Thêm modal HTML + 4 hàm JS + sửa `renderOrdersToUI()` | +180, ~5 sửa |
| `K:\bep-thuy-japan\index.html` | Thêm `loadCart` / `saveCart` / `handleReorderRedirect` + banner HTML + 4 chỗ gọi `saveCart()` | +90, ~6 sửa |

**Không cần migration SQL** — feature dùng schema có sẵn (`product_catalog` + `orders.items` JSONB).

**Không cần đổi Apps Script** — flow checkout đi qua giỏ hàng bình thường.

---

*Hết spec. Anh đọc xong cho em feedback nhé — đặc biệt 6 câu hỏi mở ở section 7.*
