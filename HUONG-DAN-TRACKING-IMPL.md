# Hướng dẫn triển khai tính năng Tracking Modal — Bếp Thuỷ Japan

> Tài liệu kỹ thuật mô tả tính năng "Tình trạng vận chuyển" (tracking modal) trong trang `/thanh-vien`.
> Em viết để anh Thắng nắm tổng quan, biết cách bảo trì khi Yamato/Sagawa đổi giao diện, và biết test sao cho đúng.
> Ngày cập nhật: 2026-05-02.

---

## 1. Tổng quan (Overview)

Tính năng **Tracking Modal** cho phép khách hàng của Bếp Thuỷ Japan tự xem được tình trạng vận chuyển đơn hàng (giò chả, nem, …) ngay trong trang `/thanh-vien` mà không cần copy mã tracking rồi mở web Yamato/Sagawa thủ công. Khi anh đã đánh dấu đơn "Đã gửi" và nhập mã vận đơn (tracking number) trong admin `/thuythang`, hệ thống sẽ tự cào (scrape) trang Yamato 宅急便 hoặc Sagawa 飛脚 phía server (qua Apps Script `UrlFetchApp`), trả về danh sách các sự kiện vận chuyển (đã nhận hàng → đang vận chuyển → đến trung tâm → đang giao → đã giao), rồi vẽ thành **timeline trực quan** trong một popup. Bài toán em muốn giải: giảm số lần khách nhắn anh hỏi "đơn em đến đâu rồi anh ơi?", đồng thời tăng độ tin cậy chuyên nghiệp của Bếp Thuỷ Japan như một shop nội địa Nhật chính hãng.

---

## 2. Sơ đồ kiến trúc (Architecture)

Khi khách bấm nút "📍 Tình trạng vận chuyển", luồng dữ liệu chạy như sau:

```
┌─────────────────────┐
│  Customer browser   │  (/thanh-vien)
│  order card         │
└──────────┬──────────┘
           │ 1. Click "📍 Tình trạng vận chuyển"
           ▼
┌─────────────────────┐
│   showTrackingModal │  (Agent 6 — JS frontend)
│   (orderId)         │
└──────────┬──────────┘
           │ 2. Mở modal HTML (Agent 4)
           │    + render skeleton timeline
           ▼
┌─────────────────────┐
│ fetchTrackingEvents │  (Agent 7)
│  - check localStorage│
│    cache (TTL 5min) │
└──────────┬──────────┘
           │ 3. Cache miss → POST tới Apps Script
           ▼
┌─────────────────────┐
│  Apps Script doPost │  (Agent 9)
│  action: fetch_     │
│  tracking_events    │
└──────────┬──────────┘
           │ 4. Phân nhánh theo carrier
           ├──────► scrapeYamatoTracking_(trackingNo)
           │         UrlFetchApp.fetch(yamato URL)
           │         parse HTML → events[]
           │
           └──────► scrapeSagawaTracking_(trackingNo)
                     UrlFetchApp.fetch(sagawa URL)
                     parse HTML → events[]
                            │
                            ▼ 5. JSON response
                     { ok: true, events: [...] }
                            │
                            ▼ 6. Cache vào localStorage
                     ┌──────────────────────┐
                     │ renderTrackingTimeline│ (Agent 5)
                     │  vẽ DOM timeline     │
                     └──────────────────────┘
                            │
                            ▼ 7. Customer thấy timeline
```

Tóm gọn: **Customer click → JS gọi Apps Script → Apps Script scrape Yamato/Sagawa → JSON events → render timeline trong modal**.

---

## 3. Trải nghiệm người dùng (User Experience)

### 3.1. Vào trang `/thanh-vien`

Khách đăng nhập, cuộn xuống tab **Đơn hàng của em**. Mỗi order card hiển thị:

- Tên đơn (ví dụ: `#0042 — Giò lụa 500g + Nem chua Thanh Hoá`)
- Trạng thái (`Đang chuẩn bị` / `Đã gửi` / `Đã nhận`)
- **Nếu đơn có `tracking_number` không rỗng** → xuất hiện 2 nút:
  - 📍 **Tình trạng vận chuyển** — mở modal (tính năng mới)
  - 🔗 **Xem trên website hãng** — mở tab mới sang Yamato/Sagawa (deep-link, dự phòng)

### 3.2. Bấm "📍 Tình trạng vận chuyển"

Modal mở, hiển thị **4 thẻ thông tin (cards)** ở phần trên:

| Card | Nội dung |
|---|---|
| **Hãng vận chuyển** | Logo + tên (Yamato Cool 宅急便 / Sagawa 飛脚宅配便) + tracking number |
| **Địa chỉ giao** | Họ tên người nhận, 〒postcode, todofuken + city + chitiết, số điện thoại |
| **Thông tin đơn** | Mã đơn `#0042`, ngày đặt, tổng tiền, phương thức thanh toán |
| **Trạng thái hiện tại** | Sự kiện mới nhất (ví dụ: `配達完了 — 14:32 ngày 01/05`) + nút 🔄 refresh |

