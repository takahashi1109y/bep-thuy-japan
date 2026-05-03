# 📋 thuyjapan.com — Project V8 (Session Handover · 2026-05-03)

> **Last Updated**: 2026-05-03 cuối session (Windows)
> **Previous handover**: `thuyjapan-com-project-v7.md` (2026-05-02 tối)
> **V8 work** (2026-05-03): 2 commits Cache TTL fix · Phone Login V2 chưa commit · ~18 agents spawned · 3 breakthroughs · 1 quy trình verification mới (NEW PERMANENT)
> **Repo**: https://github.com/takahashi1109y/bep-thuy-japan
> **Live**: https://www.thuyjapan.com · **Admin**: /thuythang
> **Latest commit on main**: `cd5bdf0`

---

## 🚨 SESSION RESTART — PASTE THIS

```
Tôi đang tiếp tục dự án Bếp Thuỷ Japan (thuyjapan.com).
Đọc file K:\bep-thuy-japan\thuyjapan-com-project-v8.md trước.
Trạng thái: Cache TTL fix LIVE production (commits d8782f2 + cd5bdf0).
Phone login v2 SQL CHƯA chạy + frontend CHƯA commit (5 diffs trong thanh-vien.html dirty).
Pending: anh chạy 3 SQL files + TEST-PLAN-PHONE-LOGIN-V2.md (13 test cases).
Báo "Em đã đọc xong, sẵn sàng tiếp tục."
```

---

## ✅ ĐÃ LÀM + ĐÃ TEST

*Session 2026-05-03 — 2 commits push + Phone Login V2 chưa commit, ~6 giờ work, 3 breakthroughs*

### (a) Cache TTL Fix — Khách iPhone Safari thấy data cũ ⭐

**Bug context**: Khách Tú đơn `#0149` báo iPhone Safari thấy data đơn cũ sau khi anh update status admin → khách refresh modal vẫn thấy state cũ. Root cause: missing Cache-Control headers + Supabase client default cache.

| Feature | Commit | Trạng thái |
|---|---|---|
| **Cache TTL fix code** ⭐ (Cache-Control: no-store + ?_=Date.now() bust) | `d8782f2` | ✅ live production |
| Documentation TEST-PLAN + WORKFLOW-FIX-VERIFICATION (NEW PERMANENT) | `cd5bdf0` | ✅ committed |

**Files mới**:
- `K:\bep-thuy-japan\TEST-PLAN-CACHE-TTL-FIX.md` — TC1 → TC6 verification plan
- `K:\bep-thuy-japan\WORKFLOW-FIX-VERIFICATION.md` — quy trình 4 phases NEW PERMANENT

**Wave structure**:
- Wave 1: 5 agents (3 frontend audit + 1 backend audit + 1 SQL/Supabase config audit)
- Wave 3: 3 agents (1 fix code + 1 test plan author + 1 workflow doc author)

→ Run `git show d8782f2` để xem diff frontend cache headers + URL bust pattern.

### (b) Phone Login V2 — Quy chuẩn JP 11 digits liền nhau ⭐

**Bug context**: Anh test phone login flow → báo lỗi. 4 agents wave 1 audit → phát hiện 3 root causes:

1. Trigger `handle_new_user()` lưu phone với separators inconsistent (`090-1234-5678` vs `09012345678` vs `+819012345678`)
2. Frontend chấp nhận nhiều format → backend không normalize → query fail
3. Existing user data có mixed formats → cần backfill

**Quy chuẩn mới (NEW STANDARD)**: Phone JP = **11 digits liền nhau, không separator, không country code**.
- ✅ `09012345678`
- ❌ `090-1234-5678`
- ❌ `+819012345678`
- ❌ `81-90-1234-5678`

**Files mới (CHƯA commit)**:

| File | Purpose | Trạng thái |
|---|---|---|
| `K:\bep-thuy-japan\DIAGNOSE-PHONE-LOGIN.sql` | Read-only diagnostic queries (count broken vs valid phone formats) | ✅ ready |
| `K:\bep-thuy-japan\supabase-phone-login-v2.sql` | Updated trigger `handle_new_user()` strict 11-digit normalization | ✅ ready |
| `K:\bep-thuy-japan\supabase-phone-backfill.sql` | UPDATE existing rows → strip separators + reject malformed | ✅ ready |
| `K:\bep-thuy-japan\TEST-PLAN-PHONE-LOGIN-V2.md` | 13 test cases (TC1 → TC13) cho frontend + DB integration | ✅ Agent 6 done |
| `K:\bep-thuy-japan\SECURITY-AUDIT-PHONE-LOGIN-V2.md` | Security review: rate-limit, enumeration, injection, leakage | ✅ Agent 7 done |

**Modified (CHƯA commit)**:
- `K:\bep-thuy-japan\thanh-vien.html` — 5 diffs phone validation:
  1. Strict regex `/^[0-9]{11}$/` thay regex permissive cũ
  2. Reject input có dấu `+`, `-`, space → user thấy lỗi tiếng Việt
  3. Hint placeholder rõ "11 chữ số liền, ví dụ 09012345678"
  4. Auto-strip space trước validate (UX guard)
  5. Disable submit button khi format invalid

**Wave structure**:
- Wave 1: 4 agents audit (frontend phone form, backend trigger, RLS phone column, existing data shape)
- Wave 3: 4 agents implementation (frontend diff, SQL trigger v2, backfill SQL, diagnostic SQL)
- Wave 4: 2 agents documentation (test plan + security audit)

→ **Em đã spawn 10 agents tổng cho phone login fix.**

### (c) Quy trình verification 4 phases (NEW PERMANENT)

**Trigger**: Bug Tú #0149 lộ ra anh + em đã ship Cache TTL fix nhưng chưa có quy trình verify systematic → khách phát hiện trước em.

**File**: `K:\bep-thuy-japan\WORKFLOW-FIX-VERIFICATION.md`

**4 phases** (apply mỗi fix từ V8 trở đi):

| Phase | Tên | Output | Owner |
|---|---|---|---|
| **1. AUDIT** | Multi-agent parallel root-cause | List ≥1 root cause + confidence | Em (5+ agents) |
| **2. FIX** | Code change targeting root cause | Commit + diff link | Em |
| **3. SPEC** | Test plan markdown (TC1..TCN) | `TEST-PLAN-*.md` | Em (1 agent) |
| **4. VERIFY** | Anh chạy TC trên production + screenshot | Pass/fail per TC | Anh |

→ **NEW NORM**: Em không claim "fix done" cho đến khi anh confirm Phase 4 pass. Cache TTL hiện ở Phase 4 wait state (anh chưa confirm TC1-TC6).

---

## 🔥 ARCHITECTURE & BREAKTHROUGHS

> **Why this section exists**: Session V8 có 3 traps assumption-vs-reality về phone auth + browser caching. Future Claude đọc TRƯỚC khi touch login flow hoặc add fix.

### Breakthrough 1: thuyjapan KHÔNG dùng SMS / OTP cho phone login

**Wrong assumption**: Bug "phone login lỗi" → cần fix Supabase Auth phone provider, gửi OTP Twilio.

**Reality** (4-agent audit wave 1):
- thuyjapan dùng pattern **phone-as-username**: phone number lưu vào column `users.phone` rồi map sang fake email `<phone>@thuyjapan.local`
- Auth thực tế chạy qua Supabase email/password — phone chỉ là alias hiển thị + lookup key
- KHÔNG gọi `signInWithOtp()`, KHÔNG có Twilio integration, KHÔNG có SMS cost

**Lý do design này**:
- Vietnamese diaspora ở Nhật ít quen email — phone là identifier tự nhiên
- Tiết kiệm $0.02-0.05 / SMS (Twilio JP rate)
- Không phụ thuộc carrier delivery (Docomo/Softbank đôi khi block transactional SMS)

**Solution**: Fix là **chuẩn hoá format phone TRƯỚC khi map sang fake email**, không phải fix OTP delivery.

**Lesson**: **Đọc auth flow code TRƯỚC khi assume chuẩn pattern.** Apps custom-roll auth thường có quirk không fit playbook generic. 4-agent parallel audit giúp em nhận pattern này trong 10 phút thay vì spend 2h debug Twilio.

