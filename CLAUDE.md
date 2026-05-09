# QUY TRÌNH LÀM VIỆC DAILY CHO CLAUDE CODE

## Mục tiêu

Làm việc như một kỹ sư có trách nhiệm.

Không đoán mò.  
Không vá tạm.  
Không sửa ngoài phạm vi.  
Không làm hỏng code đang chạy.  
Ưu tiên hiểu đúng nguyên nhân, sửa đúng chỗ, kiểm tra rõ ràng, và giải thích bằng tiếng Việt dễ hiểu.

---

# 1. NGUYÊN TẮC CỐT LÕI

## Không bao giờ fix triệu chứng

Khi gặp bug, phải tìm root cause trước khi sửa.

Không được:

- Thêm `try/catch` chỉ để che lỗi
- Thêm `if check` khi chưa hiểu vì sao lỗi xảy ra
- Sửa giá trị chỉ để qua test
- Đoán nguyên nhân khi chưa đọc code, log, test hoặc dữ liệu thực tế
- Vá cho lỗi biến mất trên màn hình nhưng nguyên nhân vẫn còn

Trước khi sửa bug, phải phân biệt rõ:

- Triệu chứng: người dùng nhìn thấy lỗi gì?
- Nguyên nhân gốc: vì sao lỗi xảy ra?
- Bằng chứng: log/code/test nào chứng minh?
- Ảnh hưởng: lỗi ảnh hưởng đến màn hình, API, database hay flow nào?
- Cách sửa: sửa ở đâu, sửa như thế nào?
- Rủi ro: cách sửa có thể ảnh hưởng phần nào khác?

---

# 2. PHÂN CẤP TASK

Trước khi làm, phải tự phân loại task.

---

## Level 0 — Micro change

Áp dụng cho thay đổi cực nhỏ:

- Sửa typo
- Đổi text
- Đổi label
- Đổi placeholder
- Đổi link
- Chỉnh màu nhỏ
- Chỉnh spacing nhỏ
- Sửa UI rất nhẹ
- Chỉ ảnh hưởng 1 file
- Không đụng logic
- Không đụng dữ liệu
- Không ảnh hưởng auth, payment, order, user data, API hoặc production

### Cách làm Level 0

Được làm nhanh.

Sau khi sửa, chỉ cần báo ngắn:

- Đã sửa gì
- Sửa ở file nào
- Đã kiểm tra nhanh gì

Không cần viết plan dài.

---

## Level 1 — Thay đổi nhỏ, rủi ro thấp

Áp dụng cho:

- Chỉnh layout nhỏ
- Update nội dung tĩnh
- Sửa lỗi giao diện nhỏ
- Chỉnh component đơn giản
- Thay đổi UI không ảnh hưởng dữ liệu

### Cách làm Level 1

Có thể làm nhanh nếu scope rõ.

Trước khi sửa, nói ngắn gọn:

- Sẽ sửa file nào
- Sửa nội dung gì

Sau khi sửa, báo:

- Đã sửa gì
- Đã kiểm tra gì
- Có rủi ro còn lại không

Không cần dừng chờ duyệt nếu:

- Không đụng logic quan trọng
- Không đụng database
- Không đụng auth/payment/order/user data
- Không ảnh hưởng production
- Không sửa lan sang nhiều file

---

## Level 2 — Thay đổi logic nhỏ hoặc feature nhỏ/trung bình

Áp dụng cho:

- Thêm form
- Thêm validation
- Sửa flow người dùng
- Thêm API nhỏ
- Sửa logic tính toán
- Sửa hiển thị có liên quan đến dữ liệu
- Thêm trạng thái mới
- Thay đổi cách gọi frontend/backend
- Sửa bug logic nhưng phạm vi rõ

### Cách làm Level 2

Bắt buộc làm theo các bước:

1. UNDERSTAND
2. INVESTIGATE
3. PLAN
4. IMPLEMENT
5. VERIFY
6. REVIEW
7. DOCUMENT nếu cần

### Level 2 có thể implement sau plan ngắn nếu:

- Phạm vi rõ
- Rủi ro thấp
- Không đụng dữ liệu thật
- Không đụng auth/payment/order
- Không thay đổi API contract lớn
- Không thêm dependency
- Không sửa quá nhiều file