Phía dưới là **section Timeline** — vẽ dạng dọc, mỗi sự kiện 1 chấm tròn (filled/outlined), có thời gian + địa điểm + mô tả tiếng Nhật + bản dịch tiếng Việt nếu có.

### 3.3. Refresh

Khách bấm 🔄 → JS xoá cache localStorage cho cặp `(carrier+tracking)` đó → gọi lại `fetchTrackingEvents` → vẽ lại timeline. Có spinner trong lúc fetch.

### 3.4. Đóng modal

- Click nút ✕ ở góc phải
- Click ra ngoài backdrop
- Bấm phím `Esc`

Tất cả đều gọi `closeTrackingModal()` (Agent 6) — modal đóng, scroll body khôi phục.

---

## 4. Phát hiện hãng vận chuyển (Carrier Detection)

Hàm `showTrackingModal(orderId)` phải biết đơn đó dùng Yamato hay Sagawa để render đúng logo + gọi đúng scraper. Quy tắc đọc field `order.carrier`:

```js
const carrierStr = String(order.carrier || '').toLowerCase();

if (carrierStr.includes('yamato')   ||
    carrierStr.includes('kuroneko') ||
    carrierStr.includes('クロネコ')  ||
    carrierStr.includes('宅急便')) {
  carrier = 'yamato';
}
else if (carrierStr.includes('sagawa') ||
         carrierStr.includes('飛脚')   ||
         carrierStr.includes('佐川')) {
  carrier = 'sagawa';
}
else {
  carrier = 'unknown'; // fallback → chỉ show deep-link, không scrape
}
```

**Danh sách string được nhận diện:**

- **Yamato**: `'yamato'`, `'kuroneko'`, `'クロネコ'`, `'宅急便'`
- **Sagawa**: `'sagawa'`, `'飛脚'`, `'佐川'`

Anh nhập tự do trong admin nhưng nên dùng đúng option dropdown để tránh sai (xem mục 6).

---

## 5. Cài đặt Apps Script (Apps Script Setup)

### 5.1. Sau khi deploy code mới

**Không cần config thêm gì cả.** Chỉ cần:

1. Mở Apps Script editor (`https://script.google.com/...`)
2. Dán code mới của Agent 9 (gồm `doPost` thêm action `fetch_tracking_events`, hàm `scrapeYamatoTracking_`, hàm `scrapeSagawaTracking_`)
3. Bấm **Deploy → Manage deployments → Edit → New version → Deploy**
4. Copy URL deployment (nếu thay đổi) → cập nhật vào file `js/config.js` field `APPS_SCRIPT_URL`

### 5.2. Cách scraper hoạt động

- Scraper chạy **server-side** trong Apps Script qua `UrlFetchApp.fetch(url, options)`
- Không tốn quota của khách (browser khách không gọi trực tiếp Yamato/Sagawa — vì sẽ bị CORS chặn)
- Apps Script tự gửi User-Agent giả lập trình duyệt thường để Yamato không từ chối

### 5.3. Rate limit

Apps Script mặc định cho phép **~10 fetches/giây**, **20.000 fetches/ngày** (Free tier). Với mức đơn hàng hiện tại của Bếp Thuỷ (vài chục đơn/ngày, mỗi đơn khách bấm vài lần), thừa sức dùng. Cache 5 phút (mục 7) cũng giúp giảm tải đáng kể.

### 5.4. Hạn chế đã biết (KNOWN LIMITATION)

> ⚠️ **Quan trọng:** Yamato và Sagawa thi thoảng đổi cấu trúc HTML trang tracking. Khi điều đó xảy ra, regex parse trong scraper sẽ bị vỡ → modal hiện lỗi "Không lấy được dữ liệu". Em cần anh biết cách tự fix nhanh.

#### Cách debug khi scraper vỡ

**Bước 1 — Bật log để xem HTML thực tế Yamato trả về:**

Trong Apps Script editor, mở file chứa hàm `scrapeYamatoTracking_` (hoặc `scrapeSagawaTracking_`), tìm chỗ sau khi `UrlFetchApp.fetch`, thêm dòng:

```js
Logger.log('=== HTML từ Yamato ===');
Logger.log(html.substring(0, 5000)); // log 5000 ký tự đầu
Logger.log('=== Match được mấy event? ===');
Logger.log(matches ? matches.length : 0);
```

**Bước 2 — Chạy thử với 1 mã tracking thật:**

Trong Apps Script editor, tạo hàm test:

```js
function testYamatoScrape() {
  const result = scrapeYamatoTracking_('1234-5678-9012'); // thay mã thật
  Logger.log(JSON.stringify(result, null, 2));
}
```