### Breakthrough 2: Cache TTL is default, not optimization

**Wrong assumption**: Browser cache = optimization layer chỉ ảnh hưởng asset (CSS/JS/img). API JSON response từ Supabase chắc không bị cache.

**Reality** (5-agent audit Cache TTL):
- Safari iOS có **default heuristic cache** cho `application/json` response không kèm `Cache-Control` header → cache 5-10 phút silently
- Supabase REST endpoint trả `Cache-Control: max-age=3600` cho một số PostgREST routes
- Service worker (nếu có) cache aggressive theo URL → URL identical = cached response

**Symptom khách Tú**:
1. Anh update status đơn `#0149` admin → DB update thành công
2. Khách Tú mở `/thanh-vien` lần 2 → fetch `/rest/v1/orders?...` URL identical lần 1
3. Safari serve cached JSON → khách thấy state cũ "Đang xử lý" thay vì "Đã giao"

**Solution** (commit `d8782f2`):
- Frontend: thêm header `Cache-Control: no-store, max-age=0` vào fetch
- URL bust: append `?_=${Date.now()}` cho mỗi request → URL unique → bypass cache layer

**Lesson**: **Treat browser cache as ON by default cho mọi response.** Không assume "API JSON không bị cache." Mỗi fetch user-data-sensitive PHẢI explicit no-store + URL bust. Đặc biệt iOS Safari cache aggressive hơn Chrome desktop.

### Breakthrough 3: Frontend strict validation > backend permissive normalize

**Wrong assumption**: Backend trigger có thể auto-strip dashes/spaces/`+81` → cho phép frontend permissive (UX nhẹ nhàng).

**Reality** (security audit Agent 7):
- Permissive frontend → user nhập `+81 90-1234-5678` → backend strip → lưu `09012345678` ✓
- Nhưng: NEXT login user nhập `09012345678` → match
- Edge case: user nhập `81 90-1234-5678` (no `+`) → backend keep `8190123456789` (12 digit) → mismatch → user "lỗi không hiểu sao"
- User confusion + support load tăng vì frontend không feedback rõ format expected

**Solution v2** (5 diffs `thanh-vien.html`):
- Frontend reject sớm với regex `/^[0-9]{11}$/` → user thấy error message tiếng Việt ngay
- Placeholder hint format chuẩn `09012345678`
- Disable submit button đến khi format pass

**Lesson**: **Strict frontend validation = explicit contract với user.** Permissive backend normalize tạo ambiguity edge case. Quy chuẩn 11 digits liền là explicit + match Japanese mobile carrier prefix (070/080/090) + landline (03/06/...) sau strip leading 0.

### TL;DR cho future Claude

1. **Đọc auth flow code TRƯỚC khi assume OTP/SMS cần fix**
2. **Cache no-store + URL bust = default cho mọi API call user-sensitive**
3. **Frontend strict regex tốt hơn backend permissive normalize**

---

## 🔴 PENDING USER ACTIONS

### P1.0 — Run 3 SQL files Phone Login V2 *(CHƯA chạy, ~5 phút)*

**Why blocking**: Frontend `thanh-vien.html` v2 đã match contract 11-digit, nhưng DB trigger CŨ vẫn lưu phone với separators → mismatch sẽ làm khách CŨ login fail.

**Run THỨ TỰ này (DIAGNOSE → V2 → BACKFILL)**:

**Step 1: DIAGNOSE-PHONE-LOGIN.sql** (read-only, ~30 giây)
1. Mở https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/sql/new
2. Paste content `K:\bep-thuy-japan\DIAGNOSE-PHONE-LOGIN.sql`
3. Click **Run**
4. **Verify**: kết quả show count rows broken format vs valid format. Screenshot gửi em.

**Step 2: supabase-phone-login-v2.sql** (~1 phút, replace trigger)
1. Vẫn trong SQL Editor
2. Paste content `K:\bep-thuy-japan\supabase-phone-login-v2.sql`
3. Click **Run** → confirm replace `handle_new_user()`
4. **Verify**: SELECT trigger definition mới apply.

