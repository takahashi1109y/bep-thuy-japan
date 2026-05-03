# Workflow Verification — Quy Trình Kiểm Tra Mỗi Fix/Feature

> **Apply từ**: 2026-05-03 (sau bug khách iPhone Safari không thấy mã vận đơn)
> **Áp dụng cho**: Mọi fix bug + feature mới trong dự án thuyjapan.com
> **Người chạy**: Em (Claude agent) trước khi báo anh "xong"
> **File này**: `K:\bep-thuy-japan\WORKFLOW-FIX-VERIFICATION.md`

---

## Lý do tồn tại

**Bug ngày 2026-05-03**: khách Tú (iPhone Safari) không thấy mã vận đơn dù DB đã update đúng. Root cause: cache localStorage không có TTL (Time To Live) → browser dùng data cũ vĩnh viễn cho đến khi user clear cache thủ công.

**Lẽ ra phải catch ở 4 layer trước khi tới khách:**

| Layer | Đáng lẽ phát hiện | Thực tế |
|---|---|---|
| 1. Research | Audit cache patterns toàn project | Không có — chỉ nhìn 1 chỗ rõ ràng |
| 2. Code review | TTL check trong PR | Không có — em commit thẳng |
| 3. Manual test | Test trên iPhone Safari thật | Không có — em báo "xong" trước test |
| 4. Khách phát hiện | Không bao giờ tới đây | **TỚI ĐÂY → mất tin tưởng** |

→ **Quy trình mới**: thêm 4 phases verification để bug systemic không lặp lại.

---

## Quy trình 4 phases

### Phase 1 — Research & Spec (TRƯỚC khi viết code)

**Mục tiêu**: hiểu hết trước khi tay chạm bàn phím.

- [ ] Spawn ít nhất **2-3 agents parallel** research
- [ ] Audit **ALL similar patterns** trong codebase (không chỉ chỗ bug rõ ràng)
- [ ] Spec markdown bao gồm:
  - BEFORE diff (code hiện tại)
  - AFTER diff (code sẽ thay)
  - Edge cases (iOS Safari, BFCache, slow network, expired session...)
  - Liệt kê toàn bộ file sẽ touch
- [ ] Nếu fix > 30 phút → em **present spec cho anh review TRƯỚC khi code**

**Lý do**: bug 2026-05-03 ban đầu tưởng 1 chỗ → audit ra 4 chỗ đọc cache. Nếu chỉ fix 1 chỗ, bug vẫn còn ở 3 chỗ khác.

---

### Phase 2 — Code Implementation

**Mục tiêu**: code clean, từng bước nhỏ, không batch refactor lớn.

- [ ] Apply edits theo spec đã duyệt ở Phase 1
- [ ] Mỗi edit: chỉ 1 logical change (no batch refactor pha tạp)
- [ ] Update todo list từng step → anh thấy progress real-time
- [ ] Comment code chỗ nào tricky (đặc biệt edge case iOS)
- [ ] Không tự ý "tiện thể fix luôn cái khác" nếu spec không có

---

### Phase 3 — Verification (LAYER MỚI — quan trọng nhất)

**Mục tiêu**: kiểm tra TRƯỚC khi báo anh "xong".

- [ ] Spawn `code-review` agent: review diff, check edge cases, verify spec compliance
- [ ] Spawn `test-plan` agent: soạn test plan markdown chi tiết (steps + expected result)
- [ ] **Em KHÔNG báo "xong" cho đến khi cả 2 agents trả về APPROVE**
- [ ] Nếu agent flag issue **HIGH severity** → fix ngay, KHÔNG commit
- [ ] Nếu agent flag issue **MEDIUM** → em báo anh quyết định fix hay defer
- [ ] Self-test khi possible: read file, sanity check syntax, dry-run logic

