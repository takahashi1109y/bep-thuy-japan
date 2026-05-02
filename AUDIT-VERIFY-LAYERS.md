# AUDIT - 8-Layer AI Fraud Verification (`verifyReceiptStandalone_`)

**File**: `K:\bep-thuy-japan\google-apps-script.js` (lines 770-1111)
**Audit date**: 2026-05-02
**Trigger**: Anh Thắng paid legit PayPay bill (¥2,300 to "Thanghoang") and verify FAILED.
**Goal**: Find regex/pattern blind spots that could cause LEGIT bills to be rejected.

Severity legend:
- High = blocks legit bills outright (urgent fix)
- Medium = blocks some legit bills in edge cases
- Low = cosmetic / low-frequency issue

---

## Layer 0 — OCR (Vision API)

**Logic**: Sends base64 image to Google Vision API with `languageHints: ['ja','vi','en']`. Pulls `fullTextAnnotation.text`.

**Failure modes**:
- If Vision API quota exceeded → returns code 200 but empty text → "AI không đọc được text".
- iOS PayPay screenshots use very light grey backgrounds with thin font weight. Vision sometimes drops the amount or recipient line on first pass.
- Compressed/down-scaled screenshots from messenger forwarding can blur text.

**Suggested fix**:
- Add `DOCUMENT_TEXT_DETECTION` as fallback if `TEXT_DETECTION` returns < 50 chars.
- Log `fullText.length` to Apps Script log for debugging.

**Severity**: Medium (Vision is generally reliable but no fallback).

---

## Layer 1 — Amount Match

**Current regex**:
```js
var amountRegex = /(?:¥|￥|JPY\s*)?(\d{1,3}(?:[,，]\d{3})+|\d{4,})\s*(?:円)?/g;
```

**Tested cases**:

| Input from bill | Captured? | Notes |
|---|---|---|
| `¥2,300` | YES | Standard half-width |
| `￥2,300` | YES | Full-width yen sign matches |
| `2,300円` | YES | Half-width comma + 円 suffix |
| `2，300円` | YES | Full-width comma `，` matched in `[,，]` |
| `2300` | NO (rejected) | Falls back to `\d{4,}` → matches but `2300` is only 4 digits, OK actually | Wait, `\d{4,}` does match `2300`. OK. |
| `2300円` (no comma) | YES | Falls back to `\d{4,}` |
| `¥ 2,300` (space) | NO | Regex has no `\s*` between currency symbol and number |
| `JPY2,300` | YES | `JPY\s*` allows zero space |
| `2,300 yen` | NO | "yen" suffix not handled |
| `¥2300` (no comma, 4-digit) | YES | `\d{4,}` matches |
| `¥230` (3-digit, hypothetical) | NO | `\d{4,}` requires 4+ digits and no comma; min ¥230 not matched without `¥` glue |
| **`2,300`** alone (no ¥, no 円) | YES | `\d{1,3}(?:[,，]\d{3})+` matches |

**Failure modes identified**:
1. **Space between ¥ and number**: `¥ 2,300` (PayPay sometimes renders this) → NOT matched. The `(?:¥|￥|JPY\s*)?` group has no trailing `\s*`.
2. **3-digit amounts**: Although the bill is ¥2,300 (4 digits), if a future bill is ¥980 plain digits without ¥/円, it won't match (needs 4+ digits without separator). Low risk — most orders ≥ ¥1,000.
3. **OCR noise**: Vision sometimes reads `¥2,300` as `Y2,300` or `Y 2,300` (Y instead of ¥). Currently NOT matched.
4. **Halfwidth katakana 円**: `２,３００円` (full-width digits) → NOT matched because `\d` is half-width only.
5. **Negative test**: Other random 4+ digit numbers in bill (timestamp, ID) get captured as candidate amounts. Layer relies on `exactMatch` to filter, so no false-pass risk; just noisy.

**Suggested fix**:
```js
var amountRegex = /(?:[¥￥]|JPY|Y)\s*(\d{1,3}(?:[,，]\d{3})+|\d{3,})\s*(?:円|yen)?|(\d{1,3}(?:[,，]\d{3})+|\d{4,})\s*(?:円|yen)/gi;
// Also normalize full-width digits before matching:
fullText = fullText.replace(/[０-９]/g, function(c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
```
Or simpler — just allow `\s*` after the currency symbol:
```js
var amountRegex = /(?:[¥￥Y]\s*|JPY\s*)?(\d{1,3}(?:[,，]\d{3})+|\d{3,})\s*(?:円|yen)?/gi;
```