Bấm **Run → testYamatoScrape**. Sau đó **View → Logs (Ctrl+Enter)** để xem HTML.

**Bước 3 — Update regex:**

- Vị trí cần sửa: hàm `scrapeYamatoTracking_` (file Apps Script `Tracking.gs` hoặc `Code.gs`)
- Vị trí Sagawa: hàm `scrapeSagawaTracking_` cùng file
- Tìm các đoạn `const re = /...../g;` hoặc `html.match(/...../)` — đây là regex cần đối chiếu với HTML mới

Mỗi event trên Yamato thường có format dạng:

```html
<tr>
  <td>2026/05/01 14:32</td>
  <td>配達完了</td>
  <td>東京都 江東区</td>
</tr>
```

Regex match cần khớp 3 trường: thời gian + status + địa điểm. Anh chỉ cần tìm pattern mới rồi sửa cùng kiểu.

**Bước 4 — Save & Deploy lại** (tăng version) → reload `/thanh-vien` test lại.

---

## 6. Admin nhập carrier khi gửi hàng (Carrier Admin Entry)

Trong trang admin `/thuythang`, khi anh đánh dấu một đơn là **"Đã gửi"**, hệ thống sẽ hiển thị form nhỏ yêu cầu:

| Field | Loại input | Bắt buộc |
|---|---|---|
| **Hãng vận chuyển** | Dropdown 2 lựa chọn | ✅ |
| **Mã vận đơn (tracking number)** | Text input | ✅ |
| **Ngày gửi** | Date picker, default = hôm nay | ✅ |

**Dropdown carrier có 2 option chuẩn:**

```
[ Yamato Cool 宅急便   ]
[ Sagawa 飛脚宅配便     ]
```

Anh **luôn chọn option dropdown**, đừng tự gõ — vì regex detect ở mục 4 dựa vào keyword chuẩn. Sau khi chọn + nhập tracking number → bấm **Lưu**. Hệ thống ghi vào sheet `Orders` cột `carrier` và `tracking_number`. Lập tức từ lúc đó, modal tracking sẽ hoạt động cho đơn đó.

> 💡 **Mẹo:** Nếu anh ship hãng khác (ví dụ Japan Post 日本郵便), dropdown chưa có option → tạm thời gõ tay "Japan Post" vào, hệ thống sẽ rơi vào nhánh `unknown` → modal chỉ hiển thị deep-link chứ không scrape. Khi nào em thêm scraper Japan Post sẽ có option dropdown mới.

---

## 7. Caching (localStorage cache)

Để tránh gọi Apps Script liên tục mỗi lần khách mở modal, frontend cache kết quả vào `localStorage`:

- **Key**: `bep_tracking_cache_<carrier>_<tracking_number>`
- **Value**: JSON `{ events: [...], cached_at: 1746123456789 }`
- **TTL**: **5 phút** (300_000 ms)

### Flow:

1. Khi `fetchTrackingEvents(carrier, trackingNo)` được gọi:
   - Đọc cache → nếu có và `Date.now() - cached_at < 300000` → trả luôn từ cache (instant render)
   - Nếu không → POST Apps Script → nhận response → ghi cache → render

2. Khi khách bấm 🔄 refresh trong modal:
   - JS gọi `localStorage.removeItem('bep_tracking_cache_...')`
   - Gọi lại `fetchTrackingEvents` → bypass cache → fetch mới hoàn toàn

> 💡 Vì sao 5 phút? Yamato cập nhật trạng thái khoảng mỗi 30 phút – 1 tiếng. 5 phút là đủ tươi cho khách mà không spam server.

---

## 8. Xử lý lỗi (Error Handling)

Khi scrape fail (Yamato đổi HTML, mã tracking không tồn tại, network timeout, Apps Script error), modal **không được vỡ trắng** — phải hiển thị **Fallback UI**:

```
┌──────────────────────────────────────────┐
│  ⚠️ Không lấy được tình trạng vận chuyển  │
│                                          │
│  Có thể do:                              │
│  - Mã vận đơn chưa được hãng cập nhật    │
│  - Hãng đổi giao diện (anh Thắng đang    │
│    sửa)                                  │
│  - Mạng tạm thời gián đoạn               │
│                                          │
│  [ 🔗 Xem trên website Yamato ]          │
│  [ 🔄 Thử lại ]                          │
└──────────────────────────────────────────┘
```

Cụ thể các lỗi xử lý:

| Tình huống | Hành vi |
|---|---|
| `fetchTrackingEvents` reject | Hiện fallback UI + nút Retry |
| Apps Script trả `{ ok: false }` | Đọc `error.message`, hiện trong fallback |
| `events` trả về mảng rỗng | Hiện thông báo "Hãng chưa cập nhật trạng thái — vui lòng quay lại sau 30 phút" |
| `carrier === 'unknown'` | Skip scrape, chỉ render deep-link Google search |
| Network timeout (>10s) | Abort, hiện fallback "Mạng chậm, thử lại" |

