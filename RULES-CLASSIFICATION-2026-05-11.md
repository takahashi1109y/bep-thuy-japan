# RULES CLASSIFICATION — Anh duyệt từng rule

**Date**: 2026-05-11
**Mục đích**: Phân loại 11 rules đề xuất từ `LESSONS-LEARNED-2026-05-10-11.md` thành 3 nhóm A/B/C trước khi anh quyết định extract vào `CLAUDE.md`.

**Quy ước**:
- **A** = Bắt buộc CLAUDE.md (thiếu → bug nghiêm trọng)
- **B** = Lessons Learned/Checklist only (tốn context CLAUDE.md không xứng)
- **C** = Cần giải thích thêm trước khi quyết định

---

## RULE 1 — GREP existing Tailwind classes trước khi dùng

| Field | Value |
|-------|-------|
| **Vấn đề ngăn chặn** | Class Tailwind chưa từng dùng có thể KHÔNG có trong precompiled bundle → button transparent + text invisible |
| **Mức độ nghiêm trọng nếu thiếu** | TRUNG BÌNH — UI broken, KHÔNG mất data, KHÔNG ảnh hưởng business logic |
| **Vào CLAUDE.md?** | ❌ **B** (Lessons Learned only) |
| **Lý do** | Apply CHỈ cho project Bếp Thuỷ (Tailwind precompiled). Nếu dự án khác dùng JIT/inline CSS → rule không áp dụng. Đặt trong checklist trước commit thì OK hơn. |

---

## RULE 2 — KHÔNG tin Preview/Test của 3rd-party email service, phải test với autoresponder thực

| Field | Value |
|-------|-------|
| **Vấn đề ngăn chặn** | Bug rendering tag personalization chỉ thấy khi gửi thật → khách nhận URL rỗng/hỏng |
| **Mức độ nghiêm trọng nếu thiếu** | CAO — 1 lần fail = 100+ khách bị broken (đã thực tế xảy ra với 44 contacts cũ) |
| **Vào CLAUDE.md?** | ✅ **A** (Bắt buộc) |
| **Lý do** | Pattern apply cho mọi 3rd-party email service (GR, Mailchimp, Sendgrid). Silent fail risk cao. CLAUDE.md cần document để future agent không lặp lại. |

---

## RULE 3 — Pass identifier explicit + retry với backoff cho race conditions

| Field | Value |
|-------|-------|
| **Vấn đề ngăn chặn** | Frontend missing required field (vd userId) → backend null → broken flow. Plus DB trigger chưa chạy xong khi API GET → race fail |
| **Mức độ nghiêm trọng nếu thiếu** | CAO — Đã break welcome bonus 100đ cho 143 khách |
| **Vào CLAUDE.md?** | ✅ **A** (Bắt buộc) |
| **Lý do** | Pattern data flow signup phổ biến, race risk cao. Có thể MERGE với Rule 5.1 (data contract) hiện có thay vì add new rule. |

---

## RULE 4 — Query API endpoint cho ID, KHÔNG assume từ URL UI

| Field | Value |
|-------|-------|
| **Vấn đề ngăn chặn** | Sai ID (URL slug ≠ API ID) → 100% requests fail |
| **Mức độ nghiêm trọng nếu thiếu** | CAO — Đã fail 171 contacts × N attempts |
| **Vào CLAUDE.md?** | ✅ **A** (Bắt buộc) |
| **Lý do** | Universal pattern cho mọi 3rd-party API (GR, Stripe, Shopify, etc.). Vi phạm rule = silent 100% fail. |

---

## RULE 5 — (Skip — đã có trong CLAUDE.md Section 2 Level 3)

---

## RULE 6 — Anti-fraud ≥3 layers + manual review (Telegram alert)

| Field | Value |
|-------|-------|
| **Vấn đề ngăn chặn** | Single layer dễ bypass → leak điểm/discount/financial |
| **Mức độ nghiêm trọng nếu thiếu** | CAO — Direct financial impact (welcome bonus, birthday, referral đều có $$ value) |
| **Vào CLAUDE.md?** | ✅ **A** (Bắt buộc) |
| **Lý do** | Pattern phải áp dụng cho mọi promotion mới (NPS sắp làm, future loyalty). Document level rules cụ thể (≥3 layers + 1 alert) là rất concrete, dễ enforce. |

---

## RULE 7 — User-controlled fields = abuse vector → lock + age threshold + cooldown + RPC validate

| Field | Value |
|-------|-------|
| **Vấn đề ngăn chặn** | Khách abuse field tự khai (birthday, ref code) → fake để claim repeated rewards |
| **Mức độ nghiêm trọng nếu thiếu** | CAO — Birthday discount 10% × N orders/year = financial leak có thể lớn |
| **Vào CLAUDE.md?** | ✅ **A** (Bắt buộc) |
| **Lý do** | Áp dụng universally cho mọi feature có user input + reward. 4 sub-rules cụ thể (lock/age/cooldown/RPC) dễ enforce, không vague. |

---

## RULE 8 — Email bulk send: check `getRemainingDailyQuota()` + idempotent function

| Field | Value |
|-------|-------|
| **Vấn đề ngăn chặn** | Quota exceed (Free Gmail 100/day, Workspace 1500/day) → nhiều emails fail silently |
| **Mức độ nghiêm trọng nếu thiếu** | TRUNG BÌNH — Recoverable (run lại ngày mai). KHÔNG mất data. |
| **Vào CLAUDE.md?** | ❌ **B** (Lessons Learned + checklist) |
| **Lý do** | Specific cho bulk send pattern (KHÔNG common case). Nếu add CLAUDE.md sẽ tốn context cho rule rare. Đặt trong "Checklist trước commit feature bulk" thì efficient hơn. |

