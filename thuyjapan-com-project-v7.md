# 📋 thuyjapan.com — Project V7 (Session Handover · 2026-05-02)

> **Last Updated**: 2026-05-02 cuối session (Windows)
> **Previous handover**: `thuyjapan-com-project-v6.md` (2026-05-02 sáng)
> **V7 work** (2026-05-02 tối): 9 commits · tracking modal end-to-end · Yamato POST breakthrough · weekly monitoring trigger · 30+ agents spawned
> **Repo**: https://github.com/takahashi1109y/bep-thuy-japan
> **Live**: https://www.thuyjapan.com · **Admin**: /thuythang
> **Latest commit on main**: `2b76345`

---

## 🚨 SESSION RESTART — PASTE THIS

```
Tôi đang tiếp tục dự án Bếp Thuỷ Japan (thuyjapan.com).
Đọc file K:\bep-thuy-japan\thuyjapan-com-project-v7.md trước.
Trạng thái: Yamato real-time tracking đang chạy production (commit c9289d9).
Auto-monitoring weekly Tuesday 9am JST đã active.
Pending: P1.4 storage bucket toggle public + P1.6 test Sagawa khi có đơn.
Báo "Em đã đọc xong, sẵn sàng tiếp tục."
```

---

## ✅ ĐÃ LÀM + ĐÃ TEST

*Session 2026-05-02 — 9 commits, ~5 giờ work, 1 critical breakthrough*

### (a) Tracking Modal Fixes — `/thanh-vien`

3 bugs liên tiếp khiến modal tracking không usable. Fix theo thứ tự: data binding → positioning → styling override.

| Feature | Commit | Trạng thái |
|---|---|---|
| Modal "Không tìm thấy đơn hàng" — assign `window.allOrders` + String cast | `c5d7fee` | ✅ test pass 2 accounts |
| Modal positioning (centered) — items-start → items-center | `27d7fb7` | ✅ working |
| Tailwind purge bypass — convert to inline style | `57d2ce8` | ✅ working |

### (b) Yamato Scraper Breakthrough ⭐ — Critical win

Yamato tracking từ "luôn fail" → "real data". Anh confirmed thấy 2-3 events thật trong modal cho đơn `389858076156`.

| Feature | Commit | Trạng thái |
|---|---|---|
| **Yamato POST + new HTML parser** ⭐ | `c9289d9` | ✅ production verified |
| Strip dashes tracking_no + skip cache empty events | `ec99a5b` | ✅ working |
| JP-only Amazon timeline (formatDateJP "5月2日（土）") + remove redundant button | `af8eb5f` | ✅ working |

→ Run `git show c9289d9` để xem POST payload + parser logic. Section breakthrough bên dưới giải thích lý do.

### (c) Auto-Monitoring — Weekly health check

Detect khi Yamato thay HTML structure → alert sớm trước khi khách phàn nàn.

| Feature | Commit | Trạng thái |
|---|---|---|
| **`testYamatoScraperHealth` weekly Tuesday 9am JST** ⭐ | `b0bcc5e` | ✅ test PASS "Found 3 events" |
| try/catch wrap getProjectTriggers + UI manual fallback | `2b76345` | ✅ working |

### (d) UX Phase 1 — Friendly empty states

| Feature | Commit | Trạng thái |
|---|---|---|
| Phase 1 status-aware empty messages + shipped date pill | `a868c09` | ✅ working |

→ Foundation cho future Phase 2 (modal real-time polling — chưa scope).

---

## 🔥 ARCHITECTURE & BREAKTHROUGHS

> **Why this section exists**: Session này em rơi vào 3 traps assumption-vs-reality. Future Claude đọc TRƯỚC khi touch tracking/UI/triggers.

### Breakthrough 1: Yamato chấp nhận POST request (không phải SPA pure)

**Wrong assumption**: Yamato website là SPA JS-rendered → UrlFetchApp không scrape được → phải dùng headless browser hoặc bỏ Yamato.

