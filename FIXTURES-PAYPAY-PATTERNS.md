# FIXTURES — PayPay & Bank Bill Text Patterns

**Mục đích:** Tham chiếu CHÍNH XÁC text xuất hiện trên screenshot PayPay / ngân hàng để
test + fix regex trong `google-apps-script.js` (8-layer AI verify pipeline).

**KHÔNG sửa code** — đây chỉ là fixtures + pattern reference.

**Last updated:** 2026-05-02
**Cross-ref:** `K:\bep-thuy-japan\google-apps-script.js` (lines 1358–1521)
**Related audit:** `AUDIT-VERIFY-LAYERS.md`

---

## 1. PayPay P2P SEND Screenshot (Sender's view)

Khi khách bấm "送る" trong PayPay app → screenshot từ phía khách (người gửi tiền).
OCR sẽ thấy text gần giống dưới đây (layout có thể đảo thứ tự dòng tuỳ version app).

### Raw OCR text (typical):

```
Thanghoang さんに送る
2026年5月2日 16時56分
2,300 円
送り完了                   ← (or 送りました — hai variant)
送信日 2026年5月2日
有効期限 2026年5月6日
取引番号 02258669730502377473
PayPay 株式会社 資金移動業者 関東財務局長 第00068号
```

### Field breakdown:

| Field         | Label            | Value (example)              | Notes                                                |
|---------------|------------------|------------------------------|------------------------------------------------------|
| Recipient     | `さんに送る`     | `Thanghoang さんに送る`      | Tên người nhận đứng TRƯỚC, suffix `さん` + `に送る` |
| Datetime      | (no label)       | `2026年5月2日 16時56分`      | Đầu screenshot, thường gần tên                        |
| Amount        | `円`             | `2,300 円`                    | Có dấu phẩy phân cách nghìn                            |
| Status        | —                | `送り完了` / `送りました`    | 2 variant — UI cũ/mới                                  |
| Send date     | `送信日`         | `2026年5月2日`                | Ngày thật của giao dịch                                |
| **Expiry**    | `有効期限`       | `2026年5月6日`                | **+4 ngày sau** 送信日 — KHÔNG PHẢI ngày giao dịch    |
| Transaction # | `取引番号`       | `02258669730502377473`       | 20 chữ số, không ký tự ngăn cách                       |
| Issuer        | —                | `PayPay 株式会社 ...`         | Footer, license number                                 |

---

## 2. PayPay P2P RECEIVE Screenshot (Recipient's view)

Khi anh Thắng (chủ shop) mở PayPay app → screenshot từ phía nhận tiền.
**Anh Thắng cũng được khách share variant này**, nên AI verify PHẢI handle cả 2.

### Raw OCR text (typical):

```
Thanghoang さんから受け取る
2026年5月2日 16時56分
2,300 円
受け取り完了
取引完了日 2026年5月2日 16時56分
詳細
PayPayマネー 2,300 円
PayPayマネーライト 0 円
送信日 2026年5月2日
有効期限 2026年5月6日
取引番号 02258669730502377473
```

### Field breakdown:

| Field           | Label              | Value (example)              | Notes                                                |
|-----------------|--------------------|------------------------------|------------------------------------------------------|
| Sender          | `さんから受け取る` | `Thanghoang さんから受け取る`| Tên người gửi đứng TRƯỚC, suffix `さん` + `から受け取る` |
| Datetime        | (no label)         | `2026年5月2日 16時56分`      | Đầu screenshot                                       |
| Amount          | `円`               | `2,300 円`                    |                                                      |
| Status          | —                  | `受け取り完了`                | Variant phía nhận (KHÔNG có 送り完了)                |
| Completion date | `取引完了日`       | `2026年5月2日 16時56分`      | **Có thêm label này** — phía nhận mới có             |
| Detail header   | —                  | `詳細`                        | Cố định                                              |
| Money type 1    | `PayPayマネー`     | `2,300 円`                    | Tiền chuyển                                          |
| Money type 2    | `PayPayマネーライト`| `0 円`                       | Variant phụ — thường = 0                             |
| Send date       | `送信日`           | `2026年5月2日`                |                                                      |
| **Expiry**      | `有効期限`         | `2026年5月6日`                | +4 ngày — KHÔNG PHẢI ngày giao dịch                  |
| Transaction #   | `取引番号`         | `02258669730502377473`       | 20 chữ số                                             |