---

## RULE 9 — Document state machine cho one-shot APIs (vd GR autoresponder fire 1 lần/contact)

| Field | Value |
|-------|-------|
| **Vấn đề ngăn chặn** | Test scenario không clear → người sau không reproduce được test pass |
| **Mức độ nghiêm trọng nếu thiếu** | TRUNG BÌNH — Process issue, không production bug |
| **Vào CLAUDE.md?** | ⚠️ **C** (Cần giải thích thêm) |
| **Lý do** | Concept "document state machine" hơi vague. Cần specific format:<br>- State diagram?<br>- Text steps numbered?<br>- Test scenario script?<br>Có thể MERGE với Rule 5.1 (data contract) hoặc thành standalone rule với template cụ thể. |

---

## RULE 10 — Idempotent revoke logic cho status transitions có side effects

| Field | Value |
|-------|-------|
| **Vấn đề ngăn chặn** | Status flow A→B→C, B award điểm, C cancel → khách giữ điểm SAI (không revoke) |
| **Mức độ nghiêm trọng nếu thiếu** | CAO — Direct financial leak nếu admin "lỡ tay" mark transition |
| **Vào CLAUDE.md?** | ✅ **A** (Bắt buộc) |
| **Lý do** | Pattern apply cho mọi status flow có $$ side effect (award, refund, etc.). Concrete: trigger award_X → trigger revoke_X cho transition cancel. Universal. |

---

## RULE 11 — Browser MCP automation: semantic selector > coordinate clicks

| Field | Value |
|-------|-------|
| **Vấn đề ngăn chặn** | Coordinate clicks fail khi layout shift (responsive, animation) |
| **Mức độ nghiêm trọng nếu thiếu** | THẤP — Developer experience, KHÔNG ảnh hưởng production user |
| **Vào CLAUDE.md?** | ❌ **B** (Lessons Learned only) |
| **Lý do** | Internal tooling rule, chỉ apply khi em dùng browser MCP automation. Không ảnh hưởng code production. CLAUDE.md focus production rules. |

---

## RULE 12 — Verify tool availability + document fallback path

| Field | Value |
|-------|-------|
| **Vấn đề ngăn chặn** | Em assume tool có (vd Node.js) nhưng không có → wasted time |
| **Mức độ nghiêm trọng nếu thiếu** | THẤP — Process inefficiency, không ảnh hưởng user |
| **Vào CLAUDE.md?** | ❌ **B** (Lessons Learned only) |
| **Lý do** | Internal process, không ảnh hưởng production. Điều này em tự cải thiện qua experience, không cần CLAUDE.md ép buộc. |

---

# 📊 TỔNG KẾT PHÂN LOẠI

## Nhóm A — BẮT BUỘC vào CLAUDE.md (6 rules)

| Rule | Tên ngắn |
|------|---------|
| 2 | Email service test với autoresponder thực (no Preview) |
| 3 | Identifier explicit + retry backoff (race condition) |
| 4 | API endpoint cho ID (no URL slug assume) |
| 6 | Anti-fraud ≥3 layers + Telegram alert |
| 7 | User-controlled fields lock + age + cooldown + RPC |
| 10 | Idempotent revoke cho status transitions có side effect |

→ **6 rules CRITICAL, mỗi rule = 1 financial bug đã từng xảy ra**.

## Nhóm B — Chỉ Lessons Learned/Checklist (4 rules)

| Rule | Tên ngắn |
|------|---------|
| 1 | GREP Tailwind classes trước khi dùng |
| 8 | Email bulk quota awareness |
| 11 | Browser MCP semantic > coordinate |
| 12 | Verify tool availability |

→ **4 rules USEFUL nhưng specific cho context, không cần phổ biến cho future agents.**

## Nhóm C — Cần giải thích thêm (1 rule)

| Rule | Câu hỏi cần clarify |
|------|---------------------|
| 9 | "Document state machine" specific format gì? Diagram? Steps? Test scenario? Có nên merge với Rule 5.1? |

---

## 🎯 ANH DUYỆT TỪNG RULE

Anh tick từng rule:

**Nhóm A — đồng ý vào CLAUDE.md:**
- [ ] Rule 2 — Email service test với autoresponder thực
- [ ] Rule 3 — Identifier explicit + retry backoff
- [ ] Rule 4 — API endpoint cho ID
- [ ] Rule 6 — Anti-fraud ≥3 layers + alert
- [ ] Rule 7 — User-controlled fields protection
- [ ] Rule 10 — Idempotent revoke status transitions

**Nhóm B — đồng ý chỉ Lessons Learned:**
- [ ] Rule 1 — Tailwind GREP
- [ ] Rule 8 — Email quota
- [ ] Rule 11 — Browser MCP semantic
- [ ] Rule 12 — Tool availability

**Nhóm C — anh trả lời:**
- [ ] Rule 9: format "document state machine" anh muốn?
  - (a) Numbered text steps trong SPEC
  - (b) Mermaid state diagram
  - (c) Test scenario script trong file riêng
  - (d) Merge với Rule 5.1 (data contract)
  - (e) Khác (anh điền)

---

**Sau khi anh check ✓ từng rule + trả lời Rule 9**, em sẽ:
1. Viết bản update CLAUDE.md với CHỈ rules anh duyệt (Section 8-11 hoặc merge)
2. Show diff trước khi commit
3. Anh approve → commit + push

**KHÔNG TỰ ĐỘNG update CLAUDE.md** cho đến khi từng rule được duyệt rõ ràng.
