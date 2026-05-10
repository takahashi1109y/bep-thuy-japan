# LESSONS LEARNED — Sessions 2026-05-10 + 2026-05-11

**Tác giả**: Claude (Em) self-reflection
**Mục đích**: Anh tham khảo + extract các rules quan trọng vào `CLAUDE.md`
**Tổng commits**: 20+ trong 2 sessions
**Tổng features**: Welcome bonus E2E, P1 anti-fraud (4 layers), Birthday anti-fraud (4 layers), Referral Program (5/7 phases)

---

## 📚 12 BÀI HỌC CHÍNH

### **1. Tailwind precompiled bundle pitfall** ⚠️

**Vấn đề**: Site dùng Tailwind precompiled (KHÔNG phải JIT runtime). Khi em thêm class mới chưa từng dùng (vd `bg-pink-500`, `grid-cols-3`, `gap-1`, `py-2.5`, `sm:text-sm`) → KHÔNG có trong CSS bundle → button transparent + text-white invisible.

**Symptom**: Anh thấy 3 emoji icons không có background (Phase 4 referral UI).

**Fix**: Convert sang inline style cho components mới quan trọng.

**Rule mới đề xuất**:
> Trước khi dùng Tailwind class, **GREP existing usage** trong code. Nếu chưa từng dùng → kiểm tra với `getComputedStyle()` hoặc convert inline style luôn.

---

### **2. GR Personalization tag format** ⚠️

**Vấn đề**: GR auto-strip prefix `cus ` khi save template. Tag custom field đúng: `[[fieldname]]` (KHÔNG `[[cus fieldname]]`).

**Symptom**: 44 contacts cũ nhận email với token rỗng → click "Link không hợp lệ".

**Fix**: 
- Verify tag format qua icon "AB" (Personalization picker) trong template editor
- Test/Preview của GR KHÔNG resolve personalization → phải test với autoresponder thực
- Autoresponder Day 0 chỉ fire **1 lần per contact lifetime** → muốn re-test phải xóa contact GR

**Rule mới đề xuất**:
> **GR test paradigm**: KHÔNG tin tưởng Preview/Send Test. Luôn test bằng signup mới + verify URL trong inbox thật. Email cron one-shot — phải clean GR contact trước khi re-test.

---

### **3. Race condition signup → Apps Script `getBonusToken_(undefined)`** ⚠️

**Vấn đề**: Frontend KHÔNG truyền `userId` trong payload signup → Apps Script `getBonusToken_(undefined)` → return null → `addToGetResponse(...null)` → contact GR không có token.

Plus: Supabase trigger `handle_new_user` có thể chưa chạy xong khi Apps Script GET profile (race).

**Fix kép**:
1. Frontend pass `userId: data.user.id` vào payload
2. Apps Script retry 3 lần với backoff 500ms/1000ms

**Rule mới đề xuất**:
> Khi data flow qua nhiều layers (DB trigger → Apps Script → API), assume race condition. Implement retry với backoff. Plus: data contract (Rule 5.1 hiện có) phải explicit list mọi field.

---

### **4. GR API customFieldId vs URL slug** ⚠️

**Vấn đề**: URL slug `hFPqBk` (UI) ≠ API `customFieldId` `nQIhVt`. Em dùng slug → 100% requests fail "Custom field invalid".

**Fix**: Gọi GR API `GET /v3/custom-fields` để lấy ID đúng.

**Rule mới đề xuất**:
> **3rd-party API**: KHÔNG đoán ID từ URL UI. Luôn query API endpoint trả về ID chuẩn. Document ID format trong reference memory file.

---

### **5. CLAUDE.md Level 3 process critical** ⚠️

**Vấn đề**: Em làm các Level 3 tasks (DB migration, RPC, trigger lock) mà KHÔNG dừng chờ duyệt theo CLAUDE.md.

**Anh nhắc**: "luôn làm theo quy trình có trong CLAUDE.md nhé" → em phải re-read và tuân thủ.

**Fix**: Phase 4 trở đi em đã:
- Plan trước khi code
- Pause sau mỗi phase chờ approve
- Verify edge cases manually trace

**Rule đã có trong CLAUDE.md** Section 2 (Level 3) — em chỉ cần TUÂN THỦ.

---

### **6. Anti-fraud defense in depth** 🛡️