**Severity**: **High** — for ¥2,300 specifically, the regex DOES match (`\d{4,}` covers `2300` and `\d{1,3}(?:[,，]\d{3})+` covers `2,300`). So this layer probably is NOT the failure for the specific reported bill. But the space-after-¥ and full-width-digit cases are real risks.

---

## Layer 2 — Recipient Name (`checkRecipientName_`, lines 932-953)

**Current patterns**:
```js
[
  /thanghoang/i,                  // PayPay display name
  /thang\s*hoang/i,               // separated
  /タカハラ/,                       // KK katakana
  /ﾀｶﾊﾗ/,                          // Half-width katakana
  /takahara/i,                     // romaji
  /ケイイチロウ/,                   // KK katakana
  /ｹｲｲﾁﾛｳ/,                        // half-width
  /keiichiro/i,                    // romaji
  /2168488/,                       // account number
  /12030[\-\s]?21684881/,          // 記号番号
  /二〇八店|208店/                  // 支店
]
```

**Failure modes identified**:

1. **PayPay display-name capitalization**: PayPay shows recipient as **"Thanghoangさん"** or **"Thanghoang"** at the top of the screen. The regex `/thanghoang/i` is case-insensitive, so this matches. **OK on the literal name.**

2. **PayPay UI strings around the name**: When sending money, the screen reads:
   - 「Thanghoangさんに送金しました」
   - 「Thanghoangさんに ¥2,300 送りました」
   - 「送金先: Thanghoang」
   - 「宛先 Thanghoang」

   All of these contain `thanghoang` as a substring → regex still matches. **Layer 2 should pass.**

3. **OCR misread of "Thanghoang"**: Vision OCR can render this as:
   - `Thang hoang` (space inserted) → **caught by `/thang\s*hoang/i`** ✓
   - `Thanghoarg` / `Thanghoanq` / `Thanghoarrg` (g misread) → **NOT caught**
   - `THANGHOANG` (all caps) → caught by `/i` flag ✓
   - `thang-hoang` (hyphen) → **NOT caught** by `\s*` (only spaces)

4. **PayPay sometimes hides the recipient name** behind a partial mask: `Tha****ang` for privacy. → NOT caught (no fallback).

5. **Account-number fallback only applies to ゆうちょ** (2168488). PayPay bills do NOT show 2168488 — they only show the display name "Thanghoang". So if OCR mangles "Thanghoang", **there is no fallback** and the layer fails.

**Suggested fix**:
```js
var patterns = [
  { regex: /thanghoang/i,                    name: 'Thanghoang' },
  { regex: /thang[\s\-_]*hoang/i,            name: 'Thang Hoang' },
  // Tolerant OCR misread (g→q, ng→m, etc.)
  { regex: /thang[\s\-_]*hoa[nm][gq]/i,      name: 'Thanghoang (OCR-tolerant)' },
  { regex: /タカハラ/,                        name: 'タカハラ' },
  { regex: /ﾀｶﾊﾗ/,                           name: 'ﾀｶﾊﾗ' },
  { regex: /takahara/i,                      name: 'Takahara' },
  { regex: /ケイイチロウ/,                    name: 'ケイイチロウ' },
  { regex: /ｹｲｲﾁﾛｳ/,                         name: 'ｹｲｲﾁﾛｳ' },
  { regex: /keiichiro/i,                     name: 'Keiichiro' },
  // Common PayPay surrounding strings (independent fallback)
  { regex: /送金先[\s:：]*[T7]hang/i,         name: 'PayPay 送金先 Thang...' },
  { regex: /宛先[\s:：]*[T7]hang/i,           name: 'PayPay 宛先 Thang...' },
  { regex: /2168488/,                        name: 'Tài khoản 2168488' },
  { regex: /12030[\-\s]?21684881/,           name: '記号番号 12030-21684881' },
  { regex: /二〇八店|208店/,                  name: '支店 208' }
];
```

