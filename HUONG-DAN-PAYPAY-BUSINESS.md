# 💴 Hướng Dẫn PayPay for Business — Bếp Thuỷ Japan

> Research date: 2026-04-29
> Mục đích: tự động hoá xác minh thanh toán 100%, bullet-proof vs Photoshop fraud
> Status hiện tại: AI Vision OCR 8-layer (~95% accuracy, vẫn có rủi ro)
> Mục tiêu sau khi đổi: 100% accurate, real-time webhook, 0 dispute

---

## 📊 TÓM TẮT NHANH (đọc 1 phút)

**2 đường để add PayPay vào thuyjapan.com:**

| | **PayPay for Developers** ⭐ EM RECOMMEND | **Decision Agent (代行)** |
|---|---|---|
| Phí giao dịch | **3.8%** (物販 — Bếp Thuỷ thuộc loại này) | 1.98%-3.5% tuỳ agent |
| Phí setup | ¥0 | Có thể có (¥10k-50k) |
| Phí tháng | ¥0 | ¥0-¥3,000 |
| Tự code | Em làm (~3-5 ngày) | Họ tích hợp sẵn nhưng tốn ¥ |
| Approval | 3-5 ngày | 1-3 tuần |
| Linh hoạt | Cao — tự control flow | Thấp — phải theo template |

**Em recommend PayPay for Developers** vì:
1. Phí 3.8% chấp nhận được cho scale anh
2. Không qua trung gian → tốc độ + linh hoạt
3. Em có sẵn infra (Supabase + Apps Script) để tích hợp
4. Sandbox đầy đủ → test trước khi go-live

---

## 💰 PHÂN TÍCH CHI PHÍ (cho scale Bếp Thuỷ)

### Hiện tại
- Phí: ¥0
- Thời gian admin verify: ~5h/tuần (thủ công + spot-check AI)
- Rủi ro fraud: ~2-5% đơn (¥925 × 2-5% × 200 đơn = ¥3,700-9,250 mất/đợt)
- Disputes/khiếu nại: chiếm thời gian hỗ trợ khách

### Với PayPay 3.8%

Tính theo mục tiêu **800 đơn/tháng × ¥3,000 trung bình = ¥2,400,000 doanh thu/tháng**:

| | Số tiền |
|---|---|
| Phí giao dịch | ¥2,400,000 × 3.8% = **¥91,200/tháng** |
| Tiết kiệm thời gian admin | ~20h/tháng × ¥3,000/h = ¥60,000/tháng giá trị |
| Giảm fraud + dispute | ~¥40,000/tháng |
| **Net cost** | **~−¥9,000/tháng** (gần break-even) |

→ Tính cả "value of time" và giảm rủi ro, **PayPay gần như free**, mà UX cho khách + admin tốt hơn rất nhiều.

### Khi scale lên ¥5M/tháng
- Phí 3.8% = ¥190,000/tháng
- Lúc này có thể đàm phán xuống 2.5-3% qua decision agent (Epsilon, KOMOJU)
- Hoặc apply MyStore Lite Plan: ¥1,980/tháng + 1.6% rate

---

## ✅ ELIGIBILITY CHECK (UPDATED 2026-04-30 — UPDATE 定款 RECOMMENDED)

**Critical context**: Anh đang **GỘP báo cáo thuế và doanh thu** của Bếp Thuỷ vào 愛ビュティージャパン株式会社. Đây là cơ sở để decide path.

**Decision 2026-04-30**: Update 定款 thay vì đăng ký 個人事業主 mới.

### Tại sao KHÔNG đi 個人事業主 path nữa:
- Doanh thu Bếp Thuỷ đã chảy qua 法人 → tách ra sẽ phức tạp accounting
- Khai thuế phải làm 2 lần (法人 + 個人 確定申告)
- Income shift từ 法人 → 個人 có thể trigger 税務署 audit ("tax avoidance" suspicion)
- Mâu thuẫn với reality of operations

### Path đúng = Update 定款 của 法人 hiện tại

