# 📊 Setup Google Tag Manager + GA4 cho Bếp Thuỷ Japan

GTM container `GTM-MN5QPB6G` đã được cài vào **7 trang khách**:
- index.html
- thanh-vien.html
- huong-dan-thanh-vien.html
- huong-dan-thanh-toan.html
- huong-dan-bao-quan.html
- bang-phi-ship.html
- privacy.html

(Skip admin `/thuythang` để không nhiễm analytics)

---

## ✅ Bước 1: Verify GTM đã chạy

Sau khi Vercel deploy (~2 phút):

1. Mở https://www.thuyjapan.com (incognito để tránh cache)
2. Mở **DevTools** (F12) → tab **Network** → filter `gtm`
3. Phải thấy request `gtm.js?id=GTM-MN5QPB6G` với status 200

Hoặc dùng **GTM Preview Mode** (tốt nhất):
1. Vào https://tagmanager.google.com → container `GTM-MN5QPB6G`
2. Bấm nút **Preview** góc trên phải
3. Nhập URL `https://www.thuyjapan.com` → Connect
4. Tab Tag Assistant mở ra với debug panel — anh có thể thấy mọi event được fire

---

## ✅ Bước 2: Setup GA4 Configuration tag trong GTM

GTM chưa biết phải gửi data đi đâu. Anh cần cấu hình 1 tag GA4:

1. https://tagmanager.google.com → container `GTM-MN5QPB6G`
2. Sidebar trái → **Tags** → **New**
3. Tag Configuration:
   - Tag Type: **Google Analytics: GA4 Configuration**
   - Measurement ID: `G-VT9TKWT1YV`
   - Tick **Send a page view event when this configuration loads**
4. Triggering: chọn **All Pages**
5. Đặt tên tag: `GA4 - Configuration`
6. **Save**

Bấm **Submit** (góc trên phải) → đặt version name "Initial GA4 setup" → **Publish**.

→ Sau đó pageview tự gửi cho mọi visit. Check trong GA4 → **Realtime** trong vài phút.

---

## ✅ Bước 3: Setup GA4 Event tags (e-commerce)

Em đã wire 4 events vào dataLayer. Anh cần tạo 4 tag event tương ứng trong GTM:

### Event 1: `add_to_cart` (khi khách thêm vào giỏ)

1. Tags → **New** → Tag Configuration: **GA4 Event**
2. Configuration Tag: chọn `GA4 - Configuration` ở Bước 2
3. Event Name: `add_to_cart`
4. Event Parameters (More Settings → Event Parameters):
   - `currency` → `{{DLV - currency}}`
   - `value` → `{{DLV - value}}`
   - `items` → `{{DLV - items}}`
5. Triggering: tạo **New Trigger**
   - Type: **Custom Event**
   - Event name: `add_to_cart`
   - Save trigger
6. Save tag, đặt tên `GA4 - add_to_cart`

→ Trước đó cần tạo 3 **Variables** kiểu **Data Layer Variable** với tên `currency`, `value`, `items` (Variables → New → DLV).

### Event 2-4: làm tương tự cho:
- `purchase` — params: `transaction_id`, `currency`, `value`, `shipping`, `items`
- `sign_up` — param: `method`
- `login` — param: `method`

→ Submit + Publish container.

---

## 📊 Bước 4: Kiểm tra trong GA4

Sau setup ~10-30 phút, vào https://analytics.google.com → property `thuyjapan.com`:

- **Realtime** → user count, current page, events
- **Reports → Engagement → Events** → `add_to_cart`, `purchase`, `sign_up`, `login` xuất hiện
- **Reports → Monetization → Ecommerce purchases** → revenue + product list (nếu purchase event đúng)

---

## 💡 Bonus: Add Facebook Pixel sau này

Khi anh chạy quảng cáo Facebook:

1. Tạo Meta Pixel tại https://business.facebook.com → Events Manager → Create Pixel → copy Pixel ID
2. Trong GTM:
   - Tags → New → Tag Type: **Facebook Pixel** (cài community template từ template gallery nếu chưa có)
   - Pixel ID: paste vào
   - Trigger: All Pages
   - Save + Publish

→ Không cần đụng code thuyjapan.com! GTM lo hết.

---

## 🛠 Nếu cần test events tự fire

Trong console browser (DevTools), gõ:
```js
window.btTrack('test_event', { foo: 'bar', value: 100 });
```

Sẽ push vào `dataLayer` và GTM Preview Mode sẽ thấy.

---

## ⚠️ Lưu ý

- GTM script **bỏ qua localhost** + **bỏ qua admin /thuythang** để giữ analytics sạch
- Nếu test trên live site, dùng incognito/private mode để tránh cache + tránh adblocker
- Adblocker (uBlock, Brave) có thể chặn GTM. Kiểm tra trong môi trường thường

Anh setup xong báo em verify cùng nhé!