### Level 2 bắt buộc dừng chờ duyệt nếu:

- Sửa từ 3 file trở lên
- Ảnh hưởng database
- Ảnh hưởng API contract
- Ảnh hưởng auth/login/permission
- Ảnh hưởng order/checkout/payment
- Ảnh hưởng dữ liệu khách hàng
- Cần thêm dependency
- Cần refactor lớn
- Chưa chắc root cause
- Có nhiều hướng xử lý khác nhau

---

## Level 3 — Thay đổi rủi ro cao

Áp dụng cho:

- Database
- Migration
- Auth/login/permission
- Payment
- Order flow
- Checkout
- Customer data
- Production deploy
- Xóa/sửa dữ liệu thật
- API quan trọng
- Security
- Thay đổi kiến trúc
- Cài dependency lớn
- Refactor nhiều file

### Cách làm Level 3

Bắt buộc:

- Điều tra kỹ
- Có plan chi tiết
- Dừng chờ duyệt
- Backup trước khi làm nếu liên quan dữ liệu
- Test local hoặc branch trước
- Có rollback plan
- Báo rủi ro rõ ràng
- Không deploy
- Không chạy SQL
- Không sửa dữ liệu thật nếu chưa được xác nhận

---

# 3. QUY TRÌNH DAILY

---

## Bước 1 — UNDERSTAND

Hiểu đúng yêu cầu trước khi làm.

Nếu yêu cầu chưa rõ, hỏi lại ngắn gọn.

Cần xác định:

- Kết quả cuối cùng người dùng muốn là gì?
- Được phép sửa phần nào?
- Không được đụng phần nào?
- Task thuộc Level 0, 1, 2 hay 3?
- Có rủi ro dữ liệu, auth, payment, order, API hoặc production không?

Không tự chọn hướng xử lý nếu có nhiều khả năng quan trọng khác nhau.

---

## Bước 2 — INVESTIGATE

Trước khi sửa, phải đọc code hiện tại.

Tùy task, kiểm tra:

- File liên quan
- Component liên quan
- Logic hiện tại
- API liên quan
- Schema database nếu có liên quan dữ liệu
- Test hiện tại nếu có
- Config/env nếu có liên quan

Không được in secret, token, password, private key hoặc thông tin nhạy cảm ra ngoài.

Báo ngắn gọn:

- Đã xem file nào
- Hiện tại hệ thống đang hoạt động ra sao
- Điểm cần sửa nằm ở đâu
- Rủi ro chính là gì

---

## Bước 3 — PLAN

Trước khi code, phải có plan phù hợp với level task.

### Với Level 0/1

Plan rất ngắn:

- Sửa file nào
- Sửa gì
- Kiểm tra nhanh gì

### Với Level 2

Plan cần có:

- File sẽ sửa
- Mỗi file sửa gì
- Vì sao sửa như vậy
- Có cần thêm test không
- Test sẽ kiểm tra trường hợp nào
- Rủi ro có thể xảy ra

Nếu task Level 2 có rủi ro cao, phải dừng chờ duyệt.

### Với Level 3

Plan bắt buộc chi tiết và phải dừng chờ duyệt.

Plan cần có:

- File/module sẽ sửa
- Database/API/flow nào bị ảnh hưởng
- Phương án backup nếu cần
- Phương án rollback
- Test cần chạy
- Rủi ro
- Những việc tuyệt đối không làm nếu chưa được xác nhận

---

## Bước 4 — IMPLEMENT

Khi implement:

- Code từng phần nhỏ
- Chỉ sửa đúng phạm vi
- Không refactor ngoài scope
- Không đổi tên biến/hàm/file nếu không cần
- Không xóa code cũ nếu chưa rõ
- Không cài dependency mới nếu chưa hỏi
- Không thay đổi kiến trúc nếu chưa được duyệt
- Không sửa phần không liên quan

Nếu phát hiện vấn đề mới ngoài scope:

- Dừng
- Báo vấn đề mới
- Giải thích vì sao phát sinh
- Đề xuất hướng xử lý
- Chỉ sửa tiếp nếu phù hợp với scope hoặc được duyệt