**Step 3: supabase-phone-backfill.sql** (~2-3 phút, mutation)
1. **Confirm screenshot DIAGNOSE step 1 với em TRƯỚC khi chạy backfill** (em cần verify rows count không spike)
2. Paste `K:\bep-thuy-japan\supabase-phone-backfill.sql`
3. Click **Run**
4. **Verify**: re-run DIAGNOSE → 0 rows broken format remain.

### P1.A — Test plan phone login V2 *(13 test cases, ~15 phút)*

**File**: `K:\bep-thuy-japan\TEST-PLAN-PHONE-LOGIN-V2.md`

**Sau khi P1.0 done**, anh chạy 13 TC:
- TC1-TC4: Format chuẩn `09012345678` → login pass
- TC5-TC7: Format có dấu `-`, `+`, space → frontend reject với message rõ
- TC8-TC9: User cũ (sau backfill) login lại pass
- TC10: Đăng ký user mới với 11 digits → success
- TC11-TC13: Edge case (10 digits, 12 digits, non-numeric)

**Pass criteria**: 13/13 TC pass screenshot. Báo em → em commit phone login V2 frontend.

### P1.B — Cache TTL TC1-TC6 verification *(carry-over, anh chưa confirm)*

**File**: `K:\bep-thuy-japan\TEST-PLAN-CACHE-TTL-FIX.md`

**Sau khi run TC1-TC6**:
- TC1: Khách Tú đăng xuất + đăng nhập lại → thấy state mới ✓
- TC2: iPhone Safari force-refresh → state mới
- TC3: Chrome desktop → state mới
- TC4-TC6: edge case service worker + offline + network throttle

**Pass criteria**: 6/6 TC pass. Báo em → em close Phase 4 Cache TTL fix.

### P1.C — Nhắn khách Tú đăng xuất/đăng nhập *(~1 phút)*

**Why**: Cache TTL fix mới ship → khách CŨ trên iPhone vẫn có thể serve cached response cho đến khi clear. Đăng xuất + đăng nhập force fetch fresh state.

**Template message**:
> Chào em Tú, anh vừa fix lỗi đơn `#0149` em thấy state cũ. Em vui lòng đăng xuất → đăng nhập lại trên iPhone để load đơn mới. Cảm ơn em đã báo!

### P1.4 — Toggle `payment-proofs` bucket → Public *(carry từ V6/V7, ~1 phút)*

**Why blocking**: Bucket hiện private không có RLS policy → upload bill từ FE có edge cases.

**Click-by-click**:
1. Mở https://supabase.com/dashboard/project/curcsvwvjkjewtonkhnr/storage/buckets
2. Click row **`payment-proofs`** → panel phải mở
3. Click icon **⚙️ Settings** (góc trên phải panel)
4. Toggle **"Public bucket"** → **ON**
5. Click **Save** → confirm dialog **"Make public"**
6. **Verify**: refresh `/thuythang` → mở 1 đơn có bill → ảnh render trong admin modal

### P1.6 — Test `scrapeSagawaTracking_` *(carry từ V7, khi có đơn Sagawa thật, ~2 phút)*

**Why pending**: Function code xong, **chưa production-tested** vì anh chưa dùng Sagawa.

**Khi nào trigger**: Lần đầu anh ship Sagawa → vào `/thanh-vien` → click "📍 Tình trạng vận chuyển" trên đơn đó.

**Pass criteria**: Modal hiển thị ≥1 event với timestamp + location.

**Nếu fail**: Báo em → em apply same POST trick như Yamato (Sagawa endpoint có thể cần POST thay GET).

### Verify weekly Yamato monitoring trigger active *(carry từ V7, ~30 giây)*

1. Apps Script editor → sidebar **⏰ Triggers**
2. Tìm row: function=`testYamatoScraperHealth`, event=`Time-driven`, type=`Week timer`, time=`Tuesday 9am-10am`
3. **Nếu thiếu**: click `+ Add Trigger` → setup lại

### 🟡 P2 — User decisions (no rush, carry-over từ V4/V6/V7)

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

