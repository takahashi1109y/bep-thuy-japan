# 📊 Setup GTM Dashboard cho Bếp Thuỷ Japan

GTM container `GTM-MN5QPB6G` đã được cài. Anh cần config 3 pixels qua dashboard:

- 🟢 GA4 (`G-VT9TKWT1YV`) — analytics chính
- 📘 Meta Pixel (`934052532836859`) — Facebook/Instagram ads
- 🎵 TikTok Pixel (`D7NB5O3C77U44OJIM0H0`) — TikTok ads

## 📐 Lộ trình tổng quát

| Bước | Việc | Thời gian |
|---|---|---|
| 1 | Tạo 6 Data Layer Variables | 5 phút |
| 2 | Tạo 4 Custom Event Triggers | 5 phút |
| 3 | Tạo GA4 Configuration tag + 4 GA4 Event tags | 10 phút |
| 4 | Tạo Meta Pixel base + 4 event tags | 10 phút |
| 5 | Tạo TikTok Pixel base + 4 event tags | 10 phút |
| 6 | Submit + Publish | 1 phút |

**Tổng ~40 phút** một lần. Sau này thêm pixel mới = 5 phút.

---

## 🔧 Bước 1: Tạo 6 Data Layer Variables

Em đã wire 4 events vào dataLayer với các params:

| Event | Params |
|---|---|
| `add_to_cart` | currency, value, items |
| `purchase` | transaction_id, currency, value, shipping, items |
| `sign_up` | method |
| `login` | method |

Anh cần tạo Variable cho mỗi param để GTM đọc được.

### Cách tạo:

1. Sidebar trái GTM → **Variables**
2. Scroll xuống **User-Defined Variables** → **New**
3. Click vào ô **Variable Configuration** → list xổ ra → chọn **"Data Layer Variable"**
4. Trong field **"Data Layer Variable Name"**, gõ tên param (case-sensitive)
5. Trên top đổi tên Variable thành: **`DLV - <tên param>`**
6. **Save**

### Tạo 6 variables (lặp lại bước 2-6):

| Data Layer Variable Name | Variable Name |
|---|---|
| `currency` | `DLV - currency` |
| `value` | `DLV - value` |
| `items` | `DLV - items` |
| `transaction_id` | `DLV - transaction_id` |
| `shipping` | `DLV - shipping` |
| `method` | `DLV - method` |

---

## 🔧 Bước 2: Tạo 4 Custom Event Triggers

1. Sidebar trái → **Triggers** → **New**
2. Click ô **Trigger Configuration** → chọn **"Custom Event"**
3. Field **Event name** gõ: `add_to_cart` (chính xác chữ thường, có dấu _)
4. Trên top đổi tên Trigger: **`Custom - add_to_cart`**
5. **Save**

### Lặp lại cho 3 triggers nữa:
- Event name: `purchase` → tên `Custom - purchase`
- Event name: `sign_up` → tên `Custom - sign_up`
- Event name: `login` → tên `Custom - login`

---

## 🔧 Bước 3: GA4 — Configuration tag + 4 Event tags

### 3.1 GA4 Configuration tag

1. Sidebar trái → **Tags** → **New**
2. Click **Tag Configuration** → chọn **"Google Tag"** (icon chữ G xanh)
3. **Tag ID**: paste `G-VT9TKWT1YV`
4. Scroll xuống **Triggering** → click **+** → chọn **"All Pages"** (Page View)
5. Trên top đổi tên: **`GA4 - Configuration`**
6. **Save**

### 3.2 GA4 Event tags (4 cái)

#### Tag: GA4 - add_to_cart
1. Tags → New
2. Tag Configuration → **Google Analytics** → **Google Analytics: GA4 Event**
3. **Configuration Tag** dropdown → chọn `GA4 - Configuration`
4. **Event Name** → gõ `add_to_cart`
5. Click **Event Parameters** → **Add Row** 3 lần:

| Parameter Name | Value |
|---|---|
| `currency` | `{{DLV - currency}}` |
| `value` | `{{DLV - value}}` |
| `items` | `{{DLV - items}}` |

> 💡 Để paste `{{DLV - currency}}`: click icon viên gạch lego cạnh ô Value → list variables → chọn `DLV - currency`

6. **Triggering** → **+** → chọn `Custom - add_to_cart` (đã tạo ở Bước 2)
7. Đổi tên tag: **`GA4 - add_to_cart`**
8. **Save**

#### Tag: GA4 - purchase
Lặp lại với:
- Event Name: `purchase`
- 5 Parameters:

| Name | Value |
|---|---|
| `transaction_id` | `{{DLV - transaction_id}}` |
| `currency` | `{{DLV - currency}}` |
| `value` | `{{DLV - value}}` |
| `shipping` | `{{DLV - shipping}}` |
| `items` | `{{DLV - items}}` |

- Trigger: `Custom - purchase`
- Tên tag: `GA4 - purchase`

#### Tag: GA4 - sign_up
- Event Name: `sign_up`
- 1 Parameter: `method` → `{{DLV - method}}`
- Trigger: `Custom - sign_up`
- Tên tag: `GA4 - sign_up`

#### Tag: GA4 - login
- Event Name: `login`
- 1 Parameter: `method` → `{{DLV - method}}`
- Trigger: `Custom - login`
- Tên tag: `GA4 - login`

---

## 🔧 Bước 4: Meta (Facebook) Pixel