---

## 3. Key Pattern Observations

### 3.1. Recipient name (Layer 2)

**Hai variant cùng tên `Thanghoang`:**

| Variant      | Text                          | Khi nào                           |
|--------------|-------------------------------|-----------------------------------|
| Sender view  | `Thanghoang さんに送る`       | Khách screenshot từ phía mình     |
| Receive view | `Thanghoang さんから受け取る` | Khách screenshot phía Thắng nhận  |

**Critical:** regex phải match cả 2 — KHÔNG được lock cứng `に送る`.

Hiện tại 1 regex bao trùm cả 2:
```javascript
{ regex: /Thanghoang.{0,3}(?:さん|様)/i, name: 'Thanghoang さん/様 (PayPay UI)' }
```
Vì sau `Thanghoang ` (1 space) là `さん` thì `.{0,3}` match khoảng trắng + bắt được `さん`. OK.

### 3.2. Hai loại ngày — bẫy ai phải tránh

Mọi PayPay bill có **TÍNH CHẤT 2 ngày**:

| Date         | Label    | Ý nghĩa                    | Khoảng cách so với hôm nay              |
|--------------|----------|----------------------------|------------------------------------------|
| Transaction  | `送信日` | Ngày khách thật sự gửi tiền| **Trong 72h** → AI verify phải pass     |
| Expiry       | `有効期限`| Hết hạn để nhận tiền       | **+4 ngày sau** — luôn FUTURE → fail    |

**Bug đã từng xảy ra (Layer 6):** code chọn nhầm `有効期限` (expiry) → date FUTURE → fail "future date" check → bill thật bị reject.

**Fix hiện tại (line 1457–1458):**
```javascript
var hasExpiry = /有効期限|期限切れ|期限|expir|valid.{0,5}until/i.test(ctxBefore);
var hasTxn = /取引完了|取引日|送信日|完了日|決済日|支払日|お振込日|受け取り完了|送金日|送りました|発行日|paid.{0,5}on|completed|transaction/i.test(ctxBefore);
```
Logic: filter dates có `有効期限` trong 60 chars trước → prefer dates có txn keyword → fallback OLDEST.

### 3.3. Transaction ID — bẫy `番号` vs `ID`

**Critical:** PayPay dùng **`取引番号`** (NOT `取引ID`).

| Source                    | Label thường thấy        | Format               |
|---------------------------|--------------------------|----------------------|
| PayPay                    | `取引番号`               | 20 chữ số liền        |
| PayPay (UI cũ, hiếm)      | `取引ID` / `トランザクションID` | 17–22 chữ số          |
| Yucho                     | `受付番号`               | `RT0M1234567` alphanumeric (3–4 letters + 6–12 digits) |
| Mizuho/SMBC/MUFG          | `振込番号` / `お取扱番号` | varies                |

**Bug đã từng xảy ra (Layer 7):** regex chỉ check `取引ID` → bill PayPay thật (dùng `取引番号`) bị fail.

**Fix hiện tại (line 1496):**
```javascript
var paypayId = /取引[\s]*(?:番号|ID|No)[\s:：]*([A-Za-z0-9\s]{12,30})/i.exec(text);
```
Bao quát: `番号` | `ID` | `No`.

### 3.4. Source identifier (Layer 4)

PayPay screenshot LUÔN có 1 trong:
- `PayPay` (English chữ to header)
- `PayPay 株式会社` (footer)
- `ペイペイ` (katakana, hiếm)
- `ペイぺイ` (mixed katakana/hiragana — OCR variant gặp)