**Output Phase 3**: 2 markdown files (review-{date}.md + test-plan-{date}.md) lưu trong `K:\bep-thuy-japan\verifications\`

---

### Phase 4 — Deploy & Confirm

**Mục tiêu**: đóng vòng tròn, không bỏ ngỏ.

- [ ] Em paste highlights diff → anh review
- [ ] Anh push code + deploy production
- [ ] Anh chạy test plan từ Phase 3 (em đã viết sẵn)
- [ ] Anh confirm **PASS** → em update handover doc (V7+1, V8...)
- [ ] Anh confirm **FAIL** → em fix, **KHÔNG đổ lỗi cho anh hay test plan**
- [ ] Bug nào sót → log vào "Lessons learned" cuối file này

---

## Triggers — Khi nào áp dụng full quy trình?

| Loại task | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|
| **Bug critical** (khách phàn nàn) | Bắt buộc | Bắt buộc | Bắt buộc | Bắt buộc |
| **Feature mới** production-facing | Bắt buộc | Bắt buộc | Bắt buộc | Bắt buộc |
| **Refactor > 50 lines** | Bắt buộc | Bắt buộc | Bắt buộc | Bắt buộc |
| **Migration SQL** (schema change) | Bắt buộc | Bắt buộc | Bắt buộc | Bắt buộc |
| **Helper internal** / log debug | Light | Bắt buộc | 1 review agent đủ | Anh push thôi |
| **Comment update / typo fix** | Skip | Bắt buộc | Skip | Anh push thôi |
| **Update handover .md** | Skip | Bắt buộc | Skip | Skip |

**Rule of thumb**: nếu fix có thể ảnh hưởng **khách thật trên production** → full 4 phases.

---

## Lessons learned từ bug 2026-05-03

### 1. Cache audit phải full project scope

Bug ban đầu em tưởng 1 chỗ (trang xem đơn hàng). Sau khi spawn 5 agents audit → ra **4 chỗ** đọc cache localStorage:
- `OrderDetailPage.tsx` (chỗ khách Tú gặp)
- `MyOrdersPage.tsx`
- `ProductListPage.tsx`
- `useOrderStatus.ts` hook

Nếu em chỉ fix 1 chỗ → bug vẫn còn ở 3 chỗ khác cho user khác.

**Bài học**: tìm bug = tìm pattern, không phải tìm 1 dòng code.

---

### 2. iOS Safari edge cases khác desktop

Browser desktop (Chrome/Firefox) có behavior khác iOS Safari:
- **BFCache** (Back-Forward Cache): Safari giữ cả page state khi user back → data cũ load lại
- **Persistent localStorage**: Safari iOS không tự clear khi tab close
- **Fetch hang**: connection mobile yếu → fetch không reject mà hang vô hạn → cache cũ tiếp tục hiện

**Bài học**: test plan phải có scenario riêng cho iOS Safari (BFCache + slow 3G + tab background).

---

### 3. TTL là default behavior, không phải optimization

Trước đây em nghĩ "cache TTL = optimization, không gấp". Sai.

**Đúng**: bất kỳ cache nào lưu data backend (orders, user info, products) **bắt buộc** có TTL. Default 5-15 phút. Không có TTL = bug chờ ngày nổ.

**Pattern chuẩn từ giờ**:
```typescript
const CACHE_TTL = 5 * 60 * 1000; // 5 phút
const cached = localStorage.getItem(key);
if (cached) {
  const { data, timestamp } = JSON.parse(cached);
  if (Date.now() - timestamp < CACHE_TTL) return data;
}
// fetch fresh, save with timestamp
```

---

### 4. Spec-first cứu mạng

Bug 2026-05-03 em đã spawn 5 agents parallel research **TRƯỚC khi code**. Kết quả:
- Agent 1: audit cache patterns → tìm ra 4 chỗ
- Agent 2: research iOS Safari quirks → BFCache, persistent storage
- Agent 3: spec TTL implementation → code mẫu chuẩn
- Agent 4: spec test plan → 12 test scenarios
- Agent 5: spec rollback plan → fallback nếu deploy hỏng

→ Em fix **1 lần đúng**, không phải fix lại nhiều lần. Tiết kiệm cho anh ~3-4 lần redeploy.

**Bài học**: spec-first không phải chậm, mà là nhanh nhất nếu task complex.

---

## Áp dụng quy trình này cho future fixes

### Em sẽ luôn:
- **Đầu task**: hỏi anh "Anh có muốn em chạy full 4 phases verification không?"
- **Trong task**: document từng phase vào todo list để anh thấy transparent
- **Cuối task**: xác nhận đã chạy đủ phases trước khi báo "xong"

### Anh có thể short-circuit:
- "Bug nhỏ thôi, skip Phase 3" → em note và bỏ qua
- "Cứ làm full đi" → mặc định 4 phases
- "Em quyết định" → em theo bảng triggers ở trên

### Em sẽ KHÔNG:
- Báo "xong" khi chưa qua Phase 3 (trừ khi anh explicit skip)
- Tự ý merge nhiều fix vào 1 commit (vi phạm Phase 2 rule)
- Giấu issue agent review tìm ra (vi phạm Phase 3)

---

## Tracking template (mỗi fix/feature)

Copy block này khi bắt đầu task mới. Lưu vào `K:\bep-thuy-japan\verifications\fix-{YYYY-MM-DD}-{ten-ngan}.md`:

```markdown
# Fix: [tên ngắn]