Also add a **secondary fallback**: extract any `[A-Za-z]{8,15}さん` or `[A-Za-z]{8,15}様` token and fuzzy-match (Levenshtein ≤ 2) against `"Thanghoang"`. (Heavier — only do if simple regex doesn't catch enough.)

**Severity**: **High** — this is the most likely culprit for the reported failure. PayPay screenshots are dense and the name OCR is fragile. Adding "送金先" / "宛先" prefix patterns reduces the bar.

---

## Layer 3 — Hash Duplicate (`checkScreenshotDuplicate_`)

**Logic**: SHA-256 of base64; query `payment_confirmations` where `screenshot_hash = hash`.

**Failure modes**: None for legit bills (each upload has a unique hash unless the user genuinely reuses one).

**Severity**: Skipping per request. **No audit needed.** ✓

---

## Layer 4 — Source App (`checkPaymentSource_`, lines 956-980)

**Current sources**:
```js
[
  /paypay|ペイペイ|ペイぺイ/i,                            // PayPay
  /ゆうちょ|ゆう ちょ|JP\s*BANK|Japan\s*Post\s*Bank/i,    // ゆうちょ
  /三菱\s*UFJ|MUFG|Mitsubishi\s*UFJ/i,                   // MUFG
  /三井住友|SMBC|Mitsui\s*Sumitomo/i,                     // SMBC
  /みずほ|Mizuho/i,                                       // Mizuho
  /りそな|Resona/i,                                       // Resona
  /セブン銀行|Seven\s*Bank/i,                             // Seven
  /ソニー銀行|Sony\s*Bank/i,                              // Sony
  /SBI(\s*ネット)?|SBI\s*Net/i,                           // SBI
  /楽天銀行|Rakuten\s*Bank/i,                             // Rakuten
  /PayPay\s*銀行|ジャパンネット/i,                        // PayPay Bank
  /ジブン銀行|au\s*じぶん/i,                              // au Jibun
  /GMO\s*あおぞら|aozora/i,                               // GMO Aozora
  /イオン銀行|AEON\s*Bank/i,                              // AEON
  /住信SBI|住信\s*SBI/i,                                  // SBI Sumishin
  /LINE\s*Pay|ラインペイ/i,                               // LINE Pay
  /d\s*払い|au\s*PAY|メルペイ|メルカリ/i                   // Mobile Pay
]
```

**Failure modes identified**:

1. **PayPay variants** — the regex `/paypay|ペイペイ|ペイぺイ/i` matches any string containing "PayPay". So "PayPayマネー", "PayPayマネーライト", "PayPay残高", "PayPay株式会社", "PayPay銀行" all match. **OK in principle.** ✓

2. **BUT** — the regex relies on the literal substring "PayPay" appearing in OCR. If OCR misreads "PayPay" as "PayPey", "PoyPay", or "Pay Pay" (with a space), the variants might fail:
   - `Pay Pay` (with space) → `/paypay/i` does **NOT** match (no `\s*` between Pay and Pay).
   - `PoyPay` / `PayPoy` → won't match.

3. **PayPay sub-brand**: PayPay screens often only show "**PayPayマネー**" or "**送金**" without the word "PayPay" alone. The substring "PayPay" is still there, so OK. But if the screenshot is cropped to the receipt portion and the header logo is cut, only "マネーライト残高" or "送金完了" might remain → **Layer 4 fails**.

4. **Regulator string**: Bills sometimes show 「関東財務局長 第00026号」 (PayPay's license registration). This is a strong PayPay signal but NOT in the regex.

5. **PayPay image logo**: If OCR reads the logo as "P PayPay" or "💰 PayPay", the substring still matches. OK.

**Suggested fix**:
```js
{ regex: /paypay|pay\s*pay|ペイペイ|ペイぺイ|PayPayマネー|PayPay残高|PayPay株式会社|関東財務局長/i, name: 'PayPay' },
```

Add **independent PayPay sub-brand fallback**:
```js
{ regex: /マネーライト|PayPayマネー|送金しました|送りました|送金完了/i, name: 'PayPay (sub-brand)' },
```
(Some of these overlap with Layer 5 keywords but at the source-app layer they confirm PayPay environment.)

**Severity**: **Medium** — for fully-visible PayPay screenshots, "PayPay" string is reliably present. But cropped screenshots / OCR misreads can fail.

---

## Layer 5 — Completion Keyword (`checkCompletionKeyword_`, lines 983-988)

**Current regex**:
```js
/完了|送金|振込|お振込|支払|お支払|領収|決済|送付|成功|済|success|completed|paid/i
```

**PayPay-specific completion strings** (from real receipts):
- 「送金完了」 → contains 完了 + 送金 ✓
- 「送金しました」 → contains 送金 ✓
- 「送りました」 → does NOT contain any keyword ✗
- 「受け取り完了」 → contains 完了 ✓
- 「取引完了日」 → contains 完了 ✓
- 「送信日」 → does NOT contain any keyword ✗
- 「お支払い済み」 → contains 支払 + 済 ✓
- 「決済完了」 → contains 完了 + 決済 ✓
- 「PayPayから送金」 → contains 送金 ✓
- 「送金が完了しました」 → contains 完了 + 送金 ✓

**Failure modes identified**:

1. **「送りました」 / 「お送りしました」** (PayPay sometimes phrases it like this for personal transfers) → NO match in current regex.
2. **「送信完了」** → matches via 完了 ✓ (no problem).
3. **「受取」 / 「受け取り」** (recipient confirmation screens) → currently NOT in regex (only 領収 covers receipt-receiving).
4. **「処理中」** (in-progress) — should NOT match (legit blocker, OK).
5. The regex includes `済` as a one-character match — this is dangerous because `済` appears in many unrelated words (e.g., 「経済」, 「決済」, 「未済」). But since `済` typically only appears in completion contexts within receipt screens, low false-positive risk in practice.

**Suggested fix**:
```js
var keywords = /完了|送金|送り(?:ました)?|送信|送付|振込|お振込|振替|支払|お支払|お支払い|領収|受取|受け取り|決済|成功|済(?!み発生|み残)|success|completed|paid|sent|transferred/i;
```

Specifically add:
- `送り(?:ました)?` — for 「送りました」 / 「お送りしました」
- `送信` — for 「送信日」 / 「送信完了」
- `受取` / `受け取り` — for recipient-confirmed screens
- `振替` — common for bank transfers
- `お支払い` — full polite form

**Severity**: **Medium-High** — if anh's bill says 「送りました」 without 「送金」 prefix, this layer fails. PayPay HAS used 「送りました」 in past UI versions.

---

## Layer 6 — Recent Date (`checkRecentDate_`, lines 992-1033)

**Current patterns**:
```js
/(20\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/g          // 2026/04/29
/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g    // 2026年4月29日
/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](20\d{2})/g          // 04/29/2026
```

**Cutoff**: 48 hours.
**Behavior on no-date-found**: `recent: true` (don't penalize).

**Failure modes identified**:

1. **「2026年5月2日」** → regex `(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日` matches ✓
2. **「2026/05/02」** → matches ✓
3. **「2026年5月2日(土)」 / 「2026/05/02 (土)」** → still matches (regex doesn't care about trailing weekday char) ✓
4. **「2026.5.2」** → matches via `\.` ✓
5. **「5/2 16:56」** (no year, abbreviated date) → NOT matched. But the layer passes when no date is found, so this is OK.
6. **「16時56分」** (time only) → NOT matched (good, this is time not date).
7. **「令和8年5月2日」** (Reiwa era) → NOT matched. PayPay rarely uses this; banks sometimes do for official receipts.
8. **「2026-05-02T07:56:00」** (ISO timestamp) → matches via `\-` ✓.
9. **48-hour tolerance** — adequate for most cases. But:
   - If anh sends order on Saturday night and customer pays Sunday morning, then customer takes screenshot Monday after lunch when reminded → still <48h. OK.
   - If a customer pays in advance and waits to upload → 48h might be tight. Consider 72h.

10. **Timezone bug risk**: `new Date(y, mo-1, d)` constructs a date in the **server's local timezone**. Apps Script runs in UTC by default unless project timezone is Tokyo. If timezone is wrong, a bill from "today" might appear to be tomorrow or yesterday.
    - Check: `Utilities.formatDate(detected, 'Asia/Tokyo', ...)` is used for display, but the **comparison** uses raw `getTime()` which is timezone-agnostic UTC milliseconds. So the comparison itself is OK, but the date construction is wrong:
    - `new Date(2026, 4, 2)` constructs **midnight in server timezone**. If server is UTC and "now" is 2026-05-02 23:00 UTC (08:00 JST May 3), the bill date 2026-05-02 → midnight UTC 2026-05-02 → diff = 23h = within 48h. OK most of the time.
    - Edge case: bill dated 2026-04-30 12:00 JST, current 2026-05-02 12:00 JST. Bill date constructed as midnight UTC 2026-04-30 = -9h JST = 2026-04-29 15:00 JST. Now JST 2026-05-02 12:00 JST. Diff = 68 hours → REJECTED even though real bill is 48h fresh.

**Suggested fix**:
```js
// Add Reiwa era support
/令和\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g
// Convert: gregorian = 2018 + reiwa_year (令和元年 = 2019)

// Add MM/DD only (assume current year):
/(?:^|[\s、,])(\d{1,2})[\/\-](\d{1,2})\s+\d{1,2}[:：]\d{2}/g  // "5/2 16:56"

// Bump tolerance:
var cutoff = now.getTime() - (72 * 60 * 60 * 1000); // 72 hours

// Better date construction for Tokyo timezone:
// Construct the date as JST end-of-day so we compare against the latest possible JST time:
var dt = new Date(Date.UTC(y, mo - 1, d, 23, 59, 59) - 9 * 60 * 60 * 1000);
// (subtract 9h to get JST midnight in UTC ms)
```

**Severity**: **Low-Medium** — current logic passes when no date is found, so it's fail-open. The timezone edge case occasionally rejects legitimate bills near the 48h boundary.

---

## Layer 7 — Transaction Reference (`checkTransactionRef_`, lines 1038-1068)

**Status**: Em đã fix (added 取引番号 support).

**Quick re-audit**:

Current matchers:
1. `/取引[\s]*(?:番号|ID|No)[\s:：]*([A-Za-z0-9\s]{12,30})/i` — PayPay `取引番号` / `取引ID`
2. Stripped variant
3. `/(?:受付番号|受付\s*No|振込番号|整理番号|お取扱番号|認証番号|参照番号|ご依頼人番号)[\s:：]*([A-Z0-9\s]{6,25})/i` — bank refs
4. `/(\d{12,25})/` on stripped text — fallback long digit string
5. `/\b([A-Z]{2,4}\d{6,12})\b/` — Yucho-style alphanumeric

**Remaining failure modes**:

1. **PayPay receipts with shorter IDs**: PayPay personal transfer receipts sometimes show 「取引番号」 followed by an 8-digit OR 14-digit string. The current regex requires 12-30 alphanumeric. If actual ID is 11 chars → fails matcher #1, but is captured by **fallback #4** (12-25 digits) only if ≥12 digits.
   - **Risk**: 8-11 digit transaction IDs would fail. Mitigation: lower bound to 8.

2. **Lowercase characters in fallback #5**: `/\b([A-Z]{2,4}\d{6,12})\b/` is case-sensitive. If OCR returns lowercase `rt0m1234567`, no match. Add `/i` flag.

3. **Word boundaries with Japanese**: `\b` in JS doesn't work well around CJK chars. The fallback `\b([A-Z]{2,4}\d{6,12})\b` may fail when surrounded by 「番号RT0M1234567です」.

4. **「ご依頼人番号」** is in the regex but typo-prone. Add: 「お問合せ番号」「お問い合わせ番号」「処理番号」「明細番号」.

5. **Loose digit fallback (#4)** is permissive — any 12+ digit number passes. This is safety-net. **Good for fail-open.**

**Suggested fix**:
```js
// Lower threshold for PayPay short IDs
var paypayId = /取引[\s]*(?:番号|ID|No\.?)[\s:：]*([A-Za-z0-9\s\-]{8,30})/i.exec(text);

// Case-insensitive Yucho fallback
var alpha = /([A-Za-z]{2,4}\d{6,12})/.exec(text);

// Add bank ref keywords
var bankRef = /(?:受付番号|受付\s*No|振込番号|整理番号|お取扱番号|お取り扱い番号|認証番号|参照番号|ご依頼人番号|お問[合い]*せ番号|処理番号|明細番号)[\s:：]*([A-Za-z0-9\s\-]{6,25})/i.exec(text);
```

**Severity**: **Low** (already fixed by em). Minor tweaks for robustness.

---

## Layer 8 — Image Editor Signature (`checkImageEditorSignature_`, lines 1073-1111)

**Logic**: Decode first ~96KB of base64, scan ASCII text for editor strings (Photoshop, GIMP, Pixelmator, Snapseed, etc.).

**Failure modes for LEGIT bills**:

1. **iOS native screenshot**: No EXIF Software tag → `detected_editor: null` → passes ✓
2. **Android native screenshot**: Some Samsung/Xiaomi devices add `Software: SAMSUNG`. Not in editor list → passes ✓.
3. **iOS Photos app crop** (built-in editor): Adds 「Photos」 EXIF tag. NOT in current regex → passes ✓.
4. **HEIC → JPG conversion** (Mac auto-convert when sharing): adds `Apple` EXIF. Passes ✓.
5. **Edge-case false-positive**: If a bill text happens to contain the literal string "Snapseed" or "Photo Editor" (e.g., a bill from a photo-editing service receipt), Layer 8 would fail it. Very low risk for PayPay.

**Concern**: regex `/Photo\s*Editor/i` is **too generic** — would match any bill text mentioning "Photo Editor" (e.g., a transaction description). For example, if anh pays for a Photoshop subscription via PayPay and bill text contains "Adobe Photoshop", this would falsely flag.

**Suggested fix**:
- Make matching anchored to EXIF byte signatures rather than free ASCII scan. Concretely, look for the byte sequence `0x011 0x012` (EXIF Software tag) preceded by `0x00 0x69 0x87` (tag header).
- Or: only match in the **first 8KB** (where EXIF is) instead of 96KB (which may include compressed pixel data that occasionally decodes to letter-like bytes).

**Severity**: **Low** — for native PayPay screenshots, this layer rarely false-positives. But the broad `Photo Editor` regex is a future hazard.

---

## TOP 5 PRIORITIZED FIXES

| Rank | Layer | Issue | Impact | Effort |
|------|-------|-------|--------|--------|
| 1 | **L2 Recipient** | OCR misreads of "Thanghoang" have no fallback; PayPay UI strings (「送金先 Thanghoang」, 「宛先 Thanghoang」, partial-mask) not anchored | **HIGH** — most likely cause of anh's failure | 5 min: add 4-5 patterns |
| 2 | **L5 Completion** | 「送りました」 / 「送信日」 / 「受け取り」 not in keyword regex | **HIGH** — PayPay personal transfer wording | 2 min: extend regex |
| 3 | **L1 Amount** | `¥ 2,300` (space after symbol) and full-width digits 「２，３００」 not matched | **MEDIUM** — risk of OCR-induced failure | 5 min: regex + normalize |
| 4 | **L4 Source** | Cropped PayPay screenshots without literal "PayPay" word in cropped region; "Pay Pay" (space) misread | **MEDIUM** — adds resilience | 3 min: extend regex |
| 5 | **L6 Date** | Timezone construction off by 9h JST; 48h boundary too tight | **LOW-MEDIUM** — edge cases at 48h | 5 min: use Date.UTC + 72h |

---

## RECOMMENDED COMPOSITE PATCH (em apply after review)

```js
// ── L1: amount regex with space-tolerance + full-width digit normalization ──
var amountText = fullText
  .replace(/[０-９]/g, function(c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
  .replace(/[，]/g, ',');
var amountRegex = /(?:[¥￥Y]\s*|JPY\s*)?(\d{1,3}(?:,\d{3})+|\d{3,})\s*(?:円|yen)?/gi;
// (use amountText instead of fullText for amount matching only)

// ── L2: add OCR-tolerant + PayPay UI prefix patterns ──
{ regex: /送金先[\s:：]*(?:[T7]hang|タカハラ|ｹ?ｲｲﾁﾛｳ)/i,    name: 'PayPay 送金先' },
{ regex: /宛先[\s:：]*(?:[T7]hang|タカハラ)/i,                name: 'PayPay 宛先' },
{ regex: /thang[\s\-_]*hoa[nm][gq]/i,                       name: 'Thanghoang (OCR)' },

// ── L4: extend PayPay variants ──
{ regex: /paypay|pay\s*pay|ペイペイ|PayPayマネー|関東財務局長/i, name: 'PayPay' },

// ── L5: add 送り/送信/受取 ──
var keywords = /完了|送金|送り(?:ました)?|送信|送付|振込|お振込|振替|支払|お支払|領収|受取|受け取り|決済|成功|済|success|completed|paid|sent/i;

// ── L6: 72h tolerance + Reiwa era ──
var cutoff = now.getTime() - (72 * 60 * 60 * 1000);
// pattern: /令和\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g
//   gregorian_year = 2018 + reiwa_year
```

---

## Why anh's ¥2,300 PayPay bill likely failed

Most-probable rank order (best guess without seeing the actual screenshot/log):

1. **L2 Recipient (60% likely)**: OCR rendered "Thanghoang" with one mangled character, and no fallback caught it.
2. **L5 Completion (25% likely)**: The bill said 「送りました」 alone without 「送金」 or 「完了」.
3. **L7 Transaction ref (10% likely)**: Now fixed, but the previous version missing 取引番号 was the original cause.
4. **L4 Source (5% likely)**: PayPay logo cropped out of screenshot.

Recommend: **before applying patches, ask anh to paste the failure reason text** from the verify response. The string after 「❌」 will tell us EXACTLY which layer rejected the bill, eliminating guesswork.

---

*End of audit. Em (main) sẽ review và apply fixes sau khi anh xác nhận.*