Add vào 事業目的:
```
食品（加工食肉品を含む）の販売及び通信販売
飲食料品の輸入及び販売
前各号に附帯又は関連する一切の業務
```

→ 法人 sẽ cover cả TPCN, cosmetic, clothing, **food (Bếp Thuỷ giò chả)**.

### Cost / Time
- ¥30,000 登録免許税 + ¥450 印鑑証明 + (optional) ¥10k 公証役場
- 1-2 tuần ở 法務局
- Sau đó apply PayPay với 履歴事項全部証明書 mới (~3-5 ngày approval cao 95%+)
- Multi-store registration với PayPay: 1 account, 2+ stores (aibeauty-supplement.jp + thuyjapan.com)

### TPCN business (separate concept anh đề cập)
Anh có hỏi về TPCN business — nếu anh launch trang TPCN mới song song:
- 健康食品 đã có sẵn trong 定款 → apply PayPay rất dễ
- Em recommend kết hợp: update 定款 thêm "食品" → cover cả TPCN + Bếp Thuỷ → 1 PayPay merchant account, 2 stores

### Business model chính xác (UPDATED 2026-04-29)

```
Manufacturer ở Nhật (handmade) → giò chả pate đóng gói sẵn → Anh nhập wholesale → Bếp Thuỷ Japan bán EC
```

- Anh là **DISTRIBUTOR / RESELLER trong nước Nhật**, KHÔNG phải importer (không bring food across border)
- Sản phẩm sản xuất bởi 1 đơn vị thủ công ở Nhật (anh nhập wholesale từ họ)
- Business type: **食品の販売業（容器包装に入れられた食品の販売）** hoặc **加工食品の小売**
- Channel: 通信販売 (EC qua thuyjapan.com)
- KHÔNG phải 自社製造 → không cần 製造業 営業許可
- KHÔNG phải 輸入 → không cần 食品輸入届出

| Yêu cầu | Anh có? |
|---|---|
| 法人登記 (corporation registration) | ✅ Có từ 4/2019 |
| 履歴事項全部証明書 / 印鑑証明書 | ✅ Lấy ở 法務局 (¥600 + ¥450) |
| 定款 với 事業目的 bao gồm "食品の販売" | ⏳ **Anh cần CONFIRM** |
| 法人口座 (corporate bank account) | ⏳ **Anh cần CONFIRM** |
| 代表者本人確認書類 | ✅ Có (在留カード / 免許証) |
| Website hoạt động | ✅ thuyjapan.com |

### ⚠️ 2 BLOCKER POTENTIAL CẦN CHECK

**Blocker #1: Tên công ty "愛ビュティージャパン" gợi ý Beauty, nhưng kinh doanh thực tế là Food.**

PayPay audit check 定款 → cần 事業目的 bao gồm:
- 食品の販売
- 飲食料品の輸入及び販売
- 加工食品の製造及び販売
- 食料品の通信販売
- (hoặc 前各号に附帯する一切の業務 — catch-all)

→ Nếu không có → 2 options:
- **A**: Update 定款 (¥30k + ~1 tuần ở 法務局)
- **B**: Đăng ký 個人事業主 mới với 屋号 "Bếp Thuỷ Japan" → apply PayPay tên cá nhân (free, ~30 phút)

**Blocker #2: 法人口座 — PayPay chỉ chuyển tiền vào 法人 account.**

→ 法人 (Ai Beauty) cần có corporate bank account. Yucho 2168488 hiện tại có phải 法人 account hay không?

---

## ⚠️ LICENSE THỰC PHẨM (UPDATED 2026-04-29 — đơn giản hơn nhiều)

Vì anh là **distributor nội địa** (không import + không sản xuất + không repackage), license requirement đơn giản theo **改正食品衛生法 2021**:

| License | Anh có cần? | Lý do |
|---|---|---|
| 食品輸入届出 | ❌ KHÔNG | Không import |
| 食品衛生責任者 | ❌ KHÔNG | Chỉ resell food đóng gói sẵn — không sản xuất / không repackage |
| 食品衛生法 営業許可（食肉販売業）| ❌ KHÔNG | Bán 食肉加工品 (processed) đã đóng gói, không bán raw meat |
| 食品衛生法 製造業 営業許可 | ❌ KHÔNG | Không sản xuất |
| **食品衛生法 営業届出** (notification) | ⚠️ **CÓ — bắt buộc** | Bán food 要冷蔵/要冷凍 qua EC trong nước |

### 営業届出 = notification, KHÔNG phải permit

| 営業許可 (permit, không cần) | 営業届出 (notification, anh CẦN) |
|---|---|
| Phải kiểm tra shop physical | Chỉ điền form |
| Cần 食品衛生責任者 | KHÔNG cần |
| ¥16,000-21,000 phí | **Free** |
| 2-4 tuần | **30 phút - 1 ngày** |

→ Anh đến 保健所 quận, điền **営業届出書** với 業種 "食品の販売業（容器包装に入れられた食品の販売）" — xong.

### ⚠️ Anh PHẢI confirm 2 điều với 保健所

1. **Loại sản phẩm**: giò/chả/mọc/pate/nem lụi đều là 食肉加工品 — một số quận có thể yêu cầu **食肉販売業届出** riêng (vẫn là notification, không phải permit). Hỏi 保健所 cho chắc.

2. **Repackage check**: nếu anh nhập wholesale (vd 5kg/hộp lớn) rồi **CHIA NHỎ** thành 0.5kg / 1kg trước khi ship cho khách → đó là 小分け作業 → cần 食品衛生責任者 + 営業許可. **Anh có chia nhỏ không?**

3. **Manufacturer license**: anh nên xin **copy 営業許可証** của manufacturer (đơn vị thủ công ở Nhật làm cho anh). Nếu họ chưa có 食肉製品製造業 営業許可 mà sản xuất → anh resell sẽ liên đới rủi ro pháp lý. Best practice: trao đổi license trong contract.

### 📞 Cách đơn giản nhất: gọi 保健所 quận anh

Free, 10 phút. Hỏi:
> "ベトナム加工食肉食品（手作りハム・ソーセージ等）を国内製造者から仕入れ、ECサイトで販売したい。営業届出の業種コードは何ですか？小分け作業がない場合、食品衛生責任者は不要でしょうか？"

→ Họ trả lời chính xác cho khu vực anh.

→ Việc này không block PayPay application nhưng anh nên làm song song để compliance.

---

## 📋 DOCUMENT CHECKLIST cho 個人事業主 (RECOMMENDED)

Sau khi đăng ký 開業届 → chuẩn bị các giấy tờ này cho PayPay:

| # | Giấy tờ | Lấy ở đâu | Phí |
|---|---|---|---|
| 1 | **開業届控え** (bản đóng dấu sau khi nộp 税務署) | Có sẵn sau bước đăng ký | Free |
| 2 | **本人確認書類** (在留カード / マイナンバーカード / 運転免許証) | Anh có sẵn | Free |
| 3 | **マイナンバー** (12 chữ số) | Có trong 通知カード hoặc マイナンバーカード | Free |
| 4 | **入金先口座情報** (Yucho 2168488 cá nhân) | Anh có sẵn | Free |

→ **Tổng phí giấy tờ: ¥0**. Tốc độ: 30 phút - 1 ngày.

---

## 📋 DOCUMENT CHECKLIST cho 法人 (NẾU anh chọn update 定款)

Chuẩn bị sẵn các giấy tờ này trước khi apply:

### Bắt buộc cho 法人 (corporation)

| # | Giấy tờ | Lấy ở đâu | Phí | Validity |
|---|---|---|---|---|
| 1 | **履歴事項全部証明書** (登記簿謄本 — corporate registry extract) | 法務局 | ¥600/bản | 3 tháng kể từ ngày cấp |
| 2 | **印鑑証明書** (法人 — corporate seal certificate) | 法務局 | ¥450/bản | 3 tháng kể từ ngày cấp |
| 3 | **定款** (articles of incorporation) | Bản gốc/copy lúc thành lập | Free | — |
| 4 | **代表者本人確認書類** (1 trong: 運転免許証, マイナンバー, 在留カード, パスポート) | Anh có sẵn | Free | — |
| 5 | **法人口座情報** (corporate bank account in name of 愛ビュティージャパン株式会社) | Bank book / online banking screenshot | Free | — |

