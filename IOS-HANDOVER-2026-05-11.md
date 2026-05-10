# 📱 iOS APP HANDOVER — Session Mac

**Last update**: 2026-05-11 12:30 JST
**For**: Anh + Mac Claude (khi anh open Mac next)
**Latest commit web**: `984b99c` (CLAUDE.md Section 8/9/10)

---

## 🚀 QUICK START (5 phút khi mở Mac)

```bash
# Step 1: Pull latest code web
cd ~/path/to/bep-thuy-japan-clone-or-just-pull
git pull origin main

# Step 2: Check iOS Capacitor config
cd ~/bep-thuy-app
cat capacitor.config.ts || cat capacitor.config.json

# Step 3: Decide Mode 1 vs Mode 2 (xem section "Capacitor Mode Decision" bên dưới)

# Step 4 (Mode 1 — recommend): Verify config OK → app auto load thuyjapan.com mới nhất
# Step 4 (Mode 2): npx cap sync ios → rebuild IPA → resubmit App Store

# Step 5: Mở Xcode để check signing + Apple Team ID
open ios/App/App.xcworkspace
```

---

## 🌐 WEB PROJECT STATE (commits đã ship đến 2026-05-11)

### **Major features ACTIVE production trong 2 sessions gần đây**

| Feature | Status | Commits | Files chính |
|---------|--------|---------|-------------|
| **Welcome bonus 100đ** | ✅ Active E2E | `f27c5bb`, `5bdcb81`, `c90ca65` | `thanh-vien.html`, `google-apps-script.js`, `supabase-fix-points-balance-final.sql` |
| **Email reminder bulk send** | 🟡 40/143 sent (mai gửi tiếp ~100) | `5bdcb81`, `c90ca65` | Apps Script `sendWelcomeBonusReminderRealSendAll` |
| **P1 Anti-fraud (4 layers)** | ✅ Active | `6b3f28c`, `200d03b`, `5a2c823` | `supabase-anti-fraud-{disposable,ip-rate-limit}.sql` + `checkWelcomeBonusFraud` cron |
| **Birthday Anti-fraud Option B (4 layers)** | ✅ Active | `22a0fd7` | `supabase-anti-fraud-birthday-discount.sql` + `index.html` `birthdayEligible` flag |
| **Referral Program (5/7 phases)** | 🟡 Code done, anh test E2E pending | `bd519e1`, `8e10bdb`, `f37b084`, `de5a0a7`, `7cce022`, `af69de8`, `3edb8a6`, `e704afc`, `50f9cd3` | `supabase-referral-program-{phase1,phase1b-patch,phase5-email}.sql`, panel-referral trong `thanh-vien.html`, `index.html` checkout flow |
| **CLAUDE.md update Section 8/9/10** | ✅ Live | `984b99c` | `CLAUDE.md` |
| **Order summary FB compact** | ✅ Live | `dbca31e` | `index.html` line 2434 |

### **Anti-fraud coverage hiện tại**

| Layer | Welcome bonus | Birthday discount | Referral |
|-------|---------------|-------------------|----------|
| UNIQUE canonical email | ✅ | – | ✅ (self-refer block) |
| UNIQUE phone | ✅ | – | ✅ (self-refer block) |
| Email verified check | ✅ | – | – |
| Disposable email blacklist (80+ domains) | ✅ | – | – |
| IP rate limit (3/24h) | ✅ | – | ✅ (24h) |
| Device fingerprint | – | – | ✅ |
| Lifetime cap | – | – | ✅ (20 referrals) |
| Lock immutable (after first set) | – | ✅ (birthday) | – |
| Age threshold (≥30 days) | – | ✅ | – |
| Cooldown (365 days) | – | ✅ | – |
| Telegram alert anomaly | ✅ (`checkWelcomeBonusFraud` Hour) | – | – |

### **Pending implementation (chưa code)**

- **NPS Survey** (anh request 2026-05-11) — spec đầy đủ trong `pending_thuyjapan_action_items.md`. Effort 8h.
- **Referral Phase 6** — E2E test happy path (anh đặt đơn test với ?ref=)
- **Referral Phase 7** — Documentation update (em sẽ làm)

---

## 📱 iOS APP STATE (chưa change từ V4 — 2026-04-26/27)

### **Đã shipped V4**:
- Capacitor 8 wrapper iOS app
- Bundle ID: `com.bepthuyjapan.app`
- 4 screenshots App Store ở `~/bep-thuy-app/screenshots/`
- Đã build + install iPhone 14 Pro Max (anh) qua Personal Team — cert 7 ngày

### **Chưa làm**:
- ❌ Apple Developer Team ID (anh chưa cung cấp) — **BLOCKER**
- ❌ Configure signing với paid Apple Developer account
- ❌ Build IPA cert 1 năm
- ❌ TestFlight upload + invite testers
- ❌ App Store production submission
- ❌ Push notification (Firebase chưa tạo)
- ❌ Deep Links (`bepthuy://order/123`)
- ❌ Native Share