Regex: `/paypay|ペイペイ|ペイぺイ/i` — match all.

### 3.5. Completion keyword (Layer 5)

| Variant         | Khi nào                    |
|-----------------|----------------------------|
| `送り完了`      | Send view (UI mới)         |
| `送りました`    | Send view (UI cũ — past tense) |
| `受け取り完了`  | Receive view               |
| `取引完了`      | Generic                    |

Regex Layer 5 dùng generic: `/完了|送金|振込|...|済|success|completed|paid/i` — bao hết.

---

## 4. Yucho 振込 Screenshot (mobile app)

Khi khách dùng ゆうちょ Direct mobile để chuyển khoản → screenshot:

```
振込完了
ご依頼日 2026/05/02
振込金額 2,300円
受取人 タカハラ ケイイチロウ
口座番号 2168488
受付番号 RT0M1234567
```

| Field         | Label        | Value (example)            | Notes                                  |
|---------------|--------------|----------------------------|----------------------------------------|
| Status        | —            | `振込完了`                  |                                        |
| Date          | `ご依頼日`   | `2026/05/02`                | Slash format `YYYY/MM/DD`              |
| Amount        | `振込金額`   | `2,300円`                   | Có thể có hoặc KHÔNG có space trước 円 |
| Recipient     | `受取人`     | `タカハラ ケイイチロウ`     | Full-width katakana, có khoảng cách     |
| Account #     | `口座番号`   | `2168488`                   | 7 chữ số (no spaces)                   |
| Reference #   | `受付番号`   | `RT0M1234567`               | Alphanumeric — Yucho format             |

**Yucho variant — half-width katakana:** `ﾀｶﾊﾗ ｹｲｲﾁﾛｳ` (regex đã handle: line 1374, 1377).

**Yucho variant — 記号番号:** `12030-21684881` hoặc `12030 21684881` (full Yucho symbol+number, line 1380).

---

## 5. Mizuho / SMBC / MUFG Bank App Patterns (similar but different labels)

Mỗi ngân hàng dùng label khác nhau cho cùng concept. Bảng đối chiếu:

| Concept           | Yucho        | Mizuho       | SMBC          | MUFG          |
|-------------------|--------------|--------------|---------------|---------------|
| Status            | `振込完了`   | `お振込完了` | `振込手続き完了`| `振込完了`    |
| Transaction date  | `ご依頼日`   | `振込日`     | `お振込日`    | `振込指定日`  |
| Amount            | `振込金額`   | `振込金額`   | `振込金額`    | `振込金額`    |
| Recipient         | `受取人`     | `受取人`     | `受取人名`    | `お受取人`    |
| Reference #       | `受付番号`   | `振込番号` / `お取扱番号` | `受付番号` | `お取扱番号` |

**Mizuho example block:**
```
お振込完了
振込日 2026年5月2日
振込金額 2,300円
受取人 タカハラ ケイイチロウ
振込先 ゆうちょ銀行 二〇八店 普通 2168488
お取扱番号 0123456789
```

**SMBC example block:**
```
振込手続き完了
お振込日 2026/05/02 17:30
振込金額 ¥2,300
受取人名 タカハラ ケイイチロウ 様
振込先口座 ゆうちょ銀行 208 普通 2168488
受付番号 SM12345678
```

---

## 6. Regex Patterns Cross-Reference

Tất cả regex đang dùng (file: `google-apps-script.js`):

### Layer 2 — Recipient (line 1361–1382)

