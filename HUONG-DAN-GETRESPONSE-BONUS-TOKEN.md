# Huong Dan Refactor Welcome Bonus — GetResponse

## Boi canh

**Truoc**: Button email gui link chung `?claim=welcome` — bat ky ai co link deu claim duoc diem cua nguoi khac.

**Sau**: Link rieng moi nguoi `?claim=welcome&token=[[cus bonus_token]]` — backend check token khop voi user moi nhan duoc diem.

**Risk**: Neu `bonus_token` chua duoc sync vao GR, `[[cus bonus_token]]` se render thanh chuoi rong. Frontend se hien "link khong hop le" thay vi nhan diem. Giai phap: chay Phan 3 truoc khi deploy.

---

## Phan 1: Tao custom field `bonus_token` trong GR (5 phut)

1. Login GetResponse tai https://app.getresponse.com
2. Menu trai: **Contacts** → **Settings** (bieu tuong rang cua phia duoi)
3. Tab **Custom fields** → nut **"Add custom field"** (goc phai tren)
4. Dien:
   - **Field name**: `bonus_token` (lowercase, khong dau, khong khoang trang)
   - **Field type**: **Text** (KHONG chon Phone, Email, hay Number)
5. Click **Save**
6. Sau khi tao xong, click vao ten field vua tao → GR hien Field ID dang `abc123def456...` (24 ky tu hex). Copy lai.
7. Mo Apps Script editor: https://script.google.com → mo project Bep Thuy Japan
8. Click bieu tuong banh rang (Settings) ben trai → chon **Script properties**
9. Click **Add script property**:
   - Key: `GR_CF_BONUS_TOKEN`
   - Value: dan 24 ky tu field ID vua copy
10. Click **Save script properties**

---

## Phan 2: Sua email template trong GR UI (3 phut)

1. GR → menu trai **Email marketing** → **Autoresponders** (hoac **Automation** neu dung workflow)
2. Tim autoresponder co ten chua "Welcome" hoac "100 diem" — day la email gui luc dang ky thanh cong
3. Click **Edit**
4. Trong trinh sua, tim button co text **"Nhan 100 Diem Ngay"**
5. Click vao button → chon **Edit link** (bieu tuong xich)
6. Xoa URL cu, dan URL moi:
   ```
   https://www.thuyjapan.com/thanh-vien?claim=welcome&token=[[cus bonus_token]]
   ```
   Luu y: `[[cus bonus_token]]` phai co dung 2 dau ngoac vuong moi ben — day la syntax personalization cua GR (tuong tu `[[name]]` dang dung o dong chao)
7. Click **Apply** / **OK**
8. Click **Save** template
9. Click **Preview** → chon 1 contact that trong danh sach → GR se render `[[cus bonus_token]]` thanh gia tri thuc cua contact do. Kiem tra link co dang `...?claim=welcome&token=abc123...` khong.
10. **Test gui**: Gui test email cho chinh minh → mo email → click button → xac nhan URL co token that (32 ky tu hex) trong thanh dia chi trinh duyet

---

## Phan 3: Sync existing contacts (Khach cu chua co token trong GR)

Khach da dang ky truoc khi co tinh nang token: ho da co trong GR nhung field `bonus_token` dang trong.

**Option A — Apps Script utility** (khuyen dung):

Agent GR API (Viec 3) se viet function `syncBonusTokensToGR_()`. Khi co function do, anh chay theo cach sau:

1. Mo Apps Script editor → mo file chua function `syncBonusTokensToGR_`
2. Chon function nay tu dropdown "Select function" (o tren cung trinh editor)
3. Click nut **Run** (tam giac)
4. Xem log o **View → Logs**: moi dong la 1 email duoc update, cuoi cung hien `Done: X/Y updated`
5. Chay 1 lan duy nhat (idempotent — chay lai khong gay loi, chi bo qua nhung contact da co token)

Logic function se lam:
- Query Supabase: `SELECT u.email, p.bonus_token FROM auth.users u JOIN profiles p ON u.id = p.id WHERE p.bonus_claimed = false`
- Voi moi email → goi GR API PATCH de cap nhat field `bonus_token`
- Anh co khoang 80 contacts → chay xong trong vong 1 phut

**Option B — Import CSV tu Supabase** (backup neu Apps Script loi):

1. Mo Supabase → SQL Editor → chay:
   ```sql
   SELECT u.email, p.bonus_token
   FROM auth.users u
   JOIN profiles p ON u.id = p.id
   WHERE p.bonus_claimed = false AND p.bonus_token IS NOT NULL;
   ```
2. Click **Export CSV**
3. GR → **Contacts** → **Import** → **Import from file**
4. Upload CSV, map cot `email` → Email, cot `bonus_token` → custom field `bonus_token`
5. Chon list hien tai, click **Import**

---

## Phan 4: Verify

Kiem tra end-to-end sau khi xong ca 3 phan tren:

1. **Dang ky account test moi** (dung email phu, VD gmail alias `+test1`)
2. Mo email chao mung → kiem tra button link co `?claim=welcome&token=<32-char-hex>` khong (hover chuot len button hoac xem nguon email)
3. Click button → dang nhap bang account test → kiem tra trang `/thanh-vien` hien "Ban da nhan 100 diem" va so du tang len 100
4. Click lai button (hoac reload URL cu) → phai hien thong bao "da claim" hoac "khong hop le" (khong nhan them diem lan 2)
5. Copy URL co token, mo incognito + dang nhap bang account khac → phai hien "token nay khong thuoc ve ban" (not_your_token error)

---

## Rollback (neu co loi)

**Neu template GR bi loi** (nguoi dung nhan email voi `[[cus bonus_token]]` chua duoc resolve):
1. Vao GR → sua template → revert button href ve:
   ```
   https://www.thuyjapan.com/thanh-vien?claim=welcome
   ```
   Frontend hien thong bao "link khong co token — vui long lien he ho tro" (legacy fallback).

**Neu can tat tinh nang token hoan toan**: lien he agent de revert code backend (khong khuyen dung — mat bao mat claim).

---

*Cap nhat lan cuoi: 2026-05-08. Lien quan: V10 handover doc, Viec 3 (GR API), Viec 4 (backend token validation).*
