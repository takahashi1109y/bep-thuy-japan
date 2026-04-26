# 📢 Hướng Dẫn Gửi Email / Tin Nhắn Hàng Loạt

## ✅ Tính năng mới

### 1. Email tự động cho khách hàng
| Sự kiện | Email gửi tự động? |
|---|---|
| 🆕 Khách đặt đơn | ✅ Đã có sẵn |
| ✅ Admin xác nhận thanh toán | ✅ **Đã wire** — gửi email "Đã xác nhận" với tổng tiền |
| 🚚 Admin nhập mã vận đơn + đánh dấu đã gửi | ✅ **Đã wire** — gửi email "Đã gửi đi" với tracking + bảo quản |

### 2. Trang Gửi Tin (admin tab mới `📢 Gửi Tin`)
3 chế độ:
- 📧 **Email** — gửi email hàng loạt cho khách (qua Gmail Apps Script, quota 100/ngày free)
- 💬 **Tin nhắn trong app** — gửi message vào in-app inbox của khách (xem ở `/thanh-vien` tab Tin Nhắn)
- 🔔 **Push** — sắp có (cần Firebase + app live)

7 segment chọn người nhận:
- Tất cả thành viên đã đăng ký
- Tất cả có email (gồm guest đã đặt đơn)
- 👑 VIP (≥10 đơn)
- ⭐ Thân thiết (≥3 đơn)
- 😴 Không quay lại 30+ ngày
- 🆕 Mới đặt 7 ngày qua
- ✏️ Tự nhập danh sách email (1 dòng = 1 email)

---

## 📋 Cách dùng

### Gửi email cảm ơn / khuyến mãi:
1. Admin → tab **📢 Gửi Tin**
2. Chọn mode **📧 Email**
3. Chọn segment (ví dụ: VIP)
4. Điền **Tiêu đề** + **Nội dung** (hỗ trợ HTML cơ bản, xuống dòng tự thành `<br>`)
5. Bấm **🧪 Gửi thử (chỉ tới em admin)** để xem trước email trông thế nào
6. Sau đó bấm **📤 Gửi Tới Tất Cả** → Apps Script chạy ngầm gửi 100 email/phút

### Email mẫu (khách nhận sẽ trông như vầy):
- Header gradient nâu vàng có "Bếp Thuỷ Japan"
- Nội dung anh viết nằm ở giữa
- Footer có link website + SDT + email

### Variables thay thế tự động:
- `{{name}}` → tên khách
- `{{email}}` → email khách

Ví dụ:
```
Chào {{name}},

Cảm ơn anh/chị đã đặt hàng tại Bếp Thuỷ Japan!
```

---

## ⚠️ Lưu ý quota

- **Gmail free**: 100 emails/ngày → đủ cho ~50 khách + 30 đơn email/ngày
- **Gmail Workspace**: 1500/ngày — nếu cần gửi nhiều hơn

Nếu vượt quota:
- Apps Script log lỗi `Mail quota exceeded`
- Phần email còn lại không gửi được trong ngày
- Tomorrow reset

---

## 🔧 USER ACTION trước khi dùng

1. Update code Apps Script lần cuối:
   - Mở https://script.google.com → project Bếp Thuỷ Japan
   - Paste đè code mới từ:
     https://raw.githubusercontent.com/takahashi1109y/bep-thuy-japan/main/google-apps-script.js
   - **Cmd+S** Save → Deploy → Manage deployments → Edit → New version → Deploy

2. (Tùy chọn) Test:
   - Vào admin → tab **📢 Gửi Tin** → Email
   - Soạn email test → bấm **🧪 Gửi thử** → check email admin

3. (Tùy chọn) Test auto-emails:
   - Tạo 1 đơn test trên web → upload biên lai
   - Vào admin → bấm "✅ XN TT" → check email khách (nếu có) → phải nhận email "Đã xác nhận"
   - Bấm "🚚 Đã gửi" + nhập tracking → check email khách → phải nhận "Đã gửi đi" với mã vận đơn

---

## 📱 Khi có app Bếp Thuỷ JP

Mode **🔔 Push** sẽ hoạt động sau khi anh:
1. Setup Firebase project
2. Apple Developer approve
3. Em wire push notification

→ Tin nhắn sẽ tự push lên app khách đã cài + đăng ký nhận thông báo.