**Pattern thành công**: Welcome bonus + Birthday discount + Referral đều dùng combo nhiều layers:
- UNIQUE canonical_email (block alias)
- UNIQUE phone (block fake SIM)
- IP rate limit 24h (block bot)
- Device fingerprint (block VPN bypass)
- Lifetime cap (block runaway abuse)
- Telegram alert (manual review threshold)

**Lý do work**: Single layer KHÔNG đủ. Attacker nào cũng có thể bypass 1 layer, nhưng combo 5+ layers → cost effort cao hơn benefit.

**Trade-off**: More layers = more friction cho khách thật (vd birthday lock không sửa được) → cần balance UX vs security.

**Rule mới đề xuất**:
> Mọi promotion/discount feature mới BẮT BUỘC có ≥3 anti-fraud layers + 1 manual review (Telegram alert). Document trade-off khách thật trong SPEC.

---

### **7. User-controlled fields fraud vector** ⚠️

**Vấn đề**: birthday, referral_code (nếu user tạo), discount eligibility — đều là user-controlled → easy abuse.

**Fix**:
- **Birthday**: Lock after first set (trigger `trg_lock_birthday`) + age threshold 30 days + 365-day cooldown
- **Referral**: 5 self-refer checks (email/phone/IP/device/cap)

**Rule mới đề xuất**:
> Bất kỳ field user input → hash thành "trust signal" có thể abuse. Backend BẮT BUỘC validate qua RPC + lock immutable sau lần đầu set + telemetry alert.

---

### **8. Email reminder bulk send quota constraint** 📧

**Vấn đề**: Workspace 1500/day, Free Gmail 100/day. Send 143 emails reminder → quota run out at 40, fail 103.

**Fix**:
- Function tự skip người đã claim → run lại next day không duplicate
- Try/catch per email → quota error không crash function
- Log `MailApp.getRemainingDailyQuota()` để biết quota còn

**Rule mới đề xuất**:
> Bulk send emails: BẮT BUỘC kiểm tra `getRemainingDailyQuota()` trước. Function phải idempotent (skip người đã processed). Plan multi-day batching nếu N > quota/day.

---

### **9. GR autoresponder 1-time fire per contact** 🔁

**Vấn đề**: Contact `yennguyen1606y@gmail.com` đã nhận Day 0 (broken token) → đăng ký lại CÙNG email → GR trả 409 already exists → KHÔNG re-fire Day 0.

**Fix**: Xóa contact GR trước khi đăng ký lại OR dùng email khác hoàn toàn.

**Rule mới đề xuất**:
> GR autoresponder = one-shot per contact lifetime. Test scenario phải document: "Step 1 — xóa GR contact, Step 2 — register, Step 3 — check email". Documentation rõ trong SPEC.

---

### **10. Cancel order vs cancel points logic mismatch** ⚠️

**Vấn đề**: cancel_order RPC chỉ refund `points_used` nhưng KHÔNG revoke `points_earned` (vì earn award khi delivered, không pending).

**Cảnh báo**: Nếu admin "lỡ tay" mark delivered rồi cancel → khách giữ điểm earn. Hiện chưa có revoke logic.

**Discovery**: Anh thấy 2 orders 0187/0188 cancelled nhưng có earn=100 → root cause là legacy migration cleanup hôm trước (KHÔNG phải bug cancel).

**Rule mới đề xuất**:
> Status transitions với side effects (award/revoke) phải có **idempotent revoke logic**. Document trong handover khi pattern chưa hoàn thiện. Add to TODO list rõ ràng.

---

### **11. Browser MCP automation best practices** 🌐

**Đã học**:
- `read_page` + `find` (semantic) > coordinate-based clicks (fragile vì layout shift)
- `javascript_tool` execute để inspect computed styles tốt hơn screenshot guessing
- `sessionStorage` persist qua redirect, `localStorage` persist forever — chọn đúng theo use case
- `browser_batch` 1 round-trip nhiều actions = nhanh hơn nhiều

**Rule mới đề xuất**:
> Browser automation: ưu tiên semantic selector (find/read_page). Coordinate clicks chỉ fallback. Plus: dùng `browser_batch` cho 2+ actions liên tiếp.

---

### **12. Tools availability pitfalls** 🛠️