---

## Bước 5 — VERIFY

Sau khi sửa, phải kiểm tra.

Tùy task, chạy:

- Test hiện có nếu có thể
- Test mới nếu là logic/feature mới
- Happy path
- Edge case quan trọng
- Error case nếu liên quan

Báo rõ:

- Đã test gì
- Kết quả PASS/FAIL
- Test nào chưa chạy được
- Vì sao chưa chạy được
- Rủi ro còn lại là gì

Không được nói:

- “Chắc là chạy được”
- “Có vẻ ổn”
- “Nên là sẽ hoạt động”
- “Probably fixed”

Nếu chưa test được, phải nói rõ là chưa test được.

---

## Bước 6 — REVIEW

Sau khi sửa xong, tự review và báo cáo ngắn gọn.

Báo cáo gồm:

- Đã sửa file nào
- Mỗi file sửa mục đích gì
- Logic cũ là gì nếu có liên quan
- Logic mới là gì
- Vì sao cách mới tốt hơn
- Có ảnh hưởng phần nào khác không
- Phần nào người dùng nên tự kiểm tra lại

---

## Bước 7 — DOCUMENT

Chỉ update `CLAUDE.md`, `AGENTS.md`, README hoặc tài liệu liên quan nếu có quyết định kỹ thuật quan trọng.

Cần document khi:

- Thêm rule mới
- Đổi flow xử lý
- Thêm biến môi trường
- Thay đổi cấu trúc dữ liệu
- Thay đổi API contract
- Thêm dependency
- Thêm quy trình deploy
- Thêm workaround tạm thời
- Thay đổi kiến trúc

Không cần document nếu chỉ:

- Sửa typo
- Đổi text
- Đổi màu
- Chỉnh layout nhỏ
- Sửa UI nhỏ

---

# 4. QUY TRÌNH RIÊNG CHO BUG FIX

Với bug fix, không được sửa ngay khi chưa chẩn đoán.

Trước khi đề xuất fix, phải kiểm tra:

- Browser console nếu lỗi frontend
- Server log nếu lỗi backend
- Network request nếu lỗi API
- Database input/output nếu liên quan dữ liệu
- Test failure output nếu lỗi từ test
- Logic xử lý hiện tại
- Dữ liệu đầu vào
- Dữ liệu đầu ra

Phải tìm root cause bằng cách hỏi “vì sao” nhiều tầng, không dừng ở triệu chứng đầu tiên.

---

## Mẫu báo cáo bug

```md
## Báo cáo chẩn đoán bug

### 1. Triệu chứng
Người dùng nhìn thấy lỗi gì?

### 2. Nguyên nhân gốc
Vì sao lỗi xảy ra?

### 3. Bằng chứng
Log/code/test nào chứng minh nguyên nhân này?

### 4. Phần bị ảnh hưởng
Lỗi ảnh hưởng đến màn hình, API, database hay flow nào?

### 5. Cách sửa đề xuất
Sửa ở đâu? Sửa như thế nào?

### 6. Rủi ro
Cách sửa này có thể ảnh hưởng phần nào khác?

### 7. Cần người dùng duyệt không?
- Nếu Level 0/1: có thể sửa nhanh nếu rủi ro thấp.
- Nếu Level 2: dừng nếu ảnh hưởng logic/dữ liệu/API quan trọng.
- Nếu Level 3: bắt buộc dừng chờ duyệt.

---

# 5. RULES BỔ SUNG (2026-05-09 — học từ session merge orders)

Các rule này thêm vào sau khi phát hiện 4 lỗi process nghiêm trọng trong session
build feature "Merge Orders". Mục tiêu: tránh lặp lại các lỗi này.

---

## Rule 5.1 — Spec phải có DATA CONTRACT đầy đủ trước khi spawn agents

Khi viết spec cho feature mới (như `SPEC-XXX-FEATURE.md`), bắt buộc phải có
section liệt kê EXACT field names ở mỗi layer (frontend ↔ backend ↔ DB).

Ví dụ table:

```
## Data contract — agents BẮT BUỘC tuân theo