```javascript
/Thanghoang.{0,3}(?:さん|様)/i                        // PayPay UI both views
/(?:送金先|宛先|送り先|To)[:\s]*Thanghoang/i           // Sender view label prefix
/Thanghoang.{0,3}に送/i                              // Sender送る/送りました
/T[hH][a-z0-9]{1,2}n[a-z0-9]{0,2}h[a-z0-9]{0,2}o[a-z0-9]{1,3}n[gq]/i  // OCR fuzzy
/(?:振込先|受取人|名義人|お振込先|お受取り)[:\s]*(?:タカハラ|ﾀｶﾊﾗ|Takahara)/i  // Bank
/thanghoang/i
/thang\s*hoang/i
/タカハラ/
/ﾀｶﾊﾗ/
/takahara/i
/ケイイチロウ/
/ｹｲｲﾁﾛｳ/
/keiichiro/i
/2168488/                                            // Yucho account #
/12030[\-\s]?21684881/                                // Yucho 記号番号
/二〇八店|208店/                                       // Yucho 支店
```

### Layer 4 — Source (line 1392–1411)

```javascript
/paypay|ペイペイ|ペイぺイ/i                              // PayPay
/ゆうちょ|ゆう ちょ|JP\s*BANK|Japan\s*Post\s*Bank/i     // Yucho
/三菱\s*UFJ|MUFG|Mitsubishi\s*UFJ/i                  // MUFG
/三井住友|SMBC|Mitsui\s*Sumitomo/i                    // SMBC
/みずほ|Mizuho/i                                       // Mizuho
// + 11 other Japanese banks/payment apps
```

### Layer 5 — Completion (line 1422)

```javascript
/完了|送金|振込|お振込|支払|お支払|領収|決済|送付|成功|済|success|completed|paid/i
```

### Layer 6 — Date (line 1435–1485)

```javascript
// Match date formats (3 variants)
/(20\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/g       // 2026/05/02 or 2026-05-02 or 2026.5.2
/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g  // 2026年5月2日
/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](20\d{2})/g       // 5/2/2026

// Context filter (60 chars BEFORE date)
/有効期限|期限切れ|期限|expir|valid.{0,5}until/i        // hasExpiry → SKIP
/取引完了|取引日|送信日|完了日|決済日|支払日|お振込日|受け取り完了|送金日|送りました|発行日|paid.{0,5}on|completed|transaction/i  // hasTxn → PREFER
```

### Layer 7 — Transaction Reference (line 1491–1520)

```javascript
/取引[\s]*(?:番号|ID|No)[\s:：]*([A-Za-z0-9\s]{12,30})/i       // PayPay 取引番号/ID/No
/取引(?:番号|ID|No)([A-Za-z0-9]{12,30})/i                       // Same on stripped text
/(?:受付番号|受付\s*No|振込番号|整理番号|お取扱番号|認証番号|参照番号|ご依頼人番号)[\s:：]*([A-Z0-9\s]{6,25})/i  // Bank
/(\d{12,25})/                                                   // Loose digit fallback
/\b([A-Z]{2,4}\d{6,12})\b/                                       // Yucho-style alphanumeric
```

---

## 7. Failure Modes Observed (Historical Bugs)

| Bug                                            | Layer | Root cause                                                     | Status                  |
|------------------------------------------------|-------|----------------------------------------------------------------|-------------------------|
| Picked `有効期限 5/6` instead of `送信日 5/2`  | L6    | Old code picked LATEST date — expiry always future             | **FIXED** (line 1467–1476: filter expiry context, prefer txn context, OLDEST) |
| Only checked `取引ID`, missed `取引番号`       | L7    | Hardcoded `ID` only                                            | **FIXED** (line 1496: `(?:番号\|ID\|No)`) |
| `Thanghoang さんから受け取る` (receive view) bị miss in old regex | L2 | Old regex only `Thanghoang.{0,3}に送`                          | **FIXED** (line 1364: `(?:さん\|様)` covers both) |
| OCR mis-read `Thanghoang` → `Thanghoarq`       | L2    | OCR sometimes flips `ng` → `rq`/`nq`                            | **FIXED** (line 1368: fuzzy match `n[gq]`) |
| `2,300円` vs `2,300 円` (no space variant)     | L1    | Old regex required `\s+` before `円`                            | **FIXED** (`\s*円`)     |
| PayPay split `取引番号 0225 8669 7305` (UI spaces) | L7  | Strict regex no-space failed                                    | **FIXED** (line 1493: strip whitespace before match) |
| Half-width katakana `ﾀｶﾊﾗ` not matched         | L2    | Old regex only full-width                                       | **FIXED** (line 1374, 1377)             |
| Future date in `振込指定日` (MUFG scheduled)   | L6    | Treated as transaction date                                     | Partial — `振込指定日` not in keyword list yet (low priority — anh's customers don't use scheduled transfers) |