---

## 🔍 CAPACITOR MODE DECISION

### **Mode 1: Remote URL** (server.url) ⭐ recommend

`capacitor.config.ts` có config:
```ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bepthuyjapan.app',
  appName: 'Bếp Thuỷ Japan',
  webDir: 'dist',
  server: {
    url: 'https://www.thuyjapan.com',  // ← Key dòng này
    cleartext: false,
    androidScheme: 'https'
  }
};
export default config;
```

**Pros**:
- ✅ Mọi commit web push → Vercel deploy → app thấy NGAY (không rebuild IPA)
- ✅ Single source of truth (`thuyjapan.com`)
- ✅ Bếp Thuỷ deploy 5-10x/tuần — Mode 1 essential
- ✅ Welcome bonus, Referral, Anti-fraud — tất cả live trong app NGAY

**Cons**:
- ⚠️ App cần Internet (không offline mode) — OK cho e-commerce
- ⚠️ Apple có thể reject "Just a webview" — cần thêm native features (Push, Deep Links, Save image, Camera) để được approve

### **Mode 2: Bundled local files**

Không có `server.url` trong config → app load HTML/JS từ `ios/App/App/public/`.

**Mỗi update web cần**:
```bash
cd ~/bep-thuy-app
# 1. Copy web files mới vào dist/
cp -r ~/path/to/web-build/* dist/
# 2. Sync sang iOS
npx cap sync ios
# 3. Mở Xcode, archive, upload App Store Connect
open ios/App/App.xcworkspace
# 4. Đợi Apple review 1-7 ngày
```

**Cons**:
- ❌ Apple review chậm 1-7 ngày → không khả thi cho rapid iteration
- ❌ Mỗi commit web không live → khách dùng app version cũ
- ❌ Phải maintain 2 versions: web latest + app frozen

---

## 🎯 RECOMMEND CHO BẾP THUỶ

**→ Mode 1 (Remote URL)** ⭐

**Lý do**:
1. Anh deploy web 5-10 lần/tuần — Mode 2 sẽ không follow kịp
2. Single source of truth giảm bug
3. Native features (Push, Share, Camera) vẫn dùng được qua Capacitor plugins
4. Apple acceptance tip: thêm 2-3 native features (Push, Share native, Save image) → đủ "native value-add" → Apple approve

**Action khi mở Mac**:

### **Bước 1: Verify Mode**

```bash
cat ~/bep-thuy-app/capacitor.config.ts
# Tìm line: server: { url: 'https://...' }
# - Có → Mode 1 ✅ (no action needed)
# - Không có → Mode 2 (cần switch)
```

### **Bước 2A: Nếu Mode 2 → switch sang Mode 1**

```bash
cd ~/bep-thuy-app

# Edit capacitor.config.ts (hoặc .json)
# Thêm block server:
```

Add to config:
```ts
server: {
  url: 'https://www.thuyjapan.com',
  cleartext: false,
  androidScheme: 'https'
}
```

```bash
# Sync changes
npx cap sync ios

# Archive + upload (cần Apple Developer Team ID đã)
open ios/App/App.xcworkspace
```

### **Bước 2B: Nếu Mode 1 → no code change cần**

Chỉ cần verify app load được `thuyjapan.com` mới nhất (mở app trên iPhone, navigate `/thanh-vien?tab=referral` → thấy panel referral mới).

---

## 📋 ACTION CHECKLIST CHO MAC SESSION

### Phase A — Setup & Verify (15 phút)
- [ ] Pull latest commit web (`git pull origin main` trong web repo)
- [ ] `cd ~/bep-thuy-app && cat capacitor.config.ts` → identify Mode
- [ ] Mở Xcode `open ios/App/App.xcworkspace`
- [ ] Mở app trên iPhone vật lý → verify thấy:
  - Tab "🎁 Giới Thiệu Bạn Bè" (Referral Phase 3 UI)
  - 3 share buttons FB/Messenger/Zalo có background xanh/hồng
  - Welcome bonus banner sau signup
  - Birthday banner nếu sinh nhật

### Phase B — Apple Developer Team ID (5 phút)
- [ ] Login https://developer.apple.com/account
- [ ] Click tab **Membership**
- [ ] Copy **Team ID** (10 ký tự, dạng `ABC123XYZ4`)
- [ ] Send Team ID cho Mac Claude

### Phase C — Build IPA cert 1 năm (1.5h)
- [ ] Xcode → project settings → "Signing & Capabilities"
- [ ] Đổi Team từ "Personal Team (anh)" → Apple Developer paid team
- [ ] Verify `Bundle Identifier = com.bepthuyjapan.app`
- [ ] Product → Archive → Distribute App → Ad Hoc hoặc App Store Connect
- [ ] Upload IPA