- **Date**: 2026-MM-DD
- **Severity**: Critical / High / Medium / Low
- **Triggered by**: khách báo / em phát hiện / anh yêu cầu
- **Files touched**: [list path]

## Phase 1 — Research & Spec
- [ ] Spawn N agents: ...
- [ ] Audit similar patterns: ✅ / ❌ (link spec)
- [ ] Edge cases listed: ...
- [ ] Anh review spec: ✅ / ❌ / N/A

## Phase 2 — Implement
- [ ] Edits applied: ...
- [ ] Todo list updated: ✅ / ❌
- [ ] Commits: [hash list]

## Phase 3 — Verification
- [ ] code-review agent: ✅ / ❌ (link output)
- [ ] test-plan agent: ✅ / ❌ (link output)
- [ ] Issues HIGH found: ... → fixed at commit [hash]
- [ ] Issues MEDIUM found: ... → defer / fix
- [ ] Self-test: ✅ / ❌

## Phase 4 — Deploy & Confirm
- [ ] Anh review diff: ✅ / ❌
- [ ] Anh deploy: ✅ / ❌ (deploy ID/time)
- [ ] Anh test theo plan: ✅ / ❌
- [ ] Anh confirm PASS: ✅ / ❌
- [ ] Handover doc updated: ✅ / ❌

## Issues / Lessons
- ...
```

---

## Checklist cứng cho em (Claude agent)

Trước khi gõ chữ "xong" cho anh, em phải tick hết:

- [ ] Em đã spawn ≥ 1 review agent ở Phase 3? (trừ task < 5 phút)
- [ ] Em đã viết test plan markdown để anh chạy?
- [ ] Em đã read lại file đã edit để sanity check?
- [ ] Em đã liệt kê edge cases iOS Safari (nếu là frontend fix)?
- [ ] Em đã update todo list với status mỗi phase?
- [ ] Em đã sẵn sàng paste diff highlights cho anh review?

**Nếu thiếu 1 ô** → em KHÔNG báo "xong". Em báo "em đang chạy Phase X, sắp xong" thay vì giả vờ hoàn thành.

---

## Ghi chú cuối

Quy trình này em tự cam kết với anh. Nếu anh thấy em báo "xong" mà bug vẫn lọt → anh mở file này, point ra phase em skip, em sẽ rút kinh nghiệm và update file.

File này là **living document** — em sẽ thêm Lessons Learned mỗi khi gặp bug systemic mới. Cứ giữ trong `K:\bep-thuy-japan\` để dễ tìm.

— Em (Claude agent của anh Thắng)
— Bản đầu: 2026-05-03

---

## Case Study — Phone Login Fix (2026-05-03)

Anh request: "Gọi 10 agent ra giải quyết, tránh xung đột, mỗi agent 1 việc."

Em phân 10 agents thành 3 waves:
- **Wave 1 (4 agents read-only)**: Diagnose SQL, frontend spec, RPC spec, backfill spec — parallel, không đụng nhau
- **Wave 2 (em apply edits)**: Em là single writer, không spawn agent, tránh conflict file
- **Wave 3 + 4 (6 agents)**: Code review + test plan + security audit + handover doc + customer migration + memory update — mỗi agent 1 file riêng

Total 10 agents. Zero file conflict. Zero rework.

**Lesson**: Khi spawn nhiều agents song song, em làm SINGLE WRITER (em apply edits), agents chỉ research/spec/review/doc. Tránh 2 agents Edit cùng 1 file.

---

## Case Study — Duplicate Phone Resolve (2026-05-03 chiều)

Anh's rule (clear không quote chính xác):
"Khách dùng cùng phone cho nhiều email → CLEAR ALL → login bằng email → modal prompt update phone mới"

10 agents non-conflict (theo pattern Phone Login V2 sáng):
- Wave 1 (4 read-only research): SQL clear / Frontend spec / RPC spec / Customer outreach
- Wave 2 (em single writer): 2 SQL files + 5 HTML diffs
- Wave 3+4 (6): code review + test + security + memory + V8 + workflow

**Lesson lặp lại**: SINGLE WRITER pattern hoạt động ổn định lần 2. 0 file conflict.

**Lesson MỚI**: Khi anh request rule lớn (vd "clear duplicate"), em phải spawn agent design CUSTOMER OUTREACH ngay từ Wave 1, không để Wave 4. Vì outreach cần coordinate với anh email blast — không thể đợi code xong rồi mới làm.