### Tip cho anh đi 法務局

- Lấy **2 bản** mỗi loại (1 cho PayPay, 1 dự phòng) — chỉ tốn thêm ¥600+450 = ¥1,050
- Online cũng được: https://www.touki.or.jp/ (登記情報提供サービス) nhưng phí cao hơn 1 chút và không phải bản gốc
- Đi sớm sáng: ít người, lấy nhanh

### Optional (nhưng nên có)
- Website screenshot (thuyjapan.com homepage + product page) — chứng minh business hoạt động
- **特定商取引法 page** trên thuyjapan.com — bắt buộc cho EC site Nhật (anh chưa có → em sẽ tạo trong Phase integration)
- Privacy Policy — anh có rồi tại `/privacy`
- Terms of Service — anh chưa có → em tạo cùng 特商法 page

---

## 🚶 CLICK-BY-CLICK ĐĂNG KÝ (cho anh)

### Bước 1: Mở trang đăng ký Online Payment

Click hoặc copy link:
```
https://paypay.ne.jp/store-online/
```

### Bước 2: Chọn "オンライン決済を導入する"

Trên trang chủ → tìm nút **"申し込む"** hoặc **"オンライン決済を導入する"** → click.

### Bước 3: Chọn loại EC

Hỏi: "貴社サイトの形態を教えてください" → chọn:
- **自社EC（独自開発）** ← Bếp Thuỷ thuộc loại này (tự dev với PayPay for Developers)

(Không chọn Shopify/BASE/Stores vì anh dùng Vercel + custom code)

### Bước 4: Điền thông tin (個人事業主 path — RECOMMENDED 2026-04-29)

Sau khi 開業届 đăng ký 個人事業主 "Bếp Thuỷ Japan":

| Field | Giá trị |
|---|---|
| 事業者形態 | **個人事業主** |
| 屋号 | **Bếp Thuỷ Japan** |
| 代表者氏名 | タカハラ ケイイチロウ |
| 代表者生年月日 | (ngày sinh anh) |
| 業種 | **食品の販売業（通信販売・加工食品の小売）** |
| 事業内容 | ベトナム風加工食品（ハム・ソーセージ・パテ・ネムルイ等）の小売販売。製品は国内の手作り製造者から仕入れ、ECサイト（thuyjapan.com）にて販売。容器包装済み食品の販売のみ。 |
| Website URL | https://www.thuyjapan.com |
| 電話番号 | 080-5115-6688 |
| Email | thanghoang1109@gmail.com |
| 住所 | (địa chỉ ở Nhật của anh) |
| 入金先口座 | ゆうちょ銀行 二〇八店 普通 2168488 タカハラ ケイイチロウ |

### ⚠️ Lưu ý quan trọng cho 業務内容

Phải mô tả **TRUTHFULLY** rằng:
- Mặt hàng = ベトナム加工食品 (processed Vietnamese food)
- Hình thức = 輸入販売 (import + sell), KHÔNG phải 自社製造 (in-house manufacture)
- Channel = ECサイト (e-commerce)
- Production = 委託加工 (outsourced to Vietnam factory)

Tránh dùng từ "手作り" (handmade) trên application với PayPay vì có thể hiểu nhầm anh là 製造業 → kéo theo audit về 食品衛生法 営業許可 製造 — anh không có. Nói rõ là 輸入販売 thì không cần 製造業 license.

### Bước 5: Upload giấy tờ

Upload các file đã chuẩn bị ở phần Document Checklist.

### Bước 6: Submit

Bấm **送信 / Submit**. Sẽ hiện trang "申し込み完了".

### Bước 7: Đợi email từ PayPay (3-5 ngày)