### Phase D — TestFlight (2h)
- [ ] App Store Connect → My Apps → TestFlight tab
- [ ] Wait for processing (~30 min sau upload)
- [ ] Add Internal Testers (max 100):
  - takahara88jp
  - takahashi1109y
  - support@thuyjapan
  - thanghoang1109
  - 1-2 khách thân thiết
- [ ] Send invite emails
- [ ] Test 3-7 ngày trước App Store submission

### Phase E — App Store Production (2h)
- [ ] App Store Connect → Add new version
- [ ] Upload 4 screenshots (đã có ở `~/bep-thuy-app/screenshots/`)
- [ ] Listing: Tiếng Việt + tiếng Nhật + English
- [ ] Privacy questions (data collection: email, address, payment via 3rd party)
- [ ] Submit for Review
- [ ] Wait 1-7 ngày Apple review

---

## 📁 FILES MAC CLAUDE NÊN ĐỌC TRƯỚC

Khi anh start Mac session, paste link list này cho Mac Claude:

```
Tài liệu cần đọc trong K:\bep-thuy-japan (đã pull về Mac):
1. CLAUDE.md — quy trình + 10 sections rules (mới update Section 8/9/10)
2. IOS-HANDOVER-2026-05-11.md (file này)
3. ROADMAP-30-DAYS.md — lookup W3.6/W3.7/W3.8/W4.5/W4.6/W4.7
4. SPEC-REFERRAL-FEATURE.md — referral 7 phases context
5. LESSONS-LEARNED-2026-05-10-11.md — 12 bài học
6. RULES-CLASSIFICATION-2026-05-11.md — rule duyệt history

Memory pending action items:
- Memory ở Windows → Mac chưa có. Mac Claude tham khảo từ
  K:\bep-thuy-japan\IOS-HANDOVER-2026-05-11.md (file này) là đủ.
```

---

## 🧠 MEMORY SYNC

**Windows Claude memory** lưu tại `C:\Users\Owner\.claude\projects\K--AI-Agent-Business\memory\` — KHÔNG sync sang Mac tự động.

**Mac Claude** sẽ có memory riêng. Khi anh open Mac session đầu tiên, paste:

```
Em đọc IOS-HANDOVER-2026-05-11.md trong repo bep-thuy-japan để hiểu state.
File chứa tất cả features đã ship + roadmap iOS + decision tree Mode 1/Mode 2.
```

Em (Mac Claude) sẽ tự động build memory mới based on file này.

---

## 🚦 DECISION TREE WHEN MAC SESSION OPEN

```
START
  │
  ├─ App đã install trên iPhone anh? → Verify load được tab Giới Thiệu Bạn Bè
  │      ├─ YES → Mode 1 đang hoạt động ✅ → focus Phase B (Team ID)
  │      └─ NO  → Check Capacitor config
  │              ├─ Mode 2 → switch Mode 1 (Bước 2A)
  │              └─ Mode 1 nhưng app cũ → npx cap sync ios + reinstall
  │
  ├─ Anh có Apple Developer paid account chưa?
  │      ├─ YES → Get Team ID → Phase C build IPA
  │      └─ NO  → Đăng ký https://developer.apple.com/programs/ ($99/năm)
  │              hoặc Free Personal Team (giới hạn 7 ngày, OK cho test)
  │
  └─ Phase D TestFlight → Phase E App Store
```

---

## 💬 KHI MAC CLAUDE START

Anh paste cho Mac Claude:

```
Anh đang mở Mac để tiếp tục dự án iOS app Bếp Thuỷ Japan.
Em đọc K:\bep-thuy-japan\IOS-HANDOVER-2026-05-11.md để biết state.
File này có:
- Tổng hợp tất cả features đã ship trên web (latest commit 984b99c)
- Capacitor mode decision tree
- Action checklist Phase A→E
- Apple Developer Team ID là blocker

Anh cần em help:
1. Verify Capacitor mode trên Mac
2. Setup Apple Developer Team ID (nếu chưa)
3. Build IPA + TestFlight
4. App Store submission

Em start với Phase A — pull latest web + check Capacitor config.
```

---

## 📞 RESUME PRIORITY

Khi anh mở Mac:
1. **Phase A** (15 phút) — Verify state
2. **Phase B** (5 phút) — Apple Team ID **← ưu tiên cao nhất**
3. **Phase C/D/E** — sau khi có Team ID

**Em (Windows Claude) hôm nay đã**:
- Push 24+ commits production
- Update CLAUDE.md với Section 8/9/10 (anh duyệt)
- Document đầy đủ trong file này

**Em (Mac Claude) sẽ**:
- Continue iOS native enhancements
- Guide Xcode click-by-click
- Coordinate App Store submission

Anh nghỉ ngơi 🌟. Mai hoặc khi nào rảnh mở Mac, mọi thứ ready.