**Reality** (5-agent audit + curl live test):
- Endpoint `https://toi.kuronekoyamato.co.jp/cgi-bin/tneko` HỖ TRỢ POST với form-encoded body
- Response: HTML 200 OK ~29KB server-side rendered

```
POST /cgi-bin/tneko HTTP/1.1
Content-Type: application/x-www-form-urlencoded
Body: number00=1&number01=389858076156
```
- `number00=1` = "show detailed tracking info" flag
- `number01` = first parcel tracking number
- Response chứa `<div class="tracking-invoice-block-detail">`:
  ```html
  <li>
    <div class="item">荷物受付</div>
    <div class="date">5月02日 15:33</div>
    <div class="name">松戸主水新田営業所</div>
  </li>
  ```

**Solution** (commit `c9289d9`):
- `UrlFetchApp.fetch(url, {method: 'post', payload: 'number00=1&number01=' + cleanNo})`
- Parse date "5月02日 15:33" với `currentYear` inference
- Regex extract `<li>...</li>` blocks

**Lesson**: **TEST với curl TRƯỚC khi assume infrastructure pattern.** Một page có thể serve hoàn toàn khác giữa GET (SPA shell) và POST (server-rendered). 5-agent parallel audit + 1 curl command đã save weeks of headless browser engineering.

### Breakthrough 2: Tailwind pre-compiled CSS không có arbitrary values

**Wrong assumption**: Add Tailwind classes mới (`z-[9999]`, `max-h-[90vh]`, `pt-12`) → browser sẽ apply.

**Reality**:
- `assets/tailwind.css` LÀ pre-compiled output build MANUAL trên macOS dev machine
- KHÔNG auto-rebuild khi push Cloudflare
- Arbitrary values + một số standard utilities KHÔNG có trong compiled output → browser silently ignore

**Solution** (commit `57d2ce8`):
```html
<!-- BEFORE (broken) -->
<div class="fixed z-[9999] max-h-[90vh] pt-12">

<!-- AFTER (works) -->
<div class="fixed" style="z-index:9999; max-height:90vh; padding-top:3rem">
```

**Lesson**: **Pre-compiled Tailwind = closed set của classes.** Trước khi add class mới: `grep -F "z-\[9999\]" assets/tailwind.css` để verify class exists. Nếu KHÔNG có → dùng inline `style=""` HOẶC rebuild CSS locally + commit. NEVER assume Tailwind JIT khi không thấy build step trong CI.

### Breakthrough 3: Apps Script installable triggers cần scope `script.scriptapp` riêng

**Wrong assumption**: Function dùng `ScriptApp.newTrigger().timeBased()` → Apps Script Editor sẽ auto-prompt authorization.

**Reality**:
- Project trước CHỈ dùng simple triggers (`onEdit`) — KHÔNG cần scope `script.scriptapp`
- Functions mới cần scope `https://www.googleapis.com/auth/script.scriptapp` (installable triggers management)
- Apps Script Editor **KHÔNG tự re-prompt** cho code mới khi project đã có existing authorization
- Symptom: "Specified permissions are not sufficient" trong execution log

**Solution** (commit `2b76345`):
- Try/catch wrap `getProjectTriggers()` cho graceful degradation
- **PREFERRED**: UI manual setup bypass code authorization
  - Apps Script Editor → ⏰ Triggers (sidebar icon thứ 4) → `+ Add Trigger`
  - Choose function `testYamatoScraperHealth` → Time-driven → Week timer → Tuesday 9am-10am
  - UI flow trigger Google's standard OAuth consent → user grant scope → trigger lưu vĩnh viễn

**Lesson**: **Simple triggers ≠ installable triggers về OAuth scope.** Khi adding code touch `ScriptApp.newTrigger()` vào project hiện chỉ có simple triggers: code-based setup sẽ silent-fail. UI manual setup là path AN TOÀN.

### TL;DR cho future Claude
1. **Curl POST trước khi assume SPA**
2. **Grep compiled CSS trước khi add Tailwind class**
3. **UI manual setup cho installable triggers**, không trust `ScriptApp.newTrigger()` auto-auth

---

