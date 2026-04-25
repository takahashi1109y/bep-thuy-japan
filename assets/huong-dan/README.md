# Ảnh hướng dẫn đăng ký thành viên

Thư mục này chứa screenshots dùng cho trang `/huong-dan-thanh-vien`.

## Danh sách file cần có

| Tên file | Mô tả |
|----------|-------|
| `buoc3-inbox.png` | Hòm thư Gmail có 2 emails Bếp Thuỷ (xác nhận đăng ký + 100 điểm) |
| `buoc4-1-email.png` | Email "Xác nhận đăng ký" mở ra, có nút đỏ "✅ Xác Nhận Email" |
| `buoc4-2-popup.png` | Popup "Mở bằng" — chọn trình duyệt sau khi bấm nút xác nhận |
| `buoc4-3-thanhvien.png` | Trang Thành Viên đã đăng nhập thành công (0 điểm) |
| `buoc5-1-email-top.png` | Email "100 điểm chào mừng" — phần đầu (header) |
| `buoc5-2-button.png` | Cuối email "100 điểm" với nút đỏ "✨ KÍCH HOẠT 100 ĐIỂM NGAY" |
| `buoc5-3-popup.png` | Popup "Mở bằng" — chọn trình duyệt sau khi bấm kích hoạt |

## Vị trí highlight (vòng vàng)

Highlight được đặt qua CSS overlay trong HTML. Nếu vị trí lệch, sửa
trực tiếp trong file `/huong-dan-thanh-vien.html` ở các thuộc tính
`style="top:X%; left:Y%; width:W%; height:H%;"` của `<div class="highlight-ellipse">`.