**Đã gặp**:
- Node.js KHÔNG có sẵn trên Windows → dùng PowerShell hoặc trace logic bằng tay
- GR API session cookies KHÔNG cho phép internal `/v3/` calls qua browser → phải dùng Apps Script với `X-Auth-Token` header
- Supabase SQL Editor auto-rollback uncommitted transactions khi session reset → DO blocks atomic > BEGIN/COMMIT manual

**Rule mới đề xuất**:
> Verify tool availability TRƯỚC khi assume. Document fallback path khi tool primary fail.

---

## 🎯 ĐỀ XUẤT THÊM CLAUDE.md

### Section 8 — TAILWIND/CSS RULES (mới)

```markdown
## Rule 8.1 — Tailwind precompiled bundle pitfall

Site dùng Tailwind precompiled (KHÔNG JIT). Class mới chưa từng dùng có thể
KHÔNG có trong bundle → silent fail (transparent bg, missing layout).

**Bắt buộc**:
1. Trước khi dùng Tailwind class, GREP existing usage trong code
2. Nếu chưa có → verify với getComputedStyle() khi browser test
3. Hoặc convert inline style cho components quan trọng

**Ví dụ vi phạm 2026-05-11 (Phase 4 referral UI)**:
- Class `bg-pink-500`, `grid-cols-3`, `gap-1` không có trong bundle
- 3 share buttons transparent + stack vertical thay 3 cols
```

### Section 9 — 3RD-PARTY API RULES (mới)

```markdown
## Rule 9.1 — Never assume ID from URL UI
GR/Stripe/etc. có thể có URL slug ≠ API ID. Luôn query API endpoint
trả về ID chuẩn. Document trong reference memory file.

**Ví dụ vi phạm 2026-05-10**: GR URL `hFPqBk` (UI slug) ≠ API `nQIhVt`
→ 171 contacts sync sai 100%.

## Rule 9.2 — One-shot APIs phải document state machine
GR autoresponder Day 0 = one-shot per contact lifetime. Test scenario
phải document Step 1 (xóa contact) → Step 2 (register) → Step 3 (verify).
```

### Section 10 — ANTI-FRAUD RULES (mới)

```markdown
## Rule 10.1 — Defense in depth (≥3 layers + manual review)
Mọi promotion feature BẮT BUỘC ≥3 anti-fraud layers + Telegram alert.
Document trade-off khách thật trong SPEC.

Layers chuẩn:
- Identity: UNIQUE email/phone/canonical
- Behavioral: IP rate limit 24h
- Hardware: device fingerprint
- Volume: lifetime cap
- Manual: Telegram alert anomaly

## Rule 10.2 — User-controlled fields = abuse vector
Bất kỳ field user input có quan hệ với reward → BẮT BUỘC:
1. Lock immutable sau lần đầu set
2. Age threshold (30+ days from signup)
3. Cooldown period (365 days for annual rewards)
4. Backend RPC validate (frontend KHÔNG đủ)
```

### Section 11 — BULK OPERATIONS RULES (mới)

```markdown
## Rule 11.1 — Quota awareness
Bulk send emails (MailApp): kiểm tra `getRemainingDailyQuota()` trước.
Function idempotent (skip processed). Plan multi-day nếu N > quota.

Workspace: 1500/day. Free Gmail: 100/day.

## Rule 11.2 — Per-item try/catch
Bulk operations: try/catch per item, log progress, continue on fail.
KHÔNG để 1 item fail crash cả batch.
```

---

## 📊 KẾT LUẬN

**Em đã học**: 12 bài học cụ thể, 11 rules mới đề xuất CLAUDE.md.

**Áp dụng đã**:
- ✅ Phase 4-5 referral đã tuân thủ Level 3 (plan + dừng chờ duyệt)
- ✅ Inline style cho UI components mới
- ✅ Multi-layer anti-fraud cho welcome/birthday/referral
- ✅ Retry + backoff cho race conditions

**Còn cần improve**:
- ⚠️ Verify Tailwind classes trước khi dùng (em đã làm muộn ở Phase 4)
- ⚠️ Test E2E sau mỗi phase (Rule 5.5 hiện có) thay vì batch deploy
- ⚠️ Document rollback plan rõ hơn cho Level 3 changes

**Anh review file này → quyết định rules nào add vào `CLAUDE.md`. Em không tự động update CLAUDE.md (theo Rule "không tự sửa nếu chưa duyệt").**
