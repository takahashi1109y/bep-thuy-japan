# Test Plan — Cache TTL Fix + Refresh Button + BFCache (V8)

> **Mục đích**: Verify bug "khách iPhone Safari không thấy mã vận đơn cập nhật" đã được fix
> **Đơn test mẫu**: #0149 (anh đã ship Yamato 02/05, mã `389855804380`)
> **Thời gian dự kiến**: 15-20 phút
> **Người test**: Anh Thắng
> **File code đã sửa**: `K:\bep-thuy-japan\thanh-vien.html` (9 edits)
> **Ngày soạn**: 2026-05-03
> **Soạn bởi**: Em (Agent 7/8 — QA test plan author)

---

## Tóm tắt 3 fixes em đã apply

| # | Fix | Vấn đề trước | Sau khi fix |
|---|---|---|---|
| **A** | **Cache TTL 60s** | Cache localStorage không hết hạn → khách thấy data cũ mãi | 3 chỗ đọc cache đều check `Date.now() - cached.ts < 60000`. Cache cũ hơn 60s → bỏ qua, fetch mới |
| **B** | **Refresh button trong tracking modal** | Bấm Refresh chỉ reload Yamato events, KHÔNG re-fetch order từ Supabase → mã vận đơn mới không hiện | Refresh giờ re-fetch order từ Supabase + update fields. Mã vận đơn mới sẽ hiện ngay |
| **C** | **BFCache pattern** | Khách quay lại tab/app sau vài phút thấy data cũ (iOS Safari giữ page state) | Auto re-fetch khi user quay lại sau 30s vắng mặt |

---

## Pre-test checklist

Trước khi vào test cases, anh check 4 điều này:

- [ ] **1. Code đã push lên main branch**
  - Mở terminal, vào folder `K:\bep-thuy-japan\`
  - Chạy `git log --oneline -5` → thấy commit mới nhất là về cache TTL fix
  - Hoặc vào https://github.com/[your-repo]/commits/main → thấy commit mới
- [ ] **2. Cloudflare đã deploy thành công**
  - Vào https://dash.cloudflare.com/ → Workers & Pages → thuyjapan project
  - Tab "Deployments" → deployment mới nhất status `Success` (màu xanh)
  - Timestamp deployment phải SAU khi anh push code
- [ ] **3. Có ít nhất 1 đơn `shipped` với `tracking_number` trong DB**
  - Mở Supabase dashboard → table `orders`
  - Filter `status = shipped` AND `tracking_number IS NOT NULL`
  - Có ít nhất 1 row → OK. Nếu chưa có → tạo đơn test trước
  - **Đơn mặc định để test**: #0149 (đã có sẵn, mã `389855804380`)
- [ ] **4. Browser test sẵn sàng**
  - Desktop: Chrome đã update bản mới nhất (Settings → About Chrome)
  - iPhone (nếu có): Safari đã update iOS mới nhất
  - Hoặc dùng Chrome DevTools Device Emulation (em hướng dẫn dưới)

**Nếu 4 điều trên đều OK → bắt đầu test. Nếu thiếu điều nào → báo em em hỗ trợ.**

---

## Cách mở Chrome DevTools Device Emulation (cho test iPhone trên Desktop)

Anh không cần iPhone thật. Chrome DevTools mô phỏng iPhone Safari rất chính xác.

**Click-by-click**:

1. Mở Chrome trên máy anh
2. Vào https://thuyjapan.com/thanh-vien.html
3. Bấm `F12` (hoặc chuột phải → Inspect) để mở DevTools
4. Trong DevTools, bấm icon "Toggle device toolbar" (hình điện thoại + tablet) ở góc trên-trái panel DevTools, hoặc tổ hợp phím `Ctrl+Shift+M`
5. Trên thanh top của browser, dropdown "Responsive" → chọn **iPhone 14 Pro** (hoặc iPhone 12 Pro)
6. Reload trang (`F5`)

Giờ trang web hiển thị như iPhone. Em sẽ ghi `[DESKTOP]` cho test trên Chrome thường, `[iPhone Emulation]` cho dùng DevTools, `[iPhone thật]` nếu yêu cầu thiết bị thật.

---

## Test Suite

### TC1 — Cache TTL works (60s expiry)

**Mục tiêu**: Verify cache localStorage hết hạn sau 60 giây, không hiện data cũ mãi.

**Setup**:
- [DESKTOP] Chrome thường, không cần emulation
- Đăng nhập vào tài khoản test (có ít nhất 1 đơn `shipped`)

**Steps**:
1. Vào https://thuyjapan.com/thanh-vien.html → đăng nhập
2. Đợi dashboard hiện ra với danh sách đơn hàng
3. Bấm `F12` → tab **Application** (Chrome) hoặc **Storage** (Firefox)
4. Sidebar trái: **Local Storage** → click `https://thuyjapan.com`
5. Tìm key có tên giống `bepthuy_orders_cache` (hoặc tương tự)
6. Click vào key đó → ở panel bên phải, tìm field `ts` (timestamp)
7. Ghi lại giá trị `ts` (ví dụ `1730635200000`)
8. **Đợi 30 giây** (đặt timer điện thoại)
9. Reload trang (`F5`)
10. Kiểm tra lại key `bepthuy_orders_cache` → field `ts` có giống cũ không?
11. **Đợi thêm 35 giây** (tổng đã 65s từ lần fetch đầu)
12. Reload trang (`F5`) lần nữa
13. Kiểm tra `ts` → giá trị mới (lớn hơn cũ ~65000ms)