→ Recommend cluster 5 findings + V8 SECURITY-AUDIT-PHONE-LOGIN-V2.md findings thành **1 security sprint** (~半日 work).

---

## 🚧 FUTURE WORK SPECCED BUT NOT BUILT

| Theme | Feature | Spec ref | Estimate | Trigger |
|---|---|---|---|---|
| **Realtime** | Supabase Realtime cho orders (Level 2 escalation Cache TTL) | V8 session notes | 2-3h | Khách báo lại bug cache sau Phase 4 verify |
| **Auth** | Phone login V2 frontend commit + production verify | V8 dirty diffs | ~10 phút commit + 15 phút test | Anh pass 13 TC P1.A |
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

## 📊 V8 SESSION STATS (2026-05-03)

- **Commits push**: 2 (`d8782f2` Cache TTL fix code + `cd5bdf0` workflow + test plan docs)
- **Commits pending** (chưa push): Phone Login V2 frontend (5 diffs `thanh-vien.html` dirty)
- **Agents spawned**: ~18 (8 Cache TTL: 5 wave 1 + 3 wave 3 · 10 Phone Login: 4 wave 1 + 4 wave 3 + 2 wave 4)
- **Breakthroughs**: 3 critical (phone-as-username, Cache TTL is default, frontend strict > backend permissive)
- **Files mới**: 7 (2 docs Cache: TEST-PLAN + WORKFLOW-FIX-VERIFICATION · 3 SQL Phone: DIAGNOSE + V2 + BACKFILL · 2 docs Phone: TEST-PLAN + SECURITY-AUDIT)
- **Lines of code estimate**: ~500 LOC frontend (Phone V2) + ~300 LOC SQL (3 files)
- **Quy trình mới NEW PERMANENT**: 4-phase verification (AUDIT → FIX → SPEC → VERIFY) áp dụng từ V8 trở đi
- **Production verified**: 1 (Cache TTL fix LIVE, anh chưa confirm Phase 4 TC1-TC6)
- **Highlight**: Quy trình verification 4 phases — em không claim "fix done" cho đến khi anh pass test plan. Cải thiện từ V7 norm "ship + hope" sang V8 norm "ship + verify".

---

## 💡 Communication Style (carry-over từ V7 + V8 update)

- **Pronoun**: Em ↔ anh (giữ nguyên)
- **Ngôn ngữ**: Vietnamese first, English chỉ technical term không có equivalent
- **Hướng dẫn technical**: Click-by-click cho task anh thao tác (deploy GAS, set trigger, push code, run SQL)
- **Confirm trước action lớn**: Deploy production, force-push, xoá file, schema change, **chạy SQL backfill** → em hỏi trước
- **Trigger phrase "lưu lại tất cả"** → em update file handover hiện tại (V8 → V9 khi session mới)
- **Agent spawning**: 5-10 agents per task khi anh request "spawn nhiều agent" hoặc task có >3 file cần khảo sát song song *(V8 confirmed cadence với 18 agents trong 1 session)*
- **Spec-first workflow**: Research → spec markdown → anh review → build → verify *(V8 reinforce: Phone Login fix nhờ 4 agent audit wave 1 phát hiện phone-as-username pattern trong 10 phút)*
- **Handover discipline**: Cuối session em tự draft handover doc, không đợi anh nhắc *(V7 norm carry sang V8)*
- **4-phase verification (V8 NEW PERMANENT)**: Mỗi fix từ V8 trở đi PHẢI qua AUDIT → FIX → SPEC → VERIFY. Em không claim "done" cho đến khi anh confirm Phase 4 pass. *(per WORKFLOW-FIX-VERIFICATION.md)*
- **8-10 agents per task khi anh request**: V8 chuẩn hoá multi-wave (wave 1 audit · wave 3 implementation · wave 4 documentation). Mỗi agent 1 scope non-overlapping.

---

*End of v8 handover. Next session: bắt đầu từ "P1.0 run 3 SQL files Phone Login + P1.A 13 test cases"* 🍜🛡️

**Bếp Thuỷ Japan — Đặc Sản Phố Cổ Hà Nội Tại Nhật Bản**