PayPay sẽ gửi email với:
- Kết quả audit
- Login vào PayPay for Business dashboard
- API credentials (API Key + Secret)
- Merchant ID

→ **Báo em ngay** khi nhận được credentials, em wire integration trong 3-5 ngày.

---

## 🛠 TECHNICAL INTEGRATION SPEC (em làm sau khi anh có credentials)

### Architecture

```
Customer → thuyjapan.com → Apps Script /paypay_create_code
                                     ↓
                           PayPay Web Cashier API
                                     ↓
                           Returns QR code + redirect URL
                                     ↓
Customer scans/clicks → PayPay app → Pays → PayPay Server
                                     ↓
                           Webhook to Apps Script
                                     ↓
                           Auto-create order with status='paid'
```

### Files to change

| File | Changes |
|---|---|
| `google-apps-script.js` | Add `paypay_create_code` doPost handler. Add `paypay_webhook` handler (verify HMAC, update order status). Store API_KEY + API_SECRET + MERCHANT_ID in Script Properties. |
| `index.html` | Replace upload-receipt UI with "Pay with PayPay" button → redirect to PayPay or show QR. Replace `verify_then_create_order` with `paypay_create_code`. |
| `supabase-paypay.sql` (new) | Add `paypay_payments` table tracking merchantPaymentId → order_no. Add columns to orders table for `paypay_merchant_payment_id`, `paypay_status`. |
| `vercel.json` | Add `apigw.paypay.ne.jp` to CSP `connect-src`. |

### API Flow (theo PayPay Web Cashier docs)

**1. Create Code** (sau khi khách điền form):
```
POST https://apigw.paypay.ne.jp/v2/codes
Headers:
  Authorization: HMAC SHA256 sign with API_SECRET
  X-ASSUME-MERCHANT: <MERCHANT_ID>
Body:
{
  "merchantPaymentId": "BEPTHUY-{orderNo}-{ts}",
  "amount": { "amount": 925, "currency": "JPY" },
  "codeType": "ORDER_QR",
  "orderDescription": "Bếp Thuỷ Japan - Đơn #0001",
  "redirectUrl": "https://www.thuyjapan.com/payment-complete?id={orderNo}",
  "redirectType": "WEB_LINK"
}
```

Response: `{ codeId, url, deeplink, expiryDate, ... }` → frontend hiện QR hoặc redirect tới `url`.

**2. Webhook khi khách thanh toán** (PayPay POST tới Apps Script):
```json
{
  "notification_type": "Transaction",
  "merchant_id": "...",
  "order_id": "BEPTHUY-0001-...",
  "state": "COMPLETED",
  "paid_at": "2026-04-29T13:35:29Z",
  "order_amount": "925"
}
```

→ Apps Script: verify HMAC signature → match `order_id` với pending order → mark `status='customer_paid'` → trigger sản xuất.

**3. Polling fallback** (nếu webhook fail):
```
GET https://apigw.paypay.ne.jp/v2/codes/payments/BEPTHUY-0001-...
```
Frontend poll mỗi 2-3s sau khi user redirect.

### Migration plan

**Phase 1 (week 3 sau approval)**: Em integrate PayPay alongside existing AI verify
- Customer thấy 2 lựa chọn: "Pay with PayPay" (mới) hoặc "Bank transfer + upload bill" (cũ)
- Default: PayPay (recommended)
- Bank transfer: dành cho khách không có PayPay

**Phase 2 (week 4-5)**: Monitor metrics
- % khách dùng PayPay vs bank
- Conversion rate so với trước
- Tỷ lệ failed verify

**Phase 3 (sau 4-6 tuần data)**: Decide
- Nếu PayPay >80% khách dùng → có thể disable bank flow (đơn giản hoá)
- Hoặc giữ cả 2 nếu bank còn quan trọng

---

## ⏱ TIMELINE TỔNG THỂ