**Expected**:
- Sau 30s: `ts` GIỮ NGUYÊN giá trị cũ (cache còn hạn, dùng lại)
- Sau 65s: `ts` CẬP NHẬT giá trị mới (cache hết hạn, fetch mới từ Supabase)

**PASS criteria**: Sau 65s, `ts` thay đổi → cache TTL hoạt động
**FAIL criteria**: Sau 65s, `ts` vẫn giữ nguyên → cache không hết hạn

**Nếu FAIL**:
- Mở DevTools → tab **Network** → filter `XHR`
- Reload trang sau 65s → có request đến `supabase.co/rest/v1/orders` không?
- Nếu KHÔNG có request → constant `CACHE_TTL` chưa được dùng đúng → **báo em**
- Nếu CÓ request nhưng cache không update → có lỗi khác → **báo em + screenshot Network tab**

**PASS / FAIL**: ___________________________________________

---

### TC2 — Refresh button re-fetches order data từ Supabase

**Mục tiêu**: Verify nút Refresh trong tracking modal cập nhật mã vận đơn mới nếu admin (anh) update sau khi khách đã mở app.

**Setup**:
- 2 cửa sổ browser: 1 đăng nhập tài khoản khách (DevTools mở), 1 mở Supabase dashboard
- Có 1 đơn `shipped` với `tracking_number` đã set (ví dụ #0149, mã `389855804380`)

**Steps**:
1. **Cửa sổ 1 (khách)**: Mở https://thuyjapan.com/thanh-vien.html, đăng nhập
2. Click đơn #0149 để mở chi tiết
3. Click nút **"Tình trạng vận chuyển"** → modal tracking mở ra
4. Trong modal, ghi lại mã vận đơn hiện tại: `389855804380`
5. **Cửa sổ 2 (Supabase)**: Vào table `orders` → tìm row #0149
6. Edit `tracking_number` → đổi thành `999999999999` (giả lập anh update mã mới)
7. Save
8. **Cửa sổ 1 (khách)**: Quay lại modal đang mở (KHÔNG đóng modal, KHÔNG reload trang)
9. Click nút **Refresh** trong modal (icon mũi tên cong)
10. Đợi 2-3 giây

**Expected**:
- Mã vận đơn trong modal đổi từ `389855804380` → `999999999999`
- Yamato events list cũng reload (hoặc hiện "Không có dữ liệu" vì mã 999... không tồn tại trên Yamato)
- Console (F12) hiện log như `[refetchSingleOrder] Updated order #0149` (nếu có)

**PASS criteria**: Mã vận đơn cập nhật ngay sau khi bấm Refresh, không cần reload trang
**FAIL criteria**: Mã vận đơn vẫn là `389855804380` cũ, hoặc bị error

**Nếu FAIL**:
- DevTools → tab **Network** → click Refresh → có request đến `supabase.co/rest/v1/orders?id=eq.0149` không?
- Nếu KHÔNG → function `refetchSingleOrder` chưa được gọi → **báo em**
- Nếu CÓ request nhưng response 401/403 → vấn đề auth token → **báo em + screenshot**
- Nếu CÓ request 200 OK nhưng UI không update → bug DOM update → **báo em + screenshot**

**Cleanup**: Sau khi test, đổi `tracking_number` back lại `389855804380` trong Supabase.

**PASS / FAIL**: ___________________________________________

---

### TC3 — BFCache auto-refresh khi switch tab/app

**Mục tiêu**: Verify khi khách đóng tab/khoá iPhone rồi quay lại sau >30s, app tự động re-fetch data mới (không hiện cache cũ).

**Setup**:
- [iPhone Emulation] Chrome DevTools với iPhone 14 Pro mode
- Đăng nhập tài khoản khách

**Steps**:
1. Mở https://thuyjapan.com/thanh-vien.html trong iPhone emulation, đăng nhập
2. Đợi dashboard load xong → ghi lại số đơn hàng đang hiện (ví dụ "5 đơn")
3. Trong DevTools → tab **Console** → đợi có log
4. **Cửa sổ Supabase**: thêm 1 đơn test mới cho user này (insert row vào `orders` với `user_id` = user đang test, `status = pending`)
5. **Cửa sổ 1 (khách)**: Mở 1 tab Chrome khác (Cmd+T / Ctrl+T) → vào google.com
6. **Đợi 35 giây** (đặt timer)
7. Quay lại tab thuyjapan.com (click vào tab cũ)
8. Quan sát Console + dashboard

**Expected**:
- Console log: có log như `[BFCache] User returned after 35s, re-fetching...` hoặc tương tự
- Dashboard: số đơn tăng từ 5 → 6 (do em vừa insert đơn mới)
- DevTools Network: có request mới đến `supabase.co/rest/v1/orders`

**PASS criteria**: Sau khi quay lại tab, dashboard tự động cập nhật đơn mới mà không cần reload
**FAIL criteria**: Vẫn hiện 5 đơn, không có request mới

**Nếu FAIL**:
- Console có log gì không? Screenshot console
- Event listener `pageshow` có fire không? (Có thể test bằng `window.addEventListener('pageshow', e => console.log('pageshow', e.persisted))` paste vào console)
- Nếu pageshow không fire → BFCache listener không attach đúng → **báo em**
- Nếu fire nhưng không re-fetch → logic check timestamp sai → **báo em**

**Cleanup**: Xoá đơn test đã insert ở Supabase.

**PASS / FAIL**: ___________________________________________

---

### TC4 — Edge case: Network fail khi Refresh

**Mục tiêu**: Verify khi mất mạng lúc bấm Refresh, app không crash, không xoá data hiện tại, và hiện thông báo lỗi rõ ràng.

**Setup**:
- [DESKTOP] Chrome
- Đăng nhập, mở 1 đơn `shipped`, mở tracking modal

**Steps**:
1. Đăng nhập, click đơn #0149 → click "Tình trạng vận chuyển" → modal mở
2. Ghi lại mã vận đơn hiện tại
3. DevTools → tab **Network** → dropdown "No throttling" → đổi thành **Offline**
4. Click nút **Refresh** trong modal
5. Quan sát modal + Console

**Expected**:
- Modal KHÔNG đóng tự động
- Mã vận đơn cũ vẫn hiện (không bị xoá)
- Có thông báo lỗi như "Không kết nối được mạng" hoặc "Lỗi khi cập nhật" (Vietnamese, friendly)
- Console: log lỗi `Failed to fetch` hoặc tương tự (đây là expected, không phải bug)
- Sau khi đổi Network back lại "No throttling" và bấm Refresh lại → hoạt động bình thường

**PASS criteria**: App không crash, có thông báo lỗi user-friendly, data cũ vẫn còn
**FAIL criteria**: Modal đóng đột ngột / mã vận đơn biến mất / chỉ thấy "undefined" / blank screen

**Nếu FAIL**:
- Screenshot lỗi + Console log → **báo em**
- Có thể do `try/catch` thiếu trong `refetchSingleOrder`

**PASS / FAIL**: ___________________________________________

---

### TC5 — Edge case: Order bị xoá ở Supabase khi Refresh

**Mục tiêu**: Verify khi đơn không còn tồn tại (admin xoá nhầm), app xử lý gracefully, không crash.

**Setup**:
- [DESKTOP] Chrome
- 2 cửa sổ: 1 khách, 1 Supabase
- 1 đơn test có thể xoá (KHÔNG phải #0149 - đó là đơn thật)

**Steps**:
1. **Cửa sổ Supabase**: Tạo đơn test giả (`status = shipped`, `tracking_number = TEST123`, `user_id = ` user test) → ghi nhớ ID
2. **Cửa sổ 1 (khách)**: Đăng nhập, đợi dashboard load → thấy đơn test giả
3. Click đơn test → mở tracking modal
4. **Cửa sổ Supabase**: Xoá đơn test (DELETE row)
5. **Cửa sổ 1 (khách)**: Click **Refresh** trong modal
6. Quan sát

**Expected**:
- Có thông báo lỗi như "Đơn hàng không tồn tại" hoặc "Đơn đã được xoá"
- Modal có thể tự đóng và quay về dashboard
- Dashboard reload → đơn test giả biến mất
- KHÔNG crash, KHÔNG blank screen

**PASS criteria**: Lỗi được handle, có thông báo user-friendly
**FAIL criteria**: Crash / blank / "Cannot read property X of undefined"

**Nếu FAIL**:
- Screenshot + Console log → **báo em**

**PASS / FAIL**: ___________________________________________

---

### TC6 — Regression test: Existing flows vẫn work

**Mục tiêu**: Verify 3 fix mới KHÔNG phá các tính năng cũ. Đây là test quan trọng nhất - nếu fail nghĩa là có regression.

**Test mỗi item dưới đây, tick vào nếu PASS**:

#### Đăng nhập / Đăng xuất
- [ ] Đăng nhập bằng email + password OK
- [ ] Đăng nhập bằng Google OK (nếu có nút Google login)
- [ ] Đăng xuất → quay về trang login OK
- [ ] Login lại → vào dashboard OK

#### Dashboard danh sách đơn
- [ ] Đơn `pending` hiện badge "Chờ thanh toán" (màu vàng/cam)
- [ ] Đơn `paid` hiện badge "Đã thanh toán"
- [ ] Đơn `shipped` hiện badge "Đang giao"
- [ ] Đơn `delivered` hiện badge "Đã nhận"
- [ ] Sắp xếp đơn mới nhất lên trên đúng thứ tự
- [ ] Hiện đầy đủ tổng tiền + số items mỗi đơn

#### Chi tiết đơn hàng
- [ ] Click đơn → modal/page chi tiết mở
- [ ] Hiện đầy đủ địa chỉ giao
- [ ] Hiện đầy đủ list items + giá + số lượng
- [ ] Hiện ngày đặt + trạng thái
- [ ] Hiện ghi chú (nếu có)

#### Tracking modal
- [ ] Click "Tình trạng vận chuyển" → modal mở (chỉ hiện cho đơn `shipped`)
- [ ] Hiện mã vận đơn
- [ ] Hiện list events Yamato (ngày, giờ, địa điểm, trạng thái)
- [ ] Nút Refresh có visible
- [ ] Nút đóng modal hoạt động (X / ESC / click backdrop)

#### Mobile responsive
- [ ] [iPhone Emulation] Layout không bị vỡ
- [ ] Buttons đủ to để bấm bằng ngón tay
- [ ] Modal không tràn màn hình
- [ ] Text không bị cắt

#### Tab "Kho hàng" (Inventory)
- [ ] Tab Kho hàng load đúng
- [ ] Hiện list sản phẩm + tồn kho
- [ ] Search/filter work

**PASS criteria**: TẤT CẢ items trên đều tick được
**FAIL criteria**: BẤT KỲ item nào fail = REGRESSION = báo em ngay (CRITICAL)

**Nếu FAIL bất kỳ item nào**:
- Screenshot ngay
- Note rõ item nào fail
- Báo em ngay - đây là regression nghiêm trọng

**Tổng PASS / FAIL**: ___________________________________________

---

## Bảng tổng hợp kết quả test

Sau khi xong, anh fill vào bảng này và gửi cho em:

| Test Case | Mô tả ngắn | PASS / FAIL | Ghi chú (nếu fail) |
|---|---|---|---|
| TC1 | Cache TTL 60s | | |
| TC2 | Refresh button re-fetch order | | |
| TC3 | BFCache auto-refresh | | |
| TC4 | Network fail handle | | |
| TC5 | Order deleted handle | | |
| TC6 | Regression test | | |

---

## Nếu test FAIL — Action map

| Test case fail | Mức độ | Nguyên nhân nghi ngờ | Hành động |
|---|---|---|---|
| **TC1** | High | Cache TTL constant không được load / 1 trong 3 read sites quên check TTL | Báo em - em check lại 3 chỗ render trong `thanh-vien.html` |
| **TC2** | **CRITICAL** | `refetchSingleOrder` không work / không update DOM | Báo em ngay - đây là fix chính, fail = bug khách Tú vẫn còn |
| **TC3** | Medium | BFCache `pageshow` listener không attach / logic timestamp sai | Báo em - test lại logic re-fetch trigger |
| **TC4** | Medium | `try/catch` thiếu trong refetch logic | Báo em - thêm error handling |
| **TC5** | Low | Edge case không common nhưng cần handle | Báo em khi tiện |
| **TC6** | **CRITICAL** | Regression - fix làm hỏng feature cũ | **Báo em NGAY** - có thể cần rollback Cloudflare deployment |

**Quy ước báo em**:
- Mức **CRITICAL**: Nhắn em ngay (Discord/Slack/SMS), em sẽ ưu tiên fix trong vài tiếng
- Mức **High**: Nhắn em trong ngày, em fix trong 24h
- Mức **Medium/Low**: Để mai cũng được, em sẽ fix trong sprint sau

Khi báo em, gửi kèm:
1. Tên test case fail (TC1/TC2/...)
2. Screenshot lỗi (Cmd+Shift+4 trên Mac, Win+Shift+S trên PC)
3. Console log nếu có (F12 → tab Console → copy paste)
4. Network tab screenshot nếu liên quan API
5. Mô tả ngắn: "Em làm step X, expected là Y nhưng thực tế Z"

---

## Nếu PASS hết — Next steps

Tuyệt vời. Khi anh tick PASS hết 6 test cases, làm tiếp các việc sau:

### Immediate (làm ngay)
1. **Nhắn khách Tú**: "Chị Tú ơi, em vừa update app. Chị thử đăng xuất rồi đăng nhập lại trên iPhone xem có thấy mã vận đơn mới không nha. Có gì báo em."
2. **Monitor logs Cloudflare**: 24h sau deploy, vào Cloudflare → Analytics → check error rate có spike không. Nếu error rate >2% (so với baseline) → có vấn đề, báo em.

### Em sẽ làm (anh không cần làm gì)
1. Update handover doc V7 → V8 với section "Cache TTL fix" chi tiết
2. Update memory với policy mới: **"Từ nay mỗi fix code phải có test plan kèm theo trước khi deploy production"**
3. Ghi nhận pattern trong reference doc: BFCache + cache TTL anti-pattern (để dùng lại cho project sau)

### Optional (nếu anh muốn làm thêm)
1. A/B test: Theo dõi 1 tuần xem có khách nào complain về "data cũ" nữa không. Nếu KHÔNG → bug đã fix dứt điểm.
2. Telemetry: Add 1 event `cache_ttl_expired` vào Google Analytics để biết tần suất cache hết hạn (data sẽ giúp tune TTL nếu cần)

---

## Phụ lục — Cheat sheet command DevTools

| Việc cần làm | Phím tắt / Command |
|---|---|
| Mở DevTools | `F12` hoặc `Ctrl+Shift+I` (Win) / `Cmd+Option+I` (Mac) |
| Toggle device emulation | `Ctrl+Shift+M` (Win) / `Cmd+Shift+M` (Mac) |
| Clear localStorage | DevTools → Application → Local Storage → click ổ khoá → Clear All |
| Hard reload (bypass cache) | `Ctrl+Shift+R` (Win) / `Cmd+Shift+R` (Mac) |
| Throttle network offline | DevTools → Network tab → "No throttling" dropdown → "Offline" |
| Filter network XHR only | DevTools → Network → click "Fetch/XHR" |
| Search trong code đang chạy | `Ctrl+Shift+F` (Win) / `Cmd+Option+F` (Mac) trong DevTools |
| Console paste 1 line code | Tab Console → paste → Enter |

---

## Liên lạc

Nếu có gì không hiểu trong test plan này, hoặc bị stuck step nào → nhắn em ngay, em hỗ trợ click-by-click.

Em chúc anh test thuận lợi.

— Em (Agent 7/8)