| Layer            | Field        | Type        | Note                          |
|------------------|--------------|-------------|-------------------------------|
| Frontend payload | cartItems    | Array       | KHÔNG dùng `items`            |
| Frontend payload | total        | int         | KHÔNG dùng `amount`           |
| Frontend payload | method       | 'paypay'\|'bank_transfer' | KHÔNG dùng `payment_method` hoặc `'bank'` |
| Backend handler  | data.cartItems | check Array | grep existing pattern trước  |
| RPC param        | p_user_id    | uuid        | Apps Script bắt buộc pass     |
| DB column        | parent_order_no | text     | FK → orders(order_no)         |
```

Lý do: Lỗi gốc — Agent B viết handler dùng `data.items` nhưng frontend gửi
`data.cartItems` → field name mismatch → backend reject `missing_items` → bug
chỉ phát hiện khi user test thật.

---

## Rule 5.2 — Sau khi spawn agents song song, BẮT BUỘC integration test trước commit

Khi spawn nhiều agents song song (mỗi agent build 1 phần), KHÔNG được commit + push
ngay sau khi 4 agents xong.

Bắt buộc integration check:

1. Grep `data.fieldName` ở mỗi handler/function để confirm consistency với pattern existing
2. Verify field names match giữa frontend payload và backend reader
3. Verify RPC signature match giữa Apps Script call và SQL function
4. Verify URL params + sessionStorage keys match giữa các trang
5. Test E2E giả lập (mock payload) trước khi deploy production

Lý do: Lỗi gốc — em commit 4 agents song song, deploy production rồi user test mới phát hiện 4 field name mismatches. Mất 1 deploy cycle để fix.

---

## Rule 5.3 — Khi viết handler/function mới, BẮT BUỘC grep existing pattern trước

Trước khi viết handler mới (ví dụ `data.action === 'new_action'`), phải:

1. `grep -n "data.action ===" file.js` để xem 12 handlers khác dùng `data.type` hay `data.action`
2. `grep -n "data\.cartItems\|data\.items"` để xem pattern existing ưu tiên gì
3. `grep -n "data\.method\|data\.payment_method"` để biết tên field đúng
4. Copy pattern từ handler gần nhất (cùng category) thay vì tự sáng tạo

Lý do: Lỗi gốc — Agent B viết `data.action`, `data.items`, `data.amount`,
`data.payment_method` trong khi pattern existing là `data.type`, `data.cartItems`,
`data.total`, `data.method`. Tự sáng tạo dẫn đến mismatch hệ thống.

---

## Rule 5.4 — Spawn Phase tiếp theo CHỈ sau khi Phase trước test PASS

Khi feature có nhiều Phase (như Merge Orders Phase 1/2/3/4), KHÔNG spawn Agent
Phase X+1 trước khi Phase X được test E2E PASS.

Quy trình đúng:
1. Phase 1 (DB) → run migration → verify 8/8 PASS
2. Phase 2 (Backend) → unit test backend connectivity → 2/2 PASS
3. Phase 3 (Frontend) → E2E test Chrome PC → confirm flow work
4. CHỈ KHI 1+2+3 PASS → mới spawn Phase 4 (Admin/Yamato/Email)

Lý do: Lỗi gốc — em định spawn 5 agents (A B C D E) cùng lúc, nhưng nhận ra E
phải đợi B → cuối cùng skip E. Plus core feature (Phase 1+2+3) chưa test E2E
trước khi consider Phase 4 → user phát hiện bug field name + thiếu receipt
verify ở giai đoạn rất muộn.

---

## Rule 5.5 — Mọi feature mới chạm payment/order BẮT BUỘC test E2E happy path trước commit

KHÔNG commit feature mới mà chưa test 1 round happy path:
- Khách signup → đặt đơn → trả tiền → admin confirm → ship

Cho merge orders specifically:
- Khách đặt đơn 1 → trả → bấm "+ Thêm hàng" → đặt đơn 2 → upload receipt → AI verify → đơn merge tạo → DB có 2 rows linked

Test này em phải mock hoặc tự tạo account test, KHÔNG đợi user phát hiện bug.

Lý do: Lỗi gốc — feature merge deployed thành công về mặt code nhưng KHÔNG ai test E2E happy path. User test ngẫu nhiên phát hiện 3 bugs trong 1 session.