| Tuần | Việc | Ai làm |
|---|---|---|
| 0 | Anh review hướng dẫn này, chuẩn bị documents | Anh |
| 0-1 | Anh apply tại https://paypay.ne.jp/store-online/ | Anh |
| 1-2 | Đợi PayPay audit (3-5 ngày làm việc) | PayPay |
| 2 | Anh nhận credentials → báo em | Anh + Em |
| 2-3 | Em integrate sandbox (3-5 ngày) | Em |
| 3 | Anh test sandbox với 1-2 đơn thử | Anh |
| 3-4 | Em deploy production + monitor | Em |
| 4-8 | Theo dõi conversion + dần migrate khỏi AI verify | Cả 2 |

---

## ❓ FAQ

**Q: Nếu anh chưa có 開業届 thì sao?**
A: Đăng ký free tại 税務署 quận anh ở. ~30 phút điền form. PayPay yêu cầu cái này (hoặc 確定申告書) để verify business.

**Q: Khách Việt không có PayPay app thì sao?**
A: Vẫn giữ flow bank transfer + AI verify (em đã làm) làm phương án dự phòng. Khách chọn 1 trong 2.

**Q: Phí 3.8% có giảm được không?**
A: Có, nếu đăng ký MyStore Lite Plan: 1.6% + ¥1,980/tháng. Break-even khi doanh thu > ¥99,000/tháng. Anh đã đạt → có thể chọn Lite từ đầu để tiết kiệm.

**Q: Nếu anh muốn nhận thẻ tín dụng (cho khách Nhật bản địa)?**
A: Add Stripe Japan song song với PayPay. Em làm sau Phase 1 nếu anh muốn.

**Q: Webhook không tới thì sao?**
A: Em build polling fallback — frontend poll PayPay status mỗi 3s. Hai lớp đảm bảo không miss đơn.

---

## 🚀 NEXT STEPS

### Anh cần làm (UPDATED — 個人事業主 path):

**Phase 1 — Đăng ký 個人事業主 (1 ngày)**:
1. ✅ Đọc hướng dẫn này
2. ⏳ Đăng ký 開業届 — cách 1 trong 2:
   - **Online qua e-Tax**: cần マイナンバーカード + card reader (hoặc smartphone NFC) → submit điện tử (~20 phút)
   - **Offline**: đến 税務署 quận anh ở → điền form → nộp (~1 giờ)
3. ⏳ Lưu **開業届控え** (bản đóng dấu) làm proof

**Phase 2 — Apply PayPay (30 phút)**:
4. ⏳ Mở https://paypay.ne.jp/store-online/
5. ⏳ Điền form theo bảng ở trên (Bước 4)
6. ⏳ Upload 開業届控え + 本人確認書類
7. ⏳ Submit → đợi email (3-5 ngày làm việc)

**Phase 3 — Em integrate (3-5 ngày sau khi anh có credentials)**:
8. ⏳ Anh báo em ngay khi nhận được API Key + Secret + Merchant ID
9. ⏳ Em wire integration (Web Cashier API + webhook + UI thay receipt upload)
10. ⏳ Test sandbox với anh
11. ⏳ Go live

**Optional (làm song song, không block)**:
- ⏳ Gọi 保健所 quận anh confirm 業種 + 届出 type (free, 10 phút điện thoại)
- ⏳ Đến 保健所 nộp 営業届出書 (free, 30 phút - 1 ngày)
- ⏳ Xin manufacturer copy 営業許可証 cho chain-of-trust (best practice)

### Em sẵn sàng:
- ✅ Spec đã viết xong
- ⏳ Sẽ implement khi anh có credentials (3-5 ngày code)

---

## 📚 REFERENCES

- [PayPay Online Payment](https://paypay.ne.jp/store-online/)
- [PayPay Web Cashier API Documentation](https://www.paypay.ne.jp/opa/doc/v1.0/webcashier)
- [PayPay for Developers](https://paypayue.github.io/en/)
- [Phí và plan](https://paypay.ne.jp/help-merchant/b0544/)
- [Cá nhân kinh doanh hướng dẫn](https://paypay.ne.jp/store-media/qr/0016_qr_individual/)

---

**File này là master guide. Mỗi lần em research thêm hoặc anh có thay đổi, em sẽ update file này.**