## 🔴 PENDING USER ACTIONS

### P1.4 — Toggle `payment-proofs` bucket → Public *(carry từ V6, ~1 phút)*

**Why blocking**: Per V6 `AUDIT-STORAGE-RLS.md`, bucket hiện private không có RLS policy → upload bill từ FE có edge cases.

**Click-by-click**:
1. Mở https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/storage/buckets
2. Click row **`payment-proofs`** → panel phải mở
3. Click icon **⚙️ Settings** (góc trên phải panel)
4. Toggle **"Public bucket"** → **ON**
5. Click **Save** → confirm dialog **"Make public"**
6. **Verify**: refresh `/thuythang` → mở 1 đơn có bill → ảnh render trong admin modal

### P1.6 — Test `scrapeSagawaTracking_` *(khi có đơn Sagawa thật, ~2 phút)*

**Why pending**: Function code xong, **chưa production-tested** vì anh chưa dùng Sagawa.

**Khi nào trigger**: Lần đầu anh ship Sagawa → vào `/thanh-vien` → click "📍 Tình trạng vận chuyển" trên đơn đó.

**Pass criteria**: Modal hiển thị ≥1 event với timestamp + location.

**Nếu fail**: Báo em → em apply same POST trick như Yamato (Sagawa endpoint có thể cần POST thay GET).

### Verify weekly Yamato monitoring trigger active *(~30 giây)*

Anh đã confirm `testYamatoScraperHealth` PASS manual. Cần verify trigger row đã thực sự được tạo:

1. Apps Script editor → sidebar **⏰ Triggers**
2. Tìm row: function=`testYamatoScraperHealth`, event=`Time-driven`, type=`Week timer`, time=`Tuesday 9am-10am`
3. **Nếu thiếu**: click `+ Add Trigger` → setup lại

### 🟡 P2 — User decisions (no rush, carry-over từ V4/V6)

| # | Item | Why | Source ref |
|---|---|---|---|
| 1 | Add daily trigger `sendDailyProductionReport` 23h JST | Email báo cáo sản xuất | V4 doc |
| 2 | Decide PayPay for Business application | 1.98% fee + bullet-proof verify | V6 HUONG-DAN-PAYPAY-BUSINESS.md |
| 3 | Update 定款 食品の販売 | Required cho PayPay Business | V6 doc |
| 4 | 食品衛生 license check (liên hệ 行政書士) | Required for legitimate food sales | V6 doc |
| 5 | Rotate JWT secret on Supabase Dashboard | Old service_role JWT từng commit git history | V3 doc |
| 6 | Apple Developer Team ID + TestFlight build | Block iOS app submission | V4 doc |
| 7 | Tạo Firebase project for push notifications | Required cho mobile app push | V4 doc |
| 8 | Verify Microsoft Clarity sau ~1 tuần data | Heatmap setup | V4 doc |
| 9 | TPCN site launch decision (Shopify or wait) | New business line | V6 TPCN-SITE-MVP-PLAN.md |

### 🟠 P3 — Security findings từ V6 SECURITY-REVIEW (carry-over)

5 critical findings chưa fix:
1. Signed URLs valid 1 năm — token leak = ai cũng access bill
2. `admin_force_approve_payment` KHÔNG verify caller is admin — anyone with Apps Script URL can spoof
3. Vision API không disclose trong privacy.html — vi phạm APPI 24/27
4. Audit log chỉ cover RPC mới, paths cũ (verify_payment_confirmation, cancel_order) không log
5. Telegram bot token + Supabase service_role + Vision key tập trung 1 chỗ — single point of failure

→ Recommend cluster 5 findings thành **1 security sprint** (~半日 work) thay vì rải rác.

---

## 🚧 FUTURE WORK SPECCED BUT NOT BUILT