### 4.1 Cài template Meta Pixel từ Community Gallery

GTM không có sẵn tag template cho Meta Pixel — cần install:

1. Tags → New → Tag Configuration → **Discover more tag types in the Community Template Gallery**
2. Search **"Facebook Pixel"** → chọn template của **Simo Ahava** hoặc **Stape** (đáng tin)
3. Click **Add to workspace** → **Add**

### 4.2 Meta Pixel Base tag (PageView)

1. Tags → New
2. Tag Configuration → chọn template **Facebook Pixel** (vừa add)
3. **Pixel ID**: paste `934052532836859`
4. **Event Name**: chọn từ dropdown → **`PageView`** (hoặc Standard event = PageView)
5. Triggering: chọn **All Pages**
6. Tên tag: `Meta - PageView`
7. **Save**

### 4.3 Meta Event tags (4 cái)

Tương tự GA4 Events, mỗi event 1 tag:

| Tag Name | Event | Parameters |
|---|---|---|
| `Meta - AddToCart` | `AddToCart` | `value` = `{{DLV - value}}`, `currency` = `{{DLV - currency}}` |
| `Meta - Purchase` | `Purchase` | `value`, `currency`, `content_ids` (custom mapping) |
| `Meta - CompleteRegistration` | `CompleteRegistration` | (none required) |
| `Meta - Login` | (Custom Event)`Login` | (optional) |

Trigger: tương ứng `Custom - add_to_cart`, `Custom - purchase`, `Custom - sign_up`, `Custom - login`

> ⚠️ Meta dùng tên event chuẩn `AddToCart`, `Purchase`, `CompleteRegistration` (camelCase). Khác với GA4 dùng `add_to_cart`, `purchase`, `sign_up` (snake_case). Đừng nhầm.

---

## 🔧 Bước 5: TikTok Pixel

### 5.1 Cài template TikTok Pixel

1. Tags → New → Discover more tag types in the Community Template Gallery
2. Search **"TikTok"** → chọn template **TikTok Pixel** chính thức (do TikTok publish)
3. Add to workspace

### 5.2 TikTok Pixel Base tag

1. Tags → New
2. Tag Configuration → **TikTok Pixel** template
3. **Pixel ID**: paste `D7NB5O3C77U44OJIM0H0`
4. **Event**: `Page View`
5. Triggering: All Pages
6. Tên tag: `TikTok - PageView`
7. **Save**

### 5.3 TikTok Event tags (4 cái)

| Tag Name | TikTok Event | Trigger |
|---|---|---|
| `TikTok - AddToCart` | `AddToCart` | `Custom - add_to_cart` |
| `TikTok - CompletePayment` | `CompletePayment` | `Custom - purchase` |
| `TikTok - CompleteRegistration` | `CompleteRegistration` | `Custom - sign_up` |
| `TikTok - Login` | (Custom) `Login` | `Custom - login` |

> ⚠️ TikTok purchase event là `CompletePayment` (không phải `Purchase`). Khác với Meta.

---

## 🚀 Bước 6: Submit + Publish

1. Bấm **Submit** (góc trên phải, màu xanh)
2. **Version Name**: `Initial setup — GA4 + Meta + TikTok`
3. **Version Description** (optional): `4 events on each platform`
4. Bấm **Publish**

→ Done! GTM bắt đầu fire 3 platforms cùng lúc.

---

## ✅ Verify từng pixel

### GA4
- https://analytics.google.com → property thuyjapan.com → **Realtime**
- Mở thuyjapan.com (incognito) → mua 1 món test
- Sẽ thấy events `page_view`, `add_to_cart`, `purchase`...

### Meta Pixel
- https://business.facebook.com → Events Manager → pixel `934052532836859`
- Tab **Test Events** → nhập URL `https://www.thuyjapan.com` → **Open Website**
- Thực hiện hành động → realtime event xuất hiện

### TikTok Pixel
- https://ads.tiktok.com → Assets → Events → pixel
- Tab **Test Events** → tương tự Meta

---

## 🛠 GTM Preview Mode (debug rất tiện)

Khi setup xong nhưng chưa Publish, có thể test trước:

1. GTM workspace → bấm **Preview** (góc trên)
2. Nhập URL `https://www.thuyjapan.com` → **Connect**
3. Tab Tag Assistant mở → debug panel cho phép:
   - Click qua các trang → xem tag nào fired
   - Xem dataLayer values
   - Xem variable values

Khi confirm OK → bấm **Submit + Publish** chính thức.

---

## ⚠️ Lưu ý quan trọng

- Sau khi config GTM, KHÔNG xoá file `/assets/gtm.js` — nó load GTM container
- Gtm.js skip localhost + admin /thuythang để analytics không bị nhiễm
- Adblocker (uBlock, Brave Shield) sẽ chặn pixels — test trên Chrome thường + incognito
- Pixel data cần 24-48h để hiện đầy đủ trong báo cáo (Realtime có ngay nhưng Reports lag)

---

## 💡 Sau này thêm pixel mới (Pinterest, LinkedIn, X...)

Quá đơn giản:
1. Lấy Pixel ID từ platform mới
2. GTM Tags → New → search template platform đó
3. Paste Pixel ID + chọn triggers tương ứng
4. Submit + Publish

→ Không đụng code thuyjapan.com lần nào! Đây là sức mạnh GTM.

Anh setup tới đâu vướng báo em — em hướng dẫn lại bước đó.