Deep-link template:

- Yamato: `https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?number={trackingNo}`
- Sagawa: `https://k2k.sagawa-exp.co.jp/p/web/okurijoinput.do?okurijoNo={trackingNo}`

---

## 9. Hướng dẫn test (Testing Instructions)

### 9.1. Quy trình test end-to-end

1. **Chuẩn bị**: ship một đơn thật qua Yamato Conbini (hoặc nhờ một đơn đã có sẵn của khách quen) → có mã tracking 12 số dạng `1234-5678-9012`
2. **Verify mã tracking trên web Yamato trước**: mở `https://toi.kuronekoyamato.co.jp/cgi-bin/tneko`, nhập mã, **bấm chắc chắn nhìn thấy ít nhất 1 event** (ví dụ "荷物受付")
3. **Vào admin `/thuythang`**: tìm đơn đó, đánh dấu "Đã gửi", chọn carrier = `Yamato Cool 宅急便`, dán tracking → Lưu
4. **Mở `/thanh-vien` bằng tài khoản khách đó** → tìm order card → bấm 📍 Tình trạng vận chuyển
5. **Kỳ vọng**:
   - Modal mở trong < 500ms
   - 4 cards thông tin hiển thị đúng
   - Skeleton timeline trong ~1-3 giây
   - Sau đó timeline xuất hiện với ít nhất 1 event giống như anh thấy trên web Yamato
6. **Test refresh**: bấm 🔄 → spinner → load lại đúng dữ liệu
7. **Test fallback**: vào DevTools → Network → set Offline → bấm 🔄 → phải thấy Fallback UI có deep-link + Retry

### 9.2. Test nhanh từ console DevTools

Mở `/thanh-vien`, F12 → Console:

```js
// Mở modal cho đơn #0042 (giả định đã có tracking)
showTrackingModal('0042');

// Force refresh không qua cache
localStorage.removeItem('bep_tracking_cache_yamato_1234567890');
showTrackingModal('0042');

// Test gọi trực tiếp fetch
fetchTrackingEvents('yamato', '1234-5678-9012').then(console.log);
```

### 9.3. Test scraper riêng trong Apps Script

Trong Apps Script editor:

```js
function testFullPipeline() {
  // Test Yamato
  const yamato = scrapeYamatoTracking_('1234-5678-9012');
  Logger.log('Yamato result:');
  Logger.log(JSON.stringify(yamato, null, 2));

  // Test Sagawa
  const sagawa = scrapeSagawaTracking_('111122223333');
  Logger.log('Sagawa result:');
  Logger.log(JSON.stringify(sagawa, null, 2));
}
```

---

## 10. Cải tiến tương lai (Future Improvements)

Em ghi sẵn 5 ý để anh và em làm lần sau khi rảnh:

- 🔔 **Notify khách khi trạng thái đổi**: cron Apps Script chạy mỗi 30 phút, so sánh event mới nhất với lần cache trước, nếu thay đổi → gửi email tự động "Đơn #0042 của em đã đến trung tâm Tokyo, dự kiến giao chiều mai"
- 📦 **Hỗ trợ thêm hãng**: Japan Post 日本郵便 (`https://trackings.post.japanpost.jp`), Seino 西濃運輸, Fukutsu 福山通運 — mỗi hãng thêm 1 hàm `scrape<Carrier>Tracking_` + thêm option dropdown ở admin
- ⚡ **Pre-cache hằng ngày**: cron Apps Script chạy 2-3 lần/ngày, fetch trước cho tất cả đơn `Đã gửi` chưa `Đã nhận`, ghi vào sheet `TrackingCache` → khách mở modal load từ sheet (instant), khỏi chờ scrape
- 🇻🇳 **Dịch tự động status sang tiếng Việt**: xây bảng map (`配達完了` → "Đã giao thành công", `配達中` → "Đang giao", `荷物受付` → "Đã nhận hàng từ shop", …) áp dụng trong `renderTrackingTimeline`
- 🗺️ **Map giao hàng**: hiển thị marker trên Google Maps cho mỗi event có địa điểm (東京都 → toạ độ Tokyo) để khách thấy trực quan đường đi của đơn

---

> 📝 **Ghi chú cuối:**
> - File này em viết ngày 2026-05-02, sau khi 9 agent song song hoàn tất build feature.
> - Khi Yamato/Sagawa đổi HTML lần tới, anh chỉ cần làm theo mục 5.4 — em đã viết sẵn các bước copy-paste-able.
> - Nếu có lỗi gì không nằm trong tài liệu này, anh nhắn em hoặc xem trong Apps Script Logs trước.

— em.