| Theme | Feature | Spec ref | Estimate | Trigger |
|---|---|---|---|---|
| **Tracking** | AfterShip API integration (Phase 2 fallback) | V7 session notes | 2-3h em + 30 phút anh setup key | Yamato thay HTML → POST trick fail |
| **Tracking** | Modal real-time polling (30s khi mở) | V7 session notes | ~1h | Khách quan sát mở modal >2 phút |
| **Tracking** | Sagawa scraper test + fix | `scrapeSagawaTracking_` | 30 phút | Lần đầu anh ship Sagawa (P1.6) |
| **Backend** | Reject/refund flow with email | V6 SPEC-REJECT-REFUND-FLOW.md | ~3h | Khách đầu tiên cần refund |
| **Backend** | Email 4-5-6 auto-trigger | V6 EMAIL-CUSTOMER-JOURNEY.md | ~1.5h | Sau khi reject/refund flow done |
| **Backend** | PayPay Business API integration | V6 HUONG-DAN-PAYPAY-BUSINESS.md | 3-5 days | Sau khi anh có PayPay merchant account |
| **Admin** | Audit log table + UI | V6 SPEC-AUDIT-LOG.md | ~4h | Compliance/dispute traceability |
| **Admin** | Toast UX thay native `alert()` | V7 carry-over | ~1h | Anh request polish UX |
| **iOS** | Native enhancements + App Store submission | V6 iOS spec | 3-5 days dev + 1-2 weeks Apple review | Sau khi web flow stable 2-4 weeks |
| **Marketing** | Phase C inventory: thêm sản phẩm mới | V6 Phase C doc | ~2h | Anh có SKU mới ready bán |
| **Marketing** | TPCN site Shopify build | V6 TPCN-SITE-MVP-PLAN.md | 8 weeks | Sau khi Bếp Thuỷ stable + có budget |
| **Em (Claude)** | PayPay for Business research + draft application | V7 carry-over | ~1-2h | Anh confirm muốn apply |
| **Em (Claude)** | Tinh chỉnh email báo cáo sản xuất | V7 carry-over | ~30 phút | Anh feedback format hiện tại |

---

## 📊 V7 SESSION STATS (2026-05-02)

- **Commits**: 9 commits trong 1 ngày (`c5d7fee` → `2b76345`)
- **Code delta**: ~230 insertions, ~75 deletions
- **Files chính**: 2 (`thanh-vien.html`, `google-apps-script.js`)
- **Agents spawned**: ~30+ across 6 waves (5+8+5+5+5+8 = 36 agents)
- **Breakthroughs**: 3 critical (Yamato POST trick, Tailwind purge gotcha, ScriptApp scope learning)
- **Production verified**: 1 (Yamato real-time tracking đang chạy live, anh tested 2 accounts)
- **Highlight**: Yamato POST direct trick → bypass cần AfterShip → **$0 ongoing cost** thay vì $9-29/tháng nếu scale paid
- **Time to production**: same-day ship (research → spec → build → deploy → verify trong 1 session)

---

## 💡 Communication Style (carry-over từ V6 + V7 update)

- **Pronoun**: Em ↔ anh (giữ nguyên)
- **Ngôn ngữ**: Vietnamese first, English chỉ technical term không có equivalent
- **Hướng dẫn technical**: Click-by-click cho task anh thao tác (deploy GAS, set trigger, push code)
- **Confirm trước action lớn**: Deploy production, force-push, xoá file, schema change → em hỏi trước
- **Trigger phrase "lưu lại tất cả"** → em update file handover hiện tại (V7 → V8 khi session mới)
- **Agent spawning**: 5-8 agents per task khi anh request "spawn nhiều agent" hoặc task có >3 file cần khảo sát song song *(V7 confirmed cadence qua 6 waves)*
- **Spec-first workflow**: Research → spec markdown → anh review → build → verify *(V7 reinforced: Yamato breakthrough nhờ research kỹ trước khi code)*
- **Handover discipline**: Cuối session em tự draft handover doc, không đợi anh nhắc *(new V7 norm)*

---

*End of v7 handover. Next session: bắt đầu từ "Verify trigger active + P1.4 storage bucket"* 🍜🛡️

**Bếp Thuỷ Japan — Đặc Sản Phố Cổ Hà Nội Tại Nhật Bản**