---

## 8. Test Case Matrix (for future regression tests)

| #   | Source        | View         | Amount   | Date in window | Status keyword     | Ref ID format        | Expected verify result |
|-----|---------------|--------------|----------|----------------|--------------------|----------------------|------------------------|
| T1  | PayPay        | Send         | 2,300円  | Yes (today)    | 送り完了           | 取引番号 20 digits   | PASS                   |
| T2  | PayPay        | Send (old)   | 2,300円  | Yes (today)    | 送りました         | 取引番号 20 digits   | PASS                   |
| T3  | PayPay        | Receive      | 2,300円  | Yes (today)    | 受け取り完了       | 取引番号 20 digits   | PASS                   |
| T4  | PayPay        | Receive      | 2,300円  | Yes (yesterday)| 受け取り完了       | 取引番号 20 digits   | PASS                   |
| T5  | PayPay        | Send         | 2,300円  | 4 days ago     | 送り完了           | 取引番号 20 digits   | FAIL L6 (>72h)         |
| T6  | PayPay        | Send         | 2,300円  | Yes (today)    | (none)             | 取引番号 20 digits   | FAIL L5                |
| T7  | PayPay        | Send         | 2,000円  | Yes            | 送り完了           | 取引番号 20 digits   | FAIL L1 (amount mismatch — order was 2,300円) |
| T8  | Yucho         | Mobile       | 2,300円  | Yes            | 振込完了           | 受付番号 RT0M1234567 | PASS                   |
| T9  | Mizuho        | Web          | 2,300円  | Yes            | お振込完了         | お取扱番号 0123456789| PASS                   |
| T10 | SMBC          | App          | 2,300円  | Yes            | 振込手続き完了     | 受付番号 SM12345678  | PASS                   |
| T11 | PayPay        | Send         | 2,300円  | Yes            | 送り完了           | (no 取引番号)        | FAIL L7                |
| T12 | (Photoshopped)| Send         | 2,300円  | Yes            | 送り完了           | 取引番号 20 digits   | FAIL L8 (EXIF Software signature) |
| T13 | PayPay        | Send         | 2,300円  | Yes — has BOTH 送信日 5/2 AND 有効期限 5/6 | 送り完了 | 取引番号 | PASS (must pick 5/2 NOT 5/6) — regression for old bug #1 |
| T14 | PayPay        | Send         | 2,300円  | Yes            | 送り完了           | 取引ID (old UI label)| PASS — regression for old bug #2 |

---

## 9. Notes for Future Regex Updates

- **Whenever PayPay app updates UI** → re-screenshot SEND + RECEIVE views, diff text against this doc, update fixtures.
- **NEVER lock recipient regex to `に送` only** — must support `から受け取る` (anh's view).
- **NEVER assume single date** — always consider 送信日 + 有効期限 + 取引完了日 trio.
- **Transaction ID label is `番号`, NOT `ID`** — PayPay UI standard since 2024.
- **OCR drops/swaps single chars frequently** — keep fuzzy variant for `Thanghoang`.
- **Date format JP: `2026年5月2日`** — single-digit month/day (5月 not 05月) is normal, regex `\d{1,2}` handles it.

---

**Owner notes:** 
- Bill examples here mocked from real anh-Thắng test bills (amounts/IDs anonymized only when possible — but for fidelity we kept ID `02258669730502377473` from a real test screenshot).
- This doc lives next to `google-apps-script.js` so anyone editing Layer 2/4/5/6/7 regex consults it first.
