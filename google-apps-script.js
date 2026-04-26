// ============================================================
// BEP THUY JAPAN - Google Apps Script
// Paste toan bo code nay vao Apps Script Editor
// ============================================================

const SHEET_NAME_ORDERS  = 'Don Hang';
const SHEET_NAME_COUNTER = 'Counter';
const SHEET_NAME_STATS   = 'Thong Ke San Xuat';
const SHEET_NAME_MEMBERS = 'Thanh Vien';

// ---- SUPABASE & GETRESPONSE CONFIG ----
// SECURITY: KHONG hardcode keys vao day. Dat trong Script Properties:
//   Apps Script Editor -> Project Settings (banh rang) -> Script Properties -> Add script property
//   Can set cac keys sau:
//     SUPABASE_URL         = https://curcsvwvjkjewtonkhnr.supabase.co
//     SUPABASE_SERVICE_KEY = <paste service_role key moi sau khi rotate>
//     GR_API_KEY           = <paste GetResponse API key>
//     GR_CAMPAIGN_ID       = fwvbg
//     GR_FIELD_PHONE       = nBzLBu
//     GR_FIELD_PREFECTURE  = nQVOld
//     GR_FIELD_SOURCE      = nQVOtI

function _prop(key, fallback) {
  try {
    var v = PropertiesService.getScriptProperties().getProperty(key);
    return v || fallback || '';
  } catch (e) {
    return fallback || '';
  }
}

const SUPABASE_URL         = _prop('SUPABASE_URL', 'https://curcsvwvjkjewtonkhnr.supabase.co');
const SUPABASE_SERVICE_KEY = _prop('SUPABASE_SERVICE_KEY', '');
const GR_API_KEY           = _prop('GR_API_KEY', '');
const GR_CAMPAIGN_ID       = _prop('GR_CAMPAIGN_ID', 'fwvbg');
const GR_FIELD_PHONE       = _prop('GR_FIELD_PHONE', 'nBzLBu');
const GR_FIELD_PREFECTURE  = _prop('GR_FIELD_PREFECTURE', 'nQVOld');
const GR_FIELD_SOURCE      = _prop('GR_FIELD_SOURCE', 'nQVOtI');

// ID cua spreadsheet YAMATO_ORDER
const YAMATO_SS_ID = '13QMRQsEeODAOc-gb9mtqnNcvvyqqz8nN05X6OJevK_A';
const YAMATO_SHEET = '\u5916\u90e8\u30c7\u30fc\u30bf\u53d6\u308a\u8fbc\u307f\u57fa\u672c\u30ec\u30a4\u30a2\u30a6\u30c8';

// Bang ma san pham -> ma Yamato
const CODE_MAP = {
  'GT':        { code: 'g',      byBox: false },
  'GKT':       { code: 'gkt',    byBox: false },
  'C':         { code: 'c',      byBox: false },
  'CKT':       { code: 'ckt',    byBox: false },
  'CLUA TIEU': { code: 'clua t', byBox: false },
  'CLUA':      { code: 'clua',   byBox: false },
  'M':         { code: 'm',      byBox: false },
  'MKT':       { code: 'mkt',    byBox: false },
  'Nem':       { code: 'nem',    byBox: true  },
  'Pte':       { code: 'pte',    byBox: true  },
};

// ---- Rate Limiting (anti-abuse) ----
// Gioi han 10 requests/60s tren moi IP (dua tren ScriptProperties)
function checkRateLimit_(key) {
  try {
    var props = PropertiesService.getScriptProperties();
    var nowSec = Math.floor(Date.now() / 1000);
    var windowSec = 60;
    var maxReq = 10;
    var bucketKey = 'rl_' + key;
    var raw = props.getProperty(bucketKey);
    var bucket = raw ? JSON.parse(raw) : { start: nowSec, count: 0 };
    if (nowSec - bucket.start > windowSec) {
      bucket = { start: nowSec, count: 0 };
    }
    bucket.count += 1;
    props.setProperty(bucketKey, JSON.stringify(bucket));
    return bucket.count <= maxReq;
  } catch (err) {
    Logger.log('Rate limit check error: ' + err);
    return true; // fail-open de khong chan khach that khi co loi
  }
}

// ---- Validation helpers ----
function validatePayload_(data) {
  if (!data || typeof data !== 'object') return 'Payload invalid';
  if (data.type === 'member') {
    if (!data.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) return 'Email invalid';
    if (!data.name || data.name.length < 1 || data.name.length > 100) return 'Name invalid';
    if (data.phone && data.phone.length > 30) return 'Phone too long';
  } else {
    // Don hang
    if (typeof data.total !== 'number' || data.total < 0 || data.total > 10000000) return 'Total invalid';
    if (data.pointsUsed && (typeof data.pointsUsed !== 'number' || data.pointsUsed < 0 || data.pointsUsed > 100000)) return 'pointsUsed invalid';
    if (data.userId && !/^[0-9a-f-]{36}$/i.test(data.userId)) return 'userId invalid';
  }
  return null; // OK
}

// ---- Xu ly POST request tu trang web ----
function doPost(e) {
  try {
    // Rate limit theo session token / user agent hash
    var clientKey = (e.parameter && e.parameter.source) || 'anon';
    if (!checkRateLimit_(clientKey)) {
      return buildResponse({ success: false, error: 'Too many requests. Please wait 1 minute.' });
    }

    const data = JSON.parse(e.postData.contents);

    // Validate payload
    var validationError = validatePayload_(data);
    if (validationError) {
      return buildResponse({ success: false, error: 'Invalid input: ' + validationError });
    }

    const ss   = SpreadsheetApp.getActiveSpreadsheet();

    // Phan loai request: dang ky thanh vien hay dat hang
    if (data.type === 'member') {
      saveMember(ss, data);
      sendMemberNotification(data);
      // Dong bo sang GetResponse voi tag "member"
      try { addToGetResponse(data.email, data.name, data.phone, data.prefecture, 'member'); } catch(ge) { Logger.log('GR member err: ' + ge); }
      return buildResponse({ success: true, type: 'member' });
    }

    // Payment proof notification (khach gui bien lai chuyen tien)
    if (data.type === 'payment_received') {
      try { sendPaymentReceivedNotification_(data); } catch(e) { Logger.log('Payment notif err: ' + e); }
      // Auto-trigger AI verification in background (non-blocking — admin sees badge later)
      try {
        if (data.image_url && data.expected_amount && (data.screenshot_hash || data.orderNo)) {
          var confId = data.confirmation_id || lookupConfirmationId_(data.orderNo, data.screenshot_hash);
          if (confId) verifyReceiptWithAI_(confId, data.image_url, data.expected_amount);
        }
      } catch(e) { Logger.log('AI verify err: ' + e); }
      return buildResponse({ success: true, type: 'payment_received' });
    }

    // AI verify on demand (admin clicks "🔄 Xác thực bằng AI" button)
    if (data.type === 'verify_receipt') {
      if (!data.confirmation_id || !data.image_url || !data.expected_amount) {
        return buildResponse({ success: false, error: 'Missing confirmation_id / image_url / expected_amount' });
      }
      var result = verifyReceiptWithAI_(data.confirmation_id, data.image_url, data.expected_amount);
      return buildResponse({ success: true, type: 'verify_receipt', result: result });
    }

    const orderNo = getNextOrderNo(ss);
    saveOrder(ss, orderNo, data);
    saveYamato(orderNo, data);
    sendOrderNotification(orderNo, data);
    sendCustomerConfirmation(orderNo, data);
    updateProductStats(ss);

    // Dong bo khach dat hang sang GetResponse (ke ca khach chua dang ky thanh vien)
    try {
      var buyerEmail = data.senderEmail || data.email || '';
      var buyerName  = data.senderName  || data.name  || '';
      var buyerPhone = data.senderPhone || data.phone || '';
      var buyerPref  = data.senderPrefecture || data.recipientPrefecture || data.prefecture || '';
      if (buyerEmail) {
        addToGetResponse(buyerEmail, buyerName, buyerPhone, buyerPref, data.userId ? 'member-buyer' : 'buyer');
      }
    } catch(ge) { Logger.log('GR order err: ' + ge); }

    // Luu don hang vao Supabase orders table (de khach xem lich su)
    try { saveOrderToSupabase(orderNo, data); } catch(soe) { Logger.log('Save order to SB err: ' + soe); }

    // Tru diem da dung ngay (vi khach da chon dung diem de giam gia)
    if (data.userId && data.pointsUsed && data.pointsUsed > 0) {
      try { deductPointsFromSupabase(data.userId, orderNo, data.pointsUsed); } catch(de) { Logger.log('Deduct err: ' + de); }
    }
    // KHONG cong diem ngay — chi cong sau khi anh tick "Da Gui?" trong Google Sheets

    return buildResponse({ success: true, orderNo: orderNo });

  } catch (err) {
    return buildResponse({ success: false, error: err.toString() });
  }
}

// ============================================================
// THANH VIEN - Luu dang ky va thong bao admin
// ============================================================
function saveMember(ss, data) {
  var sheet = ss.getSheetByName(SHEET_NAME_MEMBERS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_MEMBERS);
    var headers = ['STT', 'Ngay DK', 'Ho Ten', 'SDT', 'Email', 'Tinh/Thanh', 'San Pham Hay Mua', 'Ghi Chu'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#2C1A0E').setFontColor('#FFD700').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  var lastRow = sheet.getLastRow();
  var stt = lastRow; // hang 1 la header, nen stt = lastRow
  var dateStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');

  sheet.appendRow([
    stt,
    dateStr,
    data.name        || '',
    data.phone       || '',
    data.email       || '',
    data.prefecture  || '',
    data.products    || '',
    data.note        || ''
  ]);

  // To xen ke
  var newRow = sheet.getLastRow();
  var bg = (newRow % 2 === 0) ? '#FFF8F0' : '#FFFFFF';
  sheet.getRange(newRow, 1, 1, 8).setBackground(bg);
  Logger.log('Da luu thanh vien moi: ' + data.name);
}

// ============================================================
// BIRTHDAY EMAILS — Tu dong gui email nhac sinh nhat 14/7/3/0 ngay
// Setup: Extensions -> Apps Script -> Triggers -> Add Trigger
//   Function: sendBirthdayEmails | Time-driven | Day timer | 9am-10am JST
// ============================================================
function sendBirthdayEmails() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    Logger.log('Missing Supabase config'); return;
  }

  // 1. Fetch upcoming birthdays tu Supabase RPC
  var upcoming = [];
  try {
    var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/get_upcoming_birthdays', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json'
      },
      payload: '{}',
      muteHttpExceptions: true
    });
    var body = res.getContentText();
    Logger.log('RPC response: ' + body.substring(0, 500));
    if (res.getResponseCode() >= 300) { Logger.log('RPC fail: ' + body); return; }
    upcoming = JSON.parse(body) || [];
  } catch (e) { Logger.log('Fetch upcoming err: ' + e); return; }

  Logger.log('Found ' + upcoming.length + ' upcoming birthday(s) to notify');
  if (upcoming.length === 0) return;

  var sent = 0, failed = 0;
  for (var i = 0; i < upcoming.length; i++) {
    var u = upcoming[i];
    try {
      var template = buildBirthdayEmail_(u);
      MailApp.sendEmail({
        to: u.email,
        subject: template.subject,
        htmlBody: template.html,
        name: 'Bếp Thuỷ Japan'
      });
      // Log to prevent duplicate send
      UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/mark_birthday_email_sent', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify({ p_user_id: u.user_id, p_email_type: u.email_type }),
        muteHttpExceptions: true
      });
      sent++;
      Logger.log('✓ Sent ' + u.email_type + ' to ' + u.email);
    } catch (e) {
      failed++;
      Logger.log('✗ Fail ' + u.email + ': ' + e);
    }
  }
  Logger.log('=== BIRTHDAY EMAILS ===');
  Logger.log('Sent: ' + sent + ', Failed: ' + failed);
}

// Build email content based on type + user info
function buildBirthdayEmail_(u) {
  var name = u.display_name || u.email.split('@')[0];
  var title = u.gender === 'male' ? 'anh' : (u.gender === 'female' ? 'chị' : 'anh/chị');
  var bdayDate = new Date(u.birthday);
  var bdayStr = (bdayDate.getMonth() + 1) + '/' + bdayDate.getDate();
  var url = 'https://www.thuyjapan.com/';
  var result = { subject: '', html: '' };

  if (u.email_type === 'advance_14') {
    result.subject = '🎁 ' + title.charAt(0).toUpperCase() + title.slice(1) + ' ' + name + ' ơi, 2 tuần nữa là sinh nhật!';
    result.html = emailTemplate_({
      title: '🎁 2 Tuần Nữa Là Sinh Nhật!',
      greeting: 'Chào ' + title + ' ' + name + ',',
      body:
        '<p>Bếp Thuỷ Japan xin nhắc ' + title + ' biết: <strong>chỉ còn 2 tuần nữa</strong> là đến sinh nhật ' + title + ' (' + bdayStr + ')! 🎉</p>' +
        '<p>Để chúc mừng ngày đặc biệt của ' + title + ', Bếp Thuỷ tặng <strong>giảm giá 10%</strong> cho toàn bộ đơn hàng trong ngày sinh nhật!</p>' +
        '<p>Hãy lên lịch trước để không quên đặt hàng thưởng thức đặc sản Phố Cổ Hà Nội nhé.</p>',
      cta: 'Xem Thực Đơn',
      cta_url: url + '#products'
    });
  } else if (u.email_type === 'advance_7') {
    result.subject = '🗓 Còn 1 tuần nữa là sinh nhật ' + title + ' ' + name + '!';
    result.html = emailTemplate_({
      title: '🗓 Còn 1 Tuần Nữa!',
      greeting: 'Chào ' + title + ' ' + name + ',',
      body:
        '<p>Chỉ còn <strong>7 ngày</strong> là đến sinh nhật ' + title + ' (' + bdayStr + ')! ⏳</p>' +
        '<p>Đừng quên ưu đãi <strong>giảm 10% đơn hàng</strong> khi đặt trong ngày sinh nhật. Bếp Thuỷ đã chuẩn bị giò lụa, chả quế, mọc, nem, pate... sẵn sàng phục vụ.</p>' +
        '<p>Hẹn gặp lại ' + title + ' trong ngày đặc biệt! 💝</p>',
      cta: 'Xem Thực Đơn',
      cta_url: url + '#products'
    });
  } else if (u.email_type === 'advance_3') {
    result.subject = '🎉 Chỉ còn 3 ngày là sinh nhật ' + title + ' ' + name + '!';
    result.html = emailTemplate_({
      title: '🎉 Chỉ Còn 3 Ngày!',
      greeting: 'Chào ' + title + ' ' + name + ',',
      body:
        '<p><strong>3 ngày nữa</strong> là sinh nhật ' + title + ' rồi! 🥳</p>' +
        '<p>Bếp Thuỷ xin nhắc ' + title + ' đặt hàng sớm để nhận <strong>ưu đãi 10%</strong> vào đúng ngày đặc biệt.</p>' +
        '<p>Hãy đặt đơn hôm nay, hàng giao kịp dùng trong ngày sinh nhật nhé! 🎂</p>',
      cta: 'Đặt Hàng Ngay',
      cta_url: url + '#products'
    });
  } else if (u.email_type === 'birthday') {
    result.subject = '🎂 Chúc mừng sinh nhật ' + title + ' ' + name + '!';
    result.html = emailTemplate_({
      title: '🎂 Chúc Mừng Sinh Nhật!',
      greeting: 'Chào ' + title + ' ' + name + ',',
      body:
        '<p style="font-size:18px;color:#C8102E"><strong>🎉 Chúc mừng sinh nhật ' + title + ' ' + name + '! 🎉</strong></p>' +
        '<p>Bếp Thuỷ Japan xin gửi lời chúc mừng chân thành nhất đến ' + title + ' nhân ngày đặc biệt này!</p>' +
        '<p>🎁 <strong>Ưu đãi đặc biệt HÔM NAY</strong>: Giảm 10% tự động khi đặt bất kỳ đơn hàng nào. Không cần mã code — hệ thống tự động áp dụng khi ' + title + ' đăng nhập và đặt hàng.</p>' +
        '<p>Chúc ' + title + ' một ngày sinh nhật thật ấm áp và hạnh phúc bên người thân! 🌹</p>' +
        '<p style="color:#6B7280;font-size:13px">Chúc ' + title + ' thêm một tuổi mới nhiều niềm vui và sức khoẻ!</p>',
      cta: '🛒 Đặt Hàng Ngay — Nhận Giảm 10%',
      cta_url: url + '#products'
    });
  }

  return result;
}

// Shared email template (HTML with styling)
function emailTemplate_(opts) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
    '<body style="margin:0;padding:0;background:#FFF8F0;font-family:Arial,sans-serif">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F0;padding:20px">' +
    '<tr><td align="center">' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">' +
      // Header
      '<tr><td style="background:linear-gradient(135deg,#2C1A0E,#8B3A0F,#C8102E);padding:30px 24px;text-align:center">' +
        '<h1 style="color:white;margin:0;font-family:Georgia,serif;font-size:28px">Bếp Thuỷ Japan</h1>' +
        '<p style="color:#FEF3C7;margin:6px 0 0;font-size:13px">"Hạnh phúc là được ăn ngon"</p>' +
      '</td></tr>' +
      // Title
      '<tr><td style="padding:28px 24px 12px;text-align:center">' +
        '<h2 style="color:#C8102E;margin:0;font-size:24px">' + opts.title + '</h2>' +
      '</td></tr>' +
      // Body
      '<tr><td style="padding:0 24px 20px;color:#1F2937;font-size:15px;line-height:1.6">' +
        '<p style="margin:0 0 12px;font-weight:600">' + opts.greeting + '</p>' +
        opts.body +
      '</td></tr>' +
      // CTA
      '<tr><td style="padding:12px 24px 28px;text-align:center">' +
        '<a href="' + opts.cta_url + '" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#C8102E,#8B3A0F);color:white;text-decoration:none;border-radius:9999px;font-weight:bold;font-size:15px">' + opts.cta + '</a>' +
      '</td></tr>' +
      // Footer
      '<tr><td style="background:#2C1A0E;padding:20px 24px;text-align:center">' +
        '<p style="color:#D4A017;margin:0 0 4px;font-weight:bold">Bếp Thuỷ Japan</p>' +
        '<p style="color:#9CA3AF;margin:0;font-size:12px">Đặc sản Phố Cổ Hà Nội tại Nhật Bản</p>' +
        '<p style="color:#9CA3AF;margin:8px 0 0;font-size:11px">' +
          '<a href="https://www.thuyjapan.com" style="color:#D4A017;text-decoration:none">thuyjapan.com</a> · ' +
          '📞 080-5115-6688' +
        '</p>' +
      '</td></tr>' +
      '</table>' +
    '</td></tr></table></body></html>';
}

// ============================================================
// INACTIVE CUSTOMER REMINDERS — 45 ngay + 60 ngay
// Setup: Triggers -> Add -> sendInactiveReminders -> Daily 10am-11am JST
// ============================================================
function sendInactiveReminders() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    Logger.log('Missing Supabase config'); return;
  }

  var totalSent = 0, totalFailed = 0;

  // Phase 1: Tier discount emails (45/60/90)
  totalSent += processList_('/rest/v1/rpc/get_inactive_customers', buildInactiveEmail_, true);
  // Phase 2: Discount reminder emails (7-day, last-day)
  totalSent += processList_('/rest/v1/rpc/get_discount_reminders', buildReminderEmail_, false);

  Logger.log('=== TOTAL ===  Sent: ' + totalSent);
}

function processList_(endpoint, emailBuilder, isDiscountTrigger) {
  var list = [];
  try {
    var res = UrlFetchApp.fetch(SUPABASE_URL + endpoint, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json'
      },
      payload: '{}',
      muteHttpExceptions: true
    });
    Logger.log(endpoint + ' -> ' + res.getResponseCode() + ' (' + res.getContentText().substring(0, 200) + ')');
    if (res.getResponseCode() >= 300) return 0;
    list = JSON.parse(res.getContentText()) || [];
  } catch (e) { Logger.log('Fetch err: ' + e); return 0; }

  Logger.log(endpoint + ' -> ' + list.length + ' recipient(s)');
  var sent = 0;
  for (var i = 0; i < list.length; i++) {
    var u = list[i];
    var etype = u.email_type || u.reminder_type;
    if (!etype) continue;
    try {
      var template = emailBuilder(u);
      if (!template || !template.subject) continue;
      MailApp.sendEmail({
        to: u.email,
        subject: template.subject,
        htmlBody: template.html,
        name: 'Bếp Thuỷ Japan'
      });
      // Mark sent
      UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/mark_inactive_email_sent', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify({
          p_user_id: u.user_id,
          p_email_type: etype,
          p_last_order_at: u.last_order_at || u.expires_at || new Date().toISOString()
        }),
        muteHttpExceptions: true
      });
      sent++;
      Logger.log('✓ Sent ' + etype + ' to ' + u.email);
    } catch (e) {
      Logger.log('✗ Fail ' + u.email + ': ' + e);
    }
  }
  return sent;
}

function buildInactiveEmail_(u) {
  var name = u.display_name || u.email.split('@')[0];
  var title = u.gender === 'male' ? 'anh' : (u.gender === 'female' ? 'chị' : 'anh/chị');
  var titleCap = title.charAt(0).toUpperCase() + title.slice(1);
  var url = 'https://www.thuyjapan.com/';
  var pct = u.discount_percent || 0;
  var result = { subject: '', html: '' };

  var discountBox = pct > 0 ? (
    '<p style="padding:14px;background:#FEF3C7;border-radius:10px;border:2px dashed #F59E0B;text-align:center;font-size:16px">' +
      '<strong style="color:#78350F">🎉 TẶNG ' + titleCap + ':</strong><br>' +
      '<strong style="color:#C8102E;font-size:24px">GIẢM ' + pct + '%</strong><br>' +
      '<span style="color:#78350F;font-size:13px">Cho đơn hàng tiếp theo</span>' +
    '</p>'
  ) : '';

  var autoApplyNote = pct > 0 ? (
    '<p>✅ <strong>Tự động áp dụng</strong> khi ' + title + ' đăng nhập và đặt hàng (không cần nhập mã).</p>' +
    '<p>⏰ <strong>Hạn sử dụng:</strong> 14 ngày kể từ email này.</p>'
  ) : '';

  // ── TIER 1: 45 days — miss you, NO discount ──
  if (u.email_type === 'inactive_45') {
    result.subject = '💔 Bếp Thuỷ nhớ ' + title + ' ' + name + '!';
    result.html = emailTemplate_({
      title: '💔 Bếp Thuỷ Nhớ ' + titleCap + '!',
      greeting: 'Chào ' + title + ' ' + name + ',',
      body:
        '<p>Đã <strong>' + u.days_inactive + ' ngày</strong> không thấy ' + title + ' ghé Bếp Thuỷ. Bếp nhớ ' + title + ' lắm! 🥺</p>' +
        '<p>Bếp vẫn hàng ngày chế biến tươi mới, sẵn sàng phục vụ ' + title + ':</p>' +
        '<ul style="margin:8px 0 12px 20px;color:#78350F">' +
          '<li>🥩 Giò lụa, chả quế — chuẩn vị Hà Nội</li>' +
          '<li>🍡 Nem lụi Huế gia vị truyền thống</li>' +
          '<li>🧈 Pate phố cổ béo ngậy</li>' +
          '<li>🍳 Mọc sống, mọc chín đủ loại</li>' +
        '</ul>' +
        '<p>Hãy thưởng thức lại hương vị quê hương nhé! Giao hàng toàn Nhật, tươi ngon đảm bảo. 🇻🇳</p>',
      cta: '🛒 Xem Thực Đơn',
      cta_url: url + '#products'
    });
  }
  // ── TIER 2: 60 days — 5% ──
  else if (u.email_type === 'inactive_60') {
    result.subject = '🎁 Tặng ' + title + ' ' + name + ' ưu đãi 5%!';
    result.html = emailTemplate_({
      title: '🎁 Ưu Đãi 5% Đặc Biệt',
      greeting: 'Chào ' + title + ' ' + name + ',',
      body:
        '<p>Đã <strong>2 tháng</strong> không gặp ' + title + '. Bếp Thuỷ thực sự nhớ ' + title + '! 💝</p>' +
        discountBox +
        autoApplyNote +
        '<p>Hàng tươi mới mỗi ngày, giao đúng hẹn toàn Nhật. Đừng bỏ lỡ cơ hội thưởng thức lại hương vị quê hương nhé!</p>',
      cta: '🛒 Đặt Hàng — Giảm 5%',
      cta_url: url + '#products'
    });
  }
  // ── TIER 3: 90 days — 8% ──
  else if (u.email_type === 'inactive_90') {
    result.subject = '🎁 Nâng ưu đãi lên 8% — ' + titleCap + ' ' + name;
    result.html = emailTemplate_({
      title: '🎁 Nâng Cấp Ưu Đãi: 8%',
      greeting: 'Chào ' + title + ' ' + name + ',',
      body:
        '<p>Đã <strong>3 tháng</strong> rồi ' + title + ' ơi! Bếp Thuỷ muốn tặng thêm để ' + title + ' sớm quay lại:</p>' +
        discountBox +
        autoApplyNote +
        '<p>Bếp cam kết hàng tươi mới mỗi ngày. Đây là ưu đãi hiếm có, hãy tận dụng nhé! 💝</p>',
      cta: '🛒 Đặt Hàng — Giảm 8%',
      cta_url: url + '#products'
    });
  }
  // ── TIER 4: 120 days — 10% MAX ──
  else if (u.email_type === 'inactive_120') {
    result.subject = '🎁 Ưu đãi MAX 10% — Bếp Thuỷ chờ ' + title + ' ' + name;
    result.html = emailTemplate_({
      title: '🎁 Ưu Đãi Cao Nhất: 10%',
      greeting: 'Chào ' + title + ' ' + name + ',',
      body:
        '<p>Đã <strong>4 tháng</strong> rồi ' + title + ' ơi... Bếp Thuỷ thực sự nhớ ' + title + '. 💔</p>' +
        '<p>Xin tặng ưu đãi <strong>cao nhất của Bếp</strong> để chào mừng ' + title + ' trở lại:</p>' +
        discountBox +
        autoApplyNote +
        '<p>Đây là mức ưu đãi đặc biệt nhất. Hãy cho Bếp cơ hội phục vụ ' + title + ' lại nhé! 🙏</p>',
      cta: '🛒 Đặt Hàng — Giảm 10%',
      cta_url: url + '#products'
    });
  }
  return result;
}

// Reminder emails (7-day + last-day)
function buildReminderEmail_(u) {
  var name = u.display_name || u.email.split('@')[0];
  var title = u.gender === 'male' ? 'anh' : (u.gender === 'female' ? 'chị' : 'anh/chị');
  var titleCap = title.charAt(0).toUpperCase() + title.slice(1);
  var url = 'https://www.thuyjapan.com/';
  var pct = u.discount_percent || 0;
  var result = { subject: '', html: '' };

  var discountBox = '<p style="padding:14px;background:#FEF3C7;border-radius:10px;border:2px dashed #F59E0B;text-align:center;font-size:16px">' +
    '<strong style="color:#C8102E;font-size:24px">GIẢM ' + pct + '%</strong><br>' +
    '<span style="color:#78350F;font-size:13px">Tự động áp dụng khi đặt hàng</span>' +
  '</p>';

  if (u.reminder_type === 'reminder_7') {
    result.subject = '⏰ ' + titleCap + ' ' + name + ' ơi, còn 1 tuần dùng ưu đãi ' + pct + '%!';
    result.html = emailTemplate_({
      title: '⏰ Chỉ Còn 1 Tuần!',
      greeting: 'Chào ' + title + ' ' + name + ',',
      body:
        '<p>Bếp Thuỷ xin nhắc ' + title + ': ưu đãi <strong>giảm ' + pct + '%</strong> Bếp tặng ' + title + ' <strong>chỉ còn 1 tuần</strong> nữa là hết hạn!</p>' +
        discountBox +
        '<p>Đừng bỏ lỡ cơ hội thưởng thức lại đặc sản Phố Cổ Hà Nội với giá ưu đãi. 🍜</p>' +
        '<p style="color:#6B7280;font-size:13px">💡 Hàng tươi mới mỗi ngày, giao nhanh toàn Nhật.</p>',
      cta: '🛒 Đặt Ngay — Giảm ' + pct + '%',
      cta_url: url + '#products'
    });
  } else if (u.reminder_type === 'reminder_last') {
    result.subject = '🚨 HÔM NAY là ngày cuối dùng ưu đãi ' + pct + '% - ' + titleCap + ' ' + name;
    result.html = emailTemplate_({
      title: '🚨 Ngày Cuối Cùng!',
      greeting: 'Chào ' + title + ' ' + name + ',',
      body:
        '<p style="color:#C8102E;font-size:16px"><strong>⚠️ ' + titleCap + ' ơi, HÔM NAY là ngày CUỐI CÙNG sử dụng ưu đãi!</strong></p>' +
        discountBox +
        '<p>Hết hôm nay là ưu đãi biến mất đó! Hãy đặt hàng ngay để không tiếc nuối. ⏰</p>' +
        '<p style="color:#6B7280;font-size:13px">Chỉ cần đăng nhập → chọn hàng → đặt. Hệ thống tự trừ ' + pct + '%.</p>',
      cta: '🛒 ĐẶT HÀNG NGAY - Giảm ' + pct + '%',
      cta_url: url + '#products'
    });
  }
  return result;
}

// ============================================================
// PAYMENT PROOF NOTIFICATION — Gui email cho shop khi khach upload bien lai
// ============================================================
function sendPaymentReceivedNotification_(data) {
  var shopEmail = 'support@thuyjapan.com';
  var orderNo = data.orderNo || '?';
  var customerName = data.customerName || 'Khach';
  var amount = data.amount || 0;
  var method = data.method === 'paypay' ? '💳 PayPay' : '🏦 Chuyển khoản NH';
  var note = data.note || '';
  var dashboardUrl = 'https://www.thuyjapan.com/thuythang';

  var subject = '🔔 [Bếp Thuỷ] Khách gửi biên lai TT — Đơn #' + orderNo;
  var body =
    'Xin chào Thuỷ,\n\n' +
    'Khách hàng vừa gửi biên lai thanh toán cho đơn hàng. Cần xác nhận trên dashboard.\n\n' +
    '─────────────────────────\n' +
    '📦 Đơn: #' + orderNo + '\n' +
    '👤 Khách: ' + customerName + '\n' +
    '💵 Số tiền: ¥' + Number(amount).toLocaleString() + '\n' +
    '🔖 Phương thức: ' + method + '\n' +
    (note ? '📝 Ghi chú: ' + note + '\n' : '') +
    '─────────────────────────\n\n' +
    '👉 Mở dashboard để xem ảnh + xác nhận:\n' +
    dashboardUrl + '\n\n' +
    '⏱ Thời gian: ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm') + '\n\n' +
    '(Email tự động từ hệ thống Bếp Thuỷ Japan)';

  try {
    MailApp.sendEmail({
      to: shopEmail,
      subject: subject,
      body: body,
      name: 'Bếp Thuỷ Japan'
    });
    Logger.log('Sent payment notification email to ' + shopEmail + ' for order ' + orderNo);
  } catch (e) {
    Logger.log('MailApp error: ' + e);
  }

  // Optional: Telegram notification (neu anh da setup Telegram bot)
  try { sendTelegramNotification_(data); } catch(e) { /* skip if not configured */ }
}

// ============================================================
// AI RECEIPT VERIFICATION (Google Vision OCR)
// ============================================================
// Reads the uploaded receipt image, extracts the largest ¥-amount,
// compares with expected order total, writes result back to
// payment_confirmations table (ai_verified_amount, ai_match, ai_reason).
//
// Setup: Script Properties must include:
//   GOOGLE_VISION_KEY  = your Google Cloud Vision API key
//   SUPABASE_URL       = https://<project>.supabase.co
//   SUPABASE_SERVICE_KEY = service_role key (write access)
//
// Cost: free tier 1000 images/month. Beyond that $1.50/1000.

function verifyReceiptWithAI_(confirmationId, imageUrl, expectedAmount) {
  var apiKey = _prop('GOOGLE_VISION_KEY', '');
  if (!apiKey) {
    Logger.log('GOOGLE_VISION_KEY not set — skipping AI verify');
    return { ok: false, reason: 'API key not configured' };
  }

  expectedAmount = Number(expectedAmount) || 0;
  var result = { ok: false, detected_amount: null, match: null, reason: '', raw_text: '', confidence: 0 };

  try {
    // 1. Fetch image bytes from Supabase Storage URL
    var imgResp = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true });
    if (imgResp.getResponseCode() !== 200) throw new Error('Image fetch failed: ' + imgResp.getResponseCode());
    var b64 = Utilities.base64Encode(imgResp.getBlob().getBytes());

    // 2. Call Google Vision OCR
    var visionResp = UrlFetchApp.fetch(
      'https://vision.googleapis.com/v1/images:annotate?key=' + apiKey,
      {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        payload: JSON.stringify({
          requests: [{
            image: { content: b64 },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
            imageContext: { languageHints: ['ja', 'vi', 'en'] }
          }]
        })
      }
    );
    if (visionResp.getResponseCode() !== 200) throw new Error('Vision API: ' + visionResp.getContentText().slice(0, 200));

    var visionData = JSON.parse(visionResp.getContentText());
    var fullText = (visionData.responses && visionData.responses[0] && visionData.responses[0].fullTextAnnotation
      ? visionData.responses[0].fullTextAnnotation.text
      : '') || '';
    result.raw_text = fullText;

    if (!fullText) {
      result.reason = 'AI không đọc được text trong ảnh (ảnh mờ hoặc không có chữ)';
      _writeAIResult_(confirmationId, result);
      return result;
    }

    // 3. Extract candidate amounts. Match patterns:
    //    ¥12,500   12,500円   12,500 JPY   12500   12,500
    var amountRegex = /(?:¥|￥|JPY\s*)?(\d{1,3}(?:[,，]\d{3})+|\d{4,})\s*(?:円)?/g;
    var matches = [];
    var m;
    while ((m = amountRegex.exec(fullText)) !== null) {
      var raw = m[1].replace(/[,，]/g, '');
      var n = parseInt(raw, 10);
      if (n >= 100 && n <= 10000000) matches.push(n);
    }

    if (matches.length === 0) {
      result.reason = 'AI đọc được text nhưng không tìm thấy số tiền hợp lệ';
      _writeAIResult_(confirmationId, result);
      return result;
    }

    // 4. Find best match: prefer exact match to expected, otherwise largest amount
    var exactMatch = matches.indexOf(expectedAmount) >= 0 ? expectedAmount : null;
    var detected = exactMatch !== null ? exactMatch : Math.max.apply(null, matches);
    result.detected_amount = detected;
    result.confidence = matches.length === 1 ? 0.95 : 0.75;

    // 5. Compare. Tolerance ¥1 to handle rounding.
    var diff = Math.abs(detected - expectedAmount);
    if (diff <= 1) {
      result.match = true;
      result.reason = 'Số tiền khớp đơn (¥' + detected.toLocaleString() + ')';
    } else {
      result.match = false;
      result.reason = 'AI đọc ¥' + detected.toLocaleString() + ' nhưng đơn cần ¥' + expectedAmount.toLocaleString()
                    + ' (lệch ¥' + diff.toLocaleString() + ')';
    }
    result.ok = true;

    // 6. Persist
    _writeAIResult_(confirmationId, result);
    Logger.log('AI verified conf #' + confirmationId + ': ' + JSON.stringify({match: result.match, detected: result.detected_amount}));
    return result;

  } catch (err) {
    result.reason = 'Lỗi AI: ' + err.toString().slice(0, 200);
    _writeAIResult_(confirmationId, result);
    Logger.log('verifyReceiptWithAI_ error: ' + err);
    return result;
  }
}

// Look up the latest payment_confirmations.id for a given order_no + screenshot_hash.
// Used when client doesn't have the id (right after RPC insert).
function lookupConfirmationId_(orderNo, hash) {
  var sbUrl = _prop('SUPABASE_URL', '');
  var sbKey = _prop('SUPABASE_SERVICE_KEY', '');
  if (!sbUrl || !sbKey) return null;
  try {
    var q = '/rest/v1/payment_confirmations?select=id&order=created_at.desc&limit=1';
    if (orderNo) q += '&order_no=eq.' + encodeURIComponent(orderNo);
    if (hash)    q += '&screenshot_hash=eq.' + encodeURIComponent(hash);
    var r = UrlFetchApp.fetch(sbUrl + q, {
      headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey },
      muteHttpExceptions: true
    });
    if (r.getResponseCode() !== 200) return null;
    var rows = JSON.parse(r.getContentText());
    return rows && rows[0] && rows[0].id || null;
  } catch (e) { Logger.log('lookupConfirmationId_ err: ' + e); return null; }
}

function _writeAIResult_(confirmationId, result) {
  var sbUrl = _prop('SUPABASE_URL', '');
  var sbKey = _prop('SUPABASE_SERVICE_KEY', '');
  if (!sbUrl || !sbKey) { Logger.log('Supabase creds missing'); return; }

  var body = {
    ai_verified_amount: result.detected_amount,
    ai_match: result.match,
    ai_reason: result.reason,
    ai_verified_at: new Date().toISOString(),
    ai_raw_text: (result.raw_text || '').slice(0, 5000),
    ai_confidence: result.confidence || null
  };

  UrlFetchApp.fetch(
    sbUrl + '/rest/v1/payment_confirmations?id=eq.' + encodeURIComponent(confirmationId),
    {
      method: 'patch',
      contentType: 'application/json',
      headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey, 'Prefer': 'return=minimal' },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    }
  );
}

// ============================================================
// DAILY PRODUCTION REPORT EMAIL
// ============================================================
// Sends an email summarizing today's order quantities by product.
// Setup: add a daily time-driven trigger (Apps Script Triggers menu)
//        for sendDailyProductionReport at 23:00 JST.
// To customize recipient, edit PRODUCTION_REPORT_EMAIL below.

var PRODUCTION_REPORT_EMAIL = 'support@thuyjapan.com';
var PRODUCTION_PRODUCTS = [
  { code: 'GT',        name: 'Giò có tiêu',                 unit: 'kg' },
  { code: 'GKT',       name: 'Giò không tiêu',              unit: 'kg' },
  { code: 'C',         name: 'Chả quế có tiêu',             unit: 'kg' },
  { code: 'CKT',       name: 'Chả quế không tiêu',          unit: 'kg' },
  { code: 'CLUA TIEU', name: 'Chả lụa có tiêu',             unit: 'kg' },
  { code: 'CLUA',      name: 'Chả lụa không tiêu, không quế', unit: 'kg' },
  { code: 'M',         name: 'Mọc có tiêu',                 unit: 'kg' },
  { code: 'MKT',       name: 'Mọc không tiêu',              unit: 'kg' },
  { code: 'Nem',       name: 'Nem lụi cuốn sả Huế',         unit: 'túi' },
  { code: 'Pte',       name: 'Pa Te',                       unit: 'hộp' }
];

function sendDailyProductionReport(fromDate, toDate) {
  var sbUrl = _prop('SUPABASE_URL', '');
  var sbKey = _prop('SUPABASE_SERVICE_KEY', '');
  if (!sbUrl || !sbKey) { Logger.log('Supabase creds missing'); return; }

  // Default to today (JST). Pass YYYY-MM-DD strings to override.
  var now = new Date();
  var jst = new Date(now.getTime() + 9 * 3600 * 1000);
  var todayStr = jst.toISOString().slice(0, 10);
  var fromStr = fromDate || todayStr;
  var toStr   = toDate   || todayStr;
  var fromIso = fromStr + 'T00:00:00+09:00';
  var toIso   = toStr   + 'T23:59:59+09:00';

  // Query non-cancelled orders for today
  var url = sbUrl + '/rest/v1/orders?select=order_no,items,status,total,customer_name,created_at'
          + '&status=neq.cancelled'
          + '&created_at=gte.' + encodeURIComponent(fromIso)
          + '&created_at=lte.' + encodeURIComponent(toIso)
          + '&order=created_at.asc';
  var resp = UrlFetchApp.fetch(url, {
    headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    Logger.log('Production report fetch failed: ' + resp.getContentText().slice(0, 300));
    return;
  }
  var orders = JSON.parse(resp.getContentText()) || [];

  // Aggregate per product
  var totals = {}; PRODUCTION_PRODUCTS.forEach(function(p){ totals[p.code] = 0; });
  var totalRevenue = 0, totalOrders = orders.length;
  orders.forEach(function(o) {
    totalRevenue += Number(o.total || 0);
    var items = aggregateOrderItemsForReport_(o.items);
    Object.keys(items).forEach(function(k){ if (totals[k] !== undefined) totals[k] += items[k]; });
  });

  // Build HTML email
  var rowsHtml = PRODUCTION_PRODUCTS.map(function(p, i){
    var v = totals[p.code] || 0;
    var color = v > 0 ? '#C8102E' : '#9CA3AF';
    return '<tr>' +
      '<td style="padding:8px;border-bottom:1px solid #f0e0d0;text-align:center;color:#6B7280;">' + (i + 1) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #f0e0d0;">' + p.name + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #f0e0d0;text-align:right;font-weight:800;color:' + color + ';">' + (v > 0 ? v.toLocaleString() : '–') + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #f0e0d0;color:#6B7280;">' + p.unit + '</td>' +
    '</tr>';
  }).join('');

  var rangeLabel = fromStr === toStr ? fromStr : (fromStr + ' → ' + toStr);
  var html =
    '<div style="font-family:-apple-system,Inter,sans-serif;background:#FFF8F0;padding:20px;color:#2C1A0E;">' +
      '<div style="background:linear-gradient(135deg,#2C1A0E,#4A2C1A);color:white;padding:24px;border-radius:14px;text-align:center;margin-bottom:18px;">' +
        '<h2 style="margin:0;font-family:Georgia,serif;color:#F4CC54;">🏭 Báo Cáo Sản Xuất</h2>' +
        '<p style="margin:8px 0 0;font-size:14px;color:#FFF1D6;">Ngày: ' + rangeLabel + ' (JST)</p>' +
        '<p style="margin:4px 0 0;font-size:12px;color:#F4CC54;">📦 ' + totalOrders + ' đơn · 💰 ¥' + totalRevenue.toLocaleString() + '</p>' +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;background:white;border-radius:12px;overflow:hidden;">' +
        '<thead><tr style="background:#FEF3C7;">' +
          '<th style="padding:10px;text-align:center;font-size:12px;color:#78350F;width:50px;">STT</th>' +
          '<th style="padding:10px;text-align:left;font-size:12px;color:#78350F;">Tên Sản Phẩm</th>' +
          '<th style="padding:10px;text-align:right;font-size:12px;color:#78350F;">Tổng SL</th>' +
          '<th style="padding:10px;text-align:left;font-size:12px;color:#78350F;width:60px;">Đơn vị</th>' +
        '</tr></thead><tbody>' + rowsHtml + '</tbody>' +
      '</table>' +
      '<p style="margin-top:16px;font-size:11px;color:#9CA3AF;text-align:center;">Tự động tổng hợp từ đơn hàng (đã trừ đơn huỷ). Bếp Thuỷ Japan · ' + new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Tokyo' }) + '</p>' +
    '</div>';

  MailApp.sendEmail({
    to: PRODUCTION_REPORT_EMAIL,
    subject: '🏭 Báo cáo sản xuất ' + rangeLabel + ' — ' + totalOrders + ' đơn (¥' + totalRevenue.toLocaleString() + ')',
    htmlBody: html
  });
  Logger.log('Production report sent to ' + PRODUCTION_REPORT_EMAIL + ' for ' + rangeLabel);
}

// 🧪 Test wrapper — gọi hàm chính với date range tùy ý.
// Edit 2 dòng dưới rồi bấm ▶ Run hàm này.
function testProductionReportRange() {
  var FROM = '2026-04-24';   // ← sửa ngày bắt đầu
  var TO   = '2026-04-26';   // ← sửa ngày kết thúc
  sendDailyProductionReport(FROM, TO);
}

// Aggregate items in one order — handles modern + legacy concatenated formats.
// Defensive: stricter legacy detection, case-insensitive code match, keyword fallback.
function aggregateOrderItemsForReport_(itemsJson) {
  var totals = {};
  PRODUCTION_PRODUCTS.forEach(function(p){ totals[p.code] = 0; });
  var items = Array.isArray(itemsJson) ? itemsJson : [];
  if (items.length === 0) return totals;

  // Stricter legacy detection: name must NOT start with [
  if (items.length === 1
      && (Number(items[0].price) || 0) === 0
      && !/^\s*\[/.test(items[0].name || '')
      && /\s\w/.test(items[0].name || '')) {
    var parsed = parseLegacyConcatenated_(items[0].name);
    if (parsed) {
      parsed.forEach(function(p){
        var canon = canonicalizeCode_(p.code, totals);
        if (canon !== null) totals[canon] += p.qty;
      });
      return totals;
    }
  }

  items.forEach(function(i){
    var name = i.name || '';
    var m = name.match(/^\[([^\]]+)\]/);
    var rawCode = m ? m[1].trim() : extractCodeFromVietnamese_(name);
    if (!rawCode) return;
    var code = canonicalizeCode_(rawCode, totals);
    if (code === null) return;
    var wt = Number(i.wt || 0);
    if (code === 'Nem' || code === 'Pte') totals[code] += wt > 0 ? wt / 0.5 : Number(i.qty || 0);
    else                                   totals[code] += wt;
  });
  return totals;
}

function canonicalizeCode_(code, totals) {
  if (totals[code] !== undefined) return code;
  var up = String(code).toUpperCase();
  var keys = Object.keys(totals);
  for (var i = 0; i < keys.length; i++) if (keys[i].toUpperCase() === up) return keys[i];
  return null;
}

function extractCodeFromVietnamese_(s) {
  if (!s) return null;
  var n = s.toLowerCase().replace(/đ/g, 'd');
  var isKT = /\b(kt|khong tieu|không tiêu|kg tieu|kg tiêu|ko tieu|ko tiêu|ko t-ko q|kotieu)\b/.test(n);
  var hasTieuExplicit = /tieu|tiêu/.test(n) && !isKT;
  if (/cha lua|chả lụa|clua/.test(n)) return hasTieuExplicit ? 'CLUA TIEU' : 'CLUA';
  if (/cha que|chả quế/.test(n) || /^cha\b/.test(n)) return isKT ? 'CKT' : 'C';
  if (/^gio|giò|gio /.test(n)) return isKT ? 'GKT' : 'GT';
  if (/moc|mọc/.test(n)) return isKT ? 'MKT' : 'M';
  if (/nem/.test(n)) return 'Nem';
  if (/pate|pâté/.test(n)) return 'Pte';
  return null;
}

// Parse "1 GT 0.5 MKT 1 Pte" → [{code:'GT',qty:1}, {code:'MKT',qty:0.5}, {code:'Pte',qty:1}]
function parseLegacyConcatenated_(s) {
  var CODES = ['CLUA TIEU', 'GKT', 'CKT', 'MKT', 'Nem', 'Pte', 'GT', 'CLUA', 'C', 'M'];
  var tokens = String(s).trim().split(/\s+/);
  var out = []; var i = 0;
  while (i < tokens.length) {
    var n = parseFloat(tokens[i]);
    if (isNaN(n)) return null;
    i++;
    if (i >= tokens.length) return null;
    var two = i + 1 < tokens.length ? (tokens[i] + ' ' + tokens[i + 1]) : null;
    if (two && CODES.indexOf(two) >= 0) { out.push({ qty: n, code: two }); i += 2; }
    else if (CODES.indexOf(tokens[i]) >= 0) { out.push({ qty: n, code: tokens[i] }); i += 1; }
    else return null;
  }
  return out.length > 0 ? out : null;
}

// Optional: Telegram bot notification
function sendTelegramNotification_(data) {
  var botToken = _prop('TELEGRAM_BOT_TOKEN', '');
  var chatId = _prop('TELEGRAM_CHAT_ID', '');
  if (!botToken || !chatId) return; // Not configured, skip

  var text = '🔔 *Khách gửi biên lai TT*\n\n' +
    '📦 Đơn: #' + (data.orderNo || '?') + '\n' +
    '👤 ' + (data.customerName || 'Khách') + '\n' +
    '💵 ¥' + Number(data.amount || 0).toLocaleString() + '\n' +
    '🔖 ' + (data.method === 'paypay' ? 'PayPay' : 'Bank transfer') + '\n\n' +
    '👉 [Mở Dashboard](https://www.thuyjapan.com/thuythang)';

  UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' }),
    muteHttpExceptions: true
  });
}

// ============================================================
// SUPABASE ORDERS - Luu don hang day du vao Supabase de khach xem
// ============================================================
function saveOrderToSupabase(orderNo, data) {
  if (!SUPABASE_URL || SUPABASE_URL.indexOf('YOUR_') !== -1) return;

  var total = data.total || 0;
  var pointsEarned = Math.floor(total / 100); // Se cong khi anh tick "Da Gui?"

  var payload = {
    order_no: orderNo,
    user_id: data.userId || null,
    customer_name:  data.name  || '',
    customer_email: data.email || '',
    customer_phone: data.phone || '',
    recipient_name:  data.recipientName  || null,
    recipient_phone: data.recipientPhone || null,
    ship_prefecture: data.prefecture || '',
    ship_postal:     data.postal     || '',
    ship_address:    data.address    || '',
    ship_mailbox:    data.mailboxRecipient || data.mailbox || '',
    items: data.cartItems || [],
    subtotal:     data.subtotal || 0,
    shipping_fee: data.shipping || 0,
    total:        total,
    points_used:  data.pointsUsed || 0,
    points_earned: pointsEarned,
    points_awarded: false,
    status: 'pending',
    note:          data.note || '',
    delivery_time: data.deliveryTime || ''
  };

  var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/orders', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  Logger.log('Da luu don #' + orderNo + ' vao Supabase orders. Status: ' + res.getResponseCode());
}

// ============================================================
// BACKFILL - Migrate don cu tu Sheet "Don Hang" sang Supabase
// Chay 1 lan tu Apps Script Editor: chon function nay -> Run
// An toan: skip don da co trong Supabase (idempotent)
// ============================================================
function backfillOrdersToSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_ORDERS);
  if (!sheet) { Logger.log('Khong tim thay sheet ' + SHEET_NAME_ORDERS); return; }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('Sheet rong'); return; }

  // Lay tat ca order_no da co trong Supabase de skip
  Logger.log('Dang fetch danh sach order_no da co trong Supabase...');
  var existing = {};
  try {
    var resExist = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/orders?select=order_no&limit=10000', {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Accept': 'application/json'
      },
      muteHttpExceptions: true
    });
    var existCode = resExist.getResponseCode();
    var existText = resExist.getContentText() || '[]';
    Logger.log('Existing fetch HTTP ' + existCode + ' - first 200 chars: ' + existText.substring(0, 200));
    var existArr = JSON.parse(existText);
    if (!Array.isArray(existArr)) {
      Logger.log('CANH BAO: response khong phai array. Skip duplicate check, co the bi insert lap.');
      existArr = [];
    }
    existArr.forEach(function(o) { if (o && o.order_no) existing[String(o.order_no)] = true; });
    Logger.log('Co ' + Object.keys(existing).length + ' don da ton tai trong Supabase');
  } catch (e) { Logger.log('Loi fetch existing (van tiep tuc): ' + e); }

  // Lay tat ca user (id, email) tu auth.users de match
  Logger.log('Dang fetch danh sach user de match email...');
  var emailToUserId = {};
  try {
    var resUsers = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/admin/users?per_page=1000', {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Accept': 'application/json'
      },
      muteHttpExceptions: true
    });
    var usersCode = resUsers.getResponseCode();
    var usersText = resUsers.getContentText() || '{}';
    Logger.log('Users fetch HTTP ' + usersCode + ' - first 200 chars: ' + usersText.substring(0, 200));
    var usersData = JSON.parse(usersText);
    var users = (usersData && usersData.users) || [];
    if (!Array.isArray(users)) users = [];
    users.forEach(function(u) { if (u && u.email) emailToUserId[u.email.toLowerCase()] = u.id; });
    Logger.log('Co ' + Object.keys(emailToUserId).length + ' user co email');
  } catch (e) { Logger.log('Loi fetch users (van tiep tuc): ' + e); }

  // Doc tat ca rows tu sheet
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Map column index
  var COL = {};
  headers.forEach(function(h, i) { COL[String(h).trim()] = i; });

  var stats = { total: 0, skipped: 0, inserted: 0, errors: 0, matched: 0 };
  var batchSize = 50;
  var batch = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var orderNoRaw = String(row[COL['Ma Don']] || '').trim();
    if (!orderNoRaw) continue;
    // Pad order_no to 4 digits to match format used by current saveOrder()
    // (Sheet stores as number 42, DB stores as string "0042")
    var orderNo = /^\d+$/.test(orderNoRaw) ? orderNoRaw.padStart(4, '0') : orderNoRaw;
    stats.total++;

    // Skip neu da co
    if (existing[orderNo]) { stats.skipped++; continue; }

    var email = String(row[COL['Email']] || '').trim().toLowerCase();
    var userId = email ? (emailToUserId[email] || null) : null;
    if (userId) stats.matched++;

    var dateStr = row[COL['Ngay Dat']];
    var createdAt = null;
    try {
      // Format Sheets: "2026/04/24 11:34" -> ISO
      if (dateStr instanceof Date) {
        createdAt = dateStr.toISOString();
      } else if (dateStr) {
        var d = new Date(String(dateStr).replace(/\//g, '-'));
        if (!isNaN(d.getTime())) createdAt = d.toISOString();
      }
    } catch (e) {}

    var fullAddress = String(row[COL['Dia Chi']] || '').trim();
    // Tach prefecture neu co the (vi du: "東京都Shibuya..." -> prefecture="東京都")
    var prefecture = '';
    var address = fullAddress;
    var prefMatch = fullAddress.match(/^([^県都府道]+[県都府道])(.*)$/);
    if (prefMatch) {
      prefecture = prefMatch[1];
      address = prefMatch[2].trim();
    }

    var sanPham = String(row[COL['San Pham']] || '').trim();
    var items = sanPham ? [{ name: sanPham, size: '', qty: 1, price: 0, wt: 0, _legacy: true }] : [];

    var payload = {
      order_no: orderNo,
      user_id: userId,
      customer_name:  String(row[COL['Ho Ten']] || '').trim(),
      customer_email: email,
      customer_phone: String(row[COL['SDT']] || '').trim(),
      ship_prefecture: prefecture,
      ship_postal: String(row[COL['Ma Buu Dien']] || '').trim(),
      ship_address: address,
      items: items,
      subtotal: parseInt(row[COL['Tong Hang (JPY)']] || 0) || 0,
      shipping_fee: parseInt(row[COL['Phi Ship (JPY)']] || 0) || 0,
      total: parseInt(row[COL['TONG TT (JPY)']] || 0) || 0,
      points_used: 0,
      points_earned: Math.floor((parseInt(row[COL['TONG TT (JPY)']] || 0) || 0) / 100),
      points_awarded: false,
      status: 'pending',
      note: String(row[COL['Ghi Chu']] || '').trim(),
      delivery_time: ''
    };
    if (createdAt) payload.created_at = createdAt;

    batch.push(payload);

    // Insert mỗi batchSize don
    if (batch.length >= batchSize) {
      var ok = _insertBatch_(batch);
      if (ok) stats.inserted += batch.length;
      else stats.errors += batch.length;
      batch = [];
      Utilities.sleep(200);
    }
  }
  // Insert phan con lai
  if (batch.length > 0) {
    var ok2 = _insertBatch_(batch);
    if (ok2) stats.inserted += batch.length;
    else stats.errors += batch.length;
  }

  Logger.log('=== KET QUA BACKFILL ===');
  Logger.log('Tong row trong Sheet: ' + stats.total);
  Logger.log('Da skip (da co trong Supabase): ' + stats.skipped);
  Logger.log('Da match user_id (theo email): ' + stats.matched);
  Logger.log('Da insert moi: ' + stats.inserted);
  Logger.log('Loi: ' + stats.errors);
}

function _insertBatch_(batch) {
  try {
    var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/orders', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      payload: JSON.stringify(batch),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) return true;
    Logger.log('Batch insert fail (' + code + '): ' + res.getContentText().substring(0, 500));
    return false;
  } catch (e) {
    Logger.log('Batch insert error: ' + e);
    return false;
  }
}

// ============================================================
// SUPABASE - Danh dau don da gui + cong diem (goi tu onEdit)
// ============================================================
function markOrderShippedInSupabase(orderNo) {
  if (!SUPABASE_URL || SUPABASE_URL.indexOf('YOUR_') !== -1) return null;

  var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/mark_order_shipped', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({ p_order_no: String(orderNo) }),
    muteHttpExceptions: true
  });

  var body = res.getContentText();
  Logger.log('Mark shipped #' + orderNo + ': ' + body);
  try { return JSON.parse(body); } catch(e) { return null; }
}

// ============================================================
// TRIGGER - onEdit: khi anh tick o "Da Gui?" -> mark shipped + cong diem
// LUU Y: Phai setup installable trigger onEdit tu Apps Script UI
//   Extensions -> Apps Script -> Triggers -> Add Trigger
//   Function: onEditHandler | Event source: From spreadsheet | Type: On edit
// ============================================================
function onEditHandler(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_NAME_ORDERS) return;

    var row = e.range.getRow();
    var col = e.range.getColumn();
    if (row < 2) return; // skip header

    // Tim cot "Da Gui?" (se them cot nay trong saveOrder)
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var shipCol = headers.indexOf('Da Gui?') + 1;
    if (shipCol === 0 || col !== shipCol) return;

    var checked = e.range.getValue();
    if (checked !== true) return; // chi xu ly khi tick, khong xu ly khi bo tick

    var orderNo = sheet.getRange(row, 1).getValue(); // cot A = Ma Don
    if (!orderNo) return;

    var result = markOrderShippedInSupabase(orderNo);
    // Update cot Trang Thai
    var statusCol = headers.indexOf('Trang Thai') + 1;
    if (statusCol > 0) {
      if (result && result.ok) {
        var msg = result.points_awarded > 0
          ? 'Da gui + Cong ' + result.points_awarded + ' diem'
          : (result.already ? 'Da gui (truoc do)' : 'Da gui');
        sheet.getRange(row, statusCol).setValue(msg).setFontColor('#0E7C3A').setFontWeight('bold');
      } else {
        sheet.getRange(row, statusCol).setValue('Loi: kiem tra log').setFontColor('#C8102E');
      }
    }
  } catch (err) {
    Logger.log('onEditHandler err: ' + err);
  }
}

// ============================================================
// SUPABASE POINTS - Tich diem tu dong sau khi dat hang (DEPRECATED - giu de backward compatible)
// ============================================================
function addPointsToSupabase(userId, orderNo, orderTotal) {
  if (!SUPABASE_URL || SUPABASE_URL.indexOf('YOUR_') !== -1) return; // Chua cau hinh
  var points = Math.floor((orderTotal || 0) / 100);
  if (points <= 0) return;

  var payload = {
    user_id: userId,
    order_no: orderNo,
    order_total: orderTotal,
    points: points,
    type: 'earn',
    description: 'Don hang #' + orderNo + ' - ' + orderTotal.toLocaleString() + ' yen'
  };

  UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/points_transactions', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  Logger.log('Da tich ' + points + ' diem cho user ' + userId + ' (don #' + orderNo + ')');
}

// ============================================================
// SUPABASE POINTS - Tru diem da dung cho don hang
// ============================================================
function deductPointsFromSupabase(userId, orderNo, pointsUsed) {
  if (!SUPABASE_URL || SUPABASE_URL.indexOf('YOUR_') !== -1) return;
  if (!pointsUsed || pointsUsed <= 0) return;

  var payload = {
    user_id: userId,
    order_no: orderNo,
    order_total: pointsUsed,
    points: -Math.abs(pointsUsed), // am de tru
    type: 'redeem',
    description: 'Don hang #' + orderNo + ' - Dung ' + pointsUsed + ' diem'
  };

  UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/points_transactions', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  Logger.log('Da tru ' + pointsUsed + ' diem cua user ' + userId + ' (don #' + orderNo + ')');
}

// ============================================================
// GETRESPONSE - Luu email khach hang cho email marketing
// ============================================================
function normalizePhoneJP(raw) {
  if (!raw) return '';
  var digits = String(raw).replace(/[^0-9]/g, ''); // chi giu so
  if (!digits) return '';
  // Neu bat dau bang 0 (SDT Nhat) -> chuyen thanh +81
  if (digits.charAt(0) === '0') {
    return '+81' + digits.substring(1);
  }
  // Neu da co 81 o dau -> them +
  if (digits.indexOf('81') === 0 && digits.length >= 11) {
    return '+' + digits;
  }
  // Mac dinh: them +81
  return '+81' + digits;
}

function addToGetResponse(email, name, phone, prefecture, source) {
  if (!GR_API_KEY || GR_API_KEY.length < 20) return;
  if (!email) return;

  var customFields = [];
  customFields.push({ customFieldId: GR_FIELD_SOURCE, value: [source || 'unknown'] });
  if (prefecture) {
    customFields.push({ customFieldId: GR_FIELD_PREFECTURE, value: [String(prefecture)] });
  }
  var phoneIntl = normalizePhoneJP(phone);
  if (phoneIntl) {
    customFields.push({ customFieldId: GR_FIELD_PHONE, value: [phoneIntl] });
  }

  var payload = {
    email: email,
    name: name || email,
    campaign: { campaignId: GR_CAMPAIGN_ID },
    customFieldValues: customFields,
    dayOfCycle: '0'
  };

  var response = UrlFetchApp.fetch('https://api.getresponse.com/v3/contacts', {
    method: 'POST',
    headers: {
      'X-Auth-Token': 'api-key ' + GR_API_KEY,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  // 202 = accepted (new contact); 409 = already exists (van OK)
  if (code === 202 || code === 409) {
    Logger.log('GR synced: ' + email + ' (' + source + ') - HTTP ' + code);
    // Neu da ton tai (409) -> update custom fields
    if (code === 409) {
      updateGetResponseContact(email, customFields);
    }
  } else {
    Logger.log('GR error ' + code + ': ' + response.getContentText());
  }
}

function updateGetResponseContact(email, customFields) {
  // Tim contactId bang email
  var searchUrl = 'https://api.getresponse.com/v3/contacts?query%5Bemail%5D=' + encodeURIComponent(email);
  var searchRes = UrlFetchApp.fetch(searchUrl, {
    method: 'GET',
    headers: { 'X-Auth-Token': 'api-key ' + GR_API_KEY },
    muteHttpExceptions: true
  });
  if (searchRes.getResponseCode() !== 200) return;
  var contacts = JSON.parse(searchRes.getContentText());
  if (!contacts || !contacts.length) return;
  var contactId = contacts[0].contactId;

  UrlFetchApp.fetch('https://api.getresponse.com/v3/contacts/' + contactId + '/custom-fields', {
    method: 'POST',
    headers: {
      'X-Auth-Token': 'api-key ' + GR_API_KEY,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({ customFieldValues: customFields }),
    muteHttpExceptions: true
  });
  Logger.log('GR updated custom fields for ' + email);
}

function sendMemberNotification(data) {
  var ADMIN_EMAIL = 'thuyjapan1606@gmail.com';
  var name     = data.name       || '';
  var phone    = data.phone      || '';
  var email    = data.email      || '';
  var pref     = data.prefecture || '';
  var products = data.products   || 'Ch\u01b0a ch\u1ecdn';
  var note     = data.note       || '';
  var regAt    = data.registeredAt || '';

  var subject = '[B\u1ebfp Thu\u1ef7 Japan] Th\u00e0nh vi\u00ean m\u1edbi: ' + name;

  var htmlBody =
    '<div style="font-family:sans-serif;max-width:500px;margin:0 auto">' +
    '<div style="background:#2C1A0E;padding:18px 24px;border-radius:12px 12px 0 0">' +
    '<h2 style="color:#FFD700;margin:0;font-size:18px">Th\u00e0nh Vi\u00ean M\u1edbi \u0110\u0103ng K\u00fd!</h2>' +
    '<p style="color:#ccc;margin:4px 0 0;font-size:13px">B\u1ebfp Thu\u1ef7 Japan</p>' +
    '</div>' +
    '<div style="background:#fff8f0;padding:20px 24px;border-radius:0 0 12px 12px;border:1px solid #eee">' +
    '<table style="width:100%;font-size:14px;border-collapse:collapse">' +
    '<tr><td style="color:#888;padding:6px 0;width:100px">H\u1ecd t\u00ean</td><td><strong>' + name + '</strong></td></tr>' +
    '<tr><td style="color:#888;padding:6px 0">S\u0110T</td><td><strong>' + phone + '</strong></td></tr>' +
    '<tr><td style="color:#888;padding:6px 0">Email</td><td>' + (email || 'Kh\u00f4ng c\u00f3') + '</td></tr>' +
    '<tr><td style="color:#888;padding:6px 0">T\u1ec9nh/Th\u00e0nh</td><td>' + pref + '</td></tr>' +
    '<tr><td style="color:#888;padding:6px 0">H\u00e0y mua</td><td style="color:#C8102E;font-weight:600">' + products + '</td></tr>' +
    (note ? '<tr><td style="color:#888;padding:6px 0">Ghi ch\u00fa</td><td style="color:#c00">' + note + '</td></tr>' : '') +
    '<tr><td style="color:#888;padding:6px 0">\u0110\u0103ng k\u00fd l\u00fac</td><td>' + regAt + '</td></tr>' +
    '</table>' +
    '<hr style="margin:16px 0;border:none;border-top:1px solid #eee">' +
    '<p style="font-size:13px;color:#888">Xem danh s\u00e1ch \u0111\u1ea7y \u0111\u1ee7 trong sheet <strong>Thanh Vien</strong> tr\u00ean Google Sheets.</p>' +
    '</div></div>';

  try {
    GmailApp.sendEmail(ADMIN_EMAIL, subject, '', {
      htmlBody : htmlBody,
      from     : 'thuyjapan1606@gmail.com',
      name     : 'B\u1ebfp Thu\u1ef7 Japan Members'
    });
    Logger.log('Da gui email thong bao thanh vien moi: ' + name);
  } catch(err) {
    Logger.log('Loi gui email thanh vien: ' + err.toString());
  }
}

// ---- Tra ve status khi goi GET (test) ----
function doGet(e) {
  return buildResponse({ status: 'Bep Thuy Japan API OK' });
}

// ---- Tang ma don hang ----
function getNextOrderNo(ss) {
  let sheet = ss.getSheetByName(SHEET_NAME_COUNTER);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_COUNTER);
    sheet.getRange('A1').setValue(0);
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let counter = parseInt(sheet.getRange('A1').getValue()) || 0;
    counter = (counter >= 9999) ? 1 : counter + 1;
    sheet.getRange('A1').setValue(counter);
    return String(counter).padStart(4, '0');
  } finally {
    lock.releaseLock();
  }
}

// ---- Tao chuan tom tat don hang: "0.5 GT 1 GKT 1 Nem" ----
function buildOrderItems(cartItems) {
  if (!cartItems || !Array.isArray(cartItems)) return '';
  const ORDER = ['GT','GKT','C','CKT','CLUA TIEU','CLUA','M','MKT','Nem','Pte'];
  const totals = {};
  cartItems.forEach(function(item) {
    const match = (item.name || '').match(/^\[([^\]]+)\]/);
    if (!match) return;
    const code = match[1];
    const mapped = CODE_MAP[code];
    if (!mapped) return;
    // byBox: tinh so hop; con lai: tinh kg (qty x wt)
    const amount = mapped.byBox ? item.qty : item.qty * item.wt;
    totals[code] = (totals[code] || 0) + amount;
  });
  const parts = [];
  ORDER.forEach(function(code) {
    if (!totals[code]) return;
    const amount = totals[code];
    const numStr = (amount % 1 === 0) ? String(amount) : String(amount);
    parts.push(numStr + ' ' + code);
  });
  return parts.join(' ');
}

// ---- Luu don hang vao sheet "Don Hang" ----
function saveOrder(ss, orderNo, data) {
  let sheet = ss.getSheetByName(SHEET_NAME_ORDERS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_ORDERS);
  }
  const headers = [
    'Ma Don', 'Ngay Dat', 'Ho Ten', 'SDT', 'Email',
    'Ma Buu Dien', 'Dia Chi', 'San Pham',
    'Tong Hang (JPY)', 'Phi Ship (JPY)', 'TONG TT (JPY)',
    'Ghi Chu', 'Trang Thai', 'Ma Van Don', 'Da Gui?'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#2C1A0E').setFontColor('#FFD700').setFontWeight('bold');
  sheet.setFrozenRows(1);

  const dateStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  const itemsSummary = buildOrderItems(data.cartItems);

  sheet.appendRow([
    orderNo,
    dateStr,
    data.name      || '',
    data.phone     || '',
    data.email     || '',
    data.postal    || data.regionName || '',
    (data.prefecture || '') + (data.address || ''),
    itemsSummary,
    data.subtotal  || 0,
    data.shipping  || 0,
    data.total     || 0,
    data.note      || '',
    'Cho gui hang',
    '',
    false // Checkbox "Da Gui?" — tick de cong diem cho khach
  ]);

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 11).setFontColor('#C8102E').setFontWeight('bold');
  // Tao checkbox o cot "Da Gui?" (cot 15)
  sheet.getRange(lastRow, 15).insertCheckboxes();
}

// ---- Format so dien thoai: 09012345678 -> 090-1234-5678 ----
function formatPhone(phone) {
  let d = (phone || '').replace(/[^0-9]/g, '');
  // Neu co ma quoc gia +81 (vd: 819042376886 -> 09042376886)
  if (d.length === 12 && d.slice(0, 2) === '81') d = '0' + d.slice(2);
  if (d.length === 11) return d.slice(0,3) + '-' + d.slice(3,7) + '-' + d.slice(7);
  if (d.length === 10) return d.slice(0,3) + '-' + d.slice(3,6) + '-' + d.slice(6);
  return phone || '';
}

// ---- Xuat don hang sang YAMATO spreadsheet ----
function saveYamato(orderNo, data) {
  try {
    const yamatoSS    = SpreadsheetApp.openById(YAMATO_SS_ID);
    const yamatoSheet = yamatoSS.getSheetByName(YAMATO_SHEET);
    if (!yamatoSheet) return;

    const now      = new Date();
    const tomorrow = new Date(now.getTime() + 24*60*60*1000);
    const today    = Utilities.formatDate(now,      'Asia/Tokyo', 'yyyy/MM/dd');
    const nextDay  = Utilities.formatDate(tomorrow, 'Asia/Tokyo', 'yyyy/MM/dd');

    // Format ma buu dien: 7 chu so -> XXX-XXXX
    const rawPostal = (data.postal || '').replace(/[^0-9]/g, '');
    const postal    = rawPostal.length >= 7
      ? rawPostal.slice(0, 3) + '-' + rawPostal.slice(3, 7)
      : rawPostal;

    // Format so dien thoai nguoi nhan
    const phoneFormatted = formatPhone(data.phone);

    // --- Xu ly dia chi: L (32 ky tu) -> M (32 ky tu) -> N ---
    const L_MAX = 32, M_MAX = 32, N_MAX = 32;
    const fullAddress  = (data.prefecture || '') + (data.address || '');
    const buildingNote = data.note || '';
    let addrL = '', addrM = '', addrN = '';

    if (fullAddress.length <= L_MAX) {
      addrL = fullAddress;
      addrM = buildingNote.slice(0, M_MAX);
      addrN = buildingNote.slice(M_MAX, M_MAX + N_MAX);
    } else {
      addrL = fullAddress.slice(0, L_MAX);
      const overflow  = fullAddress.slice(L_MAX);
      const combinedM = overflow + (buildingNote ? ' ' + buildingNote : '');
      addrM = combinedM.slice(0, M_MAX);
      addrN = combinedM.slice(M_MAX, M_MAX + N_MAX);
    }

    const recipientName  = orderNo + '---' + (data.name || '');
    const productSummary = buildProductSummary(data.cartItems);
    const deliveryTime   = data.deliveryTime || '0812';

    // Thong tin nguoi gui (co dinh - Hong Thuy JP)
    const SENDER_PHONE  = '090-4237-6886';
    const SENDER_POSTAL = '270-0034';
    const SENDER_ADDR   = '\u5343\u8449\u770c\u677e\u6238\u5e02\u65b0\u677e\u6238\uff16\uff0d\uff11\uff11\uff18\uff0d\uff12';
    const SENDER_NAME   = 'Hong Thuy JP';
    const FRAGILE       = 'Ware mono chui'; // hang de vo
    const BILLING_CODE  = '090423768881';
    const FREIGHT_NO    = '01';

    // Tao mang 95 cot (A=0 den CQ=94)
    const row = new Array(95).fill('');
    row[0]  = orderNo;          // A: so thu tu
    row[1]  = '0';              // B: loai van don (0 = nguoi gui tra)
    row[2]  = '2';              // C: cool phan loai (2 = lanh)
    row[4]  = today;            // E: ngay du kien xuat hang
    row[5]  = nextDay;          // F: ngay du kien giao hang (E+1)
    row[6]  = deliveryTime;     // G: khung gio giao hang (TEXT)
    row[8]  = phoneFormatted;   // I: SDT nguoi nhan (TEXT)
    row[10] = postal;           // K: ma buu dien nguoi nhan
    row[11] = addrL;            // L: dia chi chinh (toi da 32 ky tu)
    row[12] = addrM;            // M: ten toa nha / tran tu L
    row[13] = addrN;            // N: tran tu M
    row[15] = recipientName;    // P: ten nguoi nhan
    row[19] = SENDER_PHONE;     // T: SDT nguoi gui (TEXT)
    row[21] = SENDER_POSTAL;    // V: ma buu dien nguoi gui
    row[22] = SENDER_ADDR;      // W: dia chi nguoi gui
    row[24] = SENDER_NAME;      // Y: ten nguoi gui
    row[27] = productSummary;   // AB: ten hang hoa 1
    row[32] = FRAGILE;          // AG: hang de vo (Ware mono chui)
    row[38] = '2';              // AM: so kien (luon la 2)
    row[39] = BILLING_CODE;     // AN: ma khach hang thanh toan
    row[41] = FREIGHT_NO;       // AP: so quan ly cuoc phi

    // Ghi tung o rieng le (chac chan hon setValues toan bo)
    const newRow = yamatoSheet.getLastRow() + 1;
    const ws = yamatoSheet;
    ws.getRange(newRow,  1).setValue(orderNo);          // A
    ws.getRange(newRow,  2).setValue('0');               // B
    ws.getRange(newRow,  3).setValue('2');               // C: cool reizo
    ws.getRange(newRow,  5).setValue(today);             // E: ngay xuat hang
    ws.getRange(newRow,  6).setValue(nextDay);           // F: ngay giao hang
    ws.getRange(newRow,  7).setNumberFormat('@').setValue(deliveryTime);    // G: gio giao (TEXT)
    ws.getRange(newRow,  9).setNumberFormat('@').setValue(phoneFormatted);  // I: SDT nguoi nhan (TEXT)
    ws.getRange(newRow, 11).setValue(postal);            // K: ma buu dien
    ws.getRange(newRow, 12).setValue(addrL);             // L: dia chi (toi da 32 ky)
    ws.getRange(newRow, 13).setValue(addrM);             // M: toa nha / tran tu L
    ws.getRange(newRow, 14).setValue(addrN);             // N: tran tu M
    ws.getRange(newRow, 16).setValue(recipientName);     // P: ten nguoi nhan
    ws.getRange(newRow, 20).setNumberFormat('@').setValue(SENDER_PHONE);   // T: SDT nguoi gui (TEXT)
    ws.getRange(newRow, 22).setValue(SENDER_POSTAL);     // V: ma buu dien nguoi gui
    ws.getRange(newRow, 23).setValue(SENDER_ADDR);       // W: dia chi nguoi gui
    ws.getRange(newRow, 25).setValue(SENDER_NAME);       // Y: ten nguoi gui
    ws.getRange(newRow, 28).setValue(productSummary);    // AB: ten hang
    ws.getRange(newRow, 33).setValue(FRAGILE);           // AG: hang de vo
    ws.getRange(newRow, 39).setValue('2');               // AM: so kien
    ws.getRange(newRow, 40).setValue(BILLING_CODE);      // AN: ma khach hang
    ws.getRange(newRow, 42).setValue(FREIGHT_NO);        // AP: so quan ly cuoc phi

  } catch (err) {
    console.error('Yamato export error at row ' + (yamatoSheet ? yamatoSheet.getLastRow() : '?') + ': ' + err.toString());
    Logger.log('ERROR: ' + err.toString());
  }
}

// ---- Tao chuan tom tat san pham theo format Yamato ----
function buildProductSummary(cartItems) {
  if (!cartItems || !Array.isArray(cartItems)) return '';

  const totals = {};
  cartItems.forEach(function(item) {
    const match = (item.name || '').match(/^\[([^\]]+)\]/);
    if (!match) return;
    const rawCode = match[1];
    const mapped  = CODE_MAP[rawCode];
    if (!mapped) return;
    const amount = mapped.byBox ? item.qty : item.qty * item.wt;
    totals[rawCode] = (totals[rawCode] || 0) + amount;
  });

  const parts = [];
  const ORDER = ['GT','GKT','C','CKT','CLUA TIEU','CLUA','M','MKT','Nem','Pte'];
  ORDER.forEach(function(rawCode) {
    if (!totals[rawCode]) return;
    const mapped = CODE_MAP[rawCode];
    const amount = totals[rawCode];
    const numStr = String(amount);
    if (mapped.code.length === 1) {
      parts.push(numStr + mapped.code);
    } else {
      parts.push(numStr + ' ' + mapped.code);
    }
  });

  return parts.join(' ');
}

// ---- Ham test: chay thu saveYamato khong can dat don ----
function testSaveYamato() {
  const mockData = {
    name: 'TEST USER',
    phone: '09042376886',
    postal: '2700034',
    prefecture: '\u5343\u8449\u770c',
    address: '\u677e\u6238\u5e02\u65b0\u677e\u6238\uff16\uff0d\uff11\uff11\uff18\uff0d\uff12',
    note: 'Test building 101',
    deliveryTime: '0812',
    cartItems: [
      { name: '[GT] Gio (Co Tieu)', qty: 1, wt: 0.5 },
      { name: '[GKT] Gio (Khong Tieu)', qty: 1, wt: 1 },
      { name: '[Nem] Nem Lui Hue', qty: 2, wt: 0.5 }
    ]
  };
  saveYamato('TEST', mockData);
  Logger.log('testSaveYamato: DONE - kiem tra sheet Yamato');
}

// ---- Helper: tao JSON response ----
function buildResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// GUI EMAIL MA VAN DON TU DONG
// Cot N (so 14) = "Ma Van Don"
// Khi admin dien ma van don vao cot N -> tu dong gui email khach
// ============================================================

// ---- Chay 1 lan de cai dat trigger ----
function createTrackingTrigger() {
  // Xoa trigger cu neu co
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var fn = t.getHandlerFunction();
    if (fn === 'onEditTracking' || fn === 'onChangeStats') {
      ScriptApp.deleteTrigger(t);
    }
  });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Trigger onEdit: gui email ma van don + cap nhat thong ke
  ScriptApp.newTrigger('onEditTracking')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
  // Trigger onChange: cap nhat thong ke khi xoa hang
  ScriptApp.newTrigger('onChangeStats')
    .forSpreadsheet(ss)
    .onChange()
    .create();
  Logger.log('Trigger da duoc cai dat thanh cong!');
}

// ---- Trigger chay khi cau truc sheet thay doi (xoa hang, them hang) ----
function onChangeStats(e) {
  if (e.changeType === 'REMOVE_ROW' || e.changeType === 'INSERT_ROW') {
    try { updateProductStats(); } catch(err) { Logger.log('Loi cap nhat thong ke onChange: ' + err); }
  }
}

// ---- Trigger chay khi sua sheet ----
function onEditTracking(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME_ORDERS) return;

  // Cap nhat thong ke san xuat moi khi Don Hang thay doi (them/xoa/sua)
  try { updateProductStats(); } catch(err) { Logger.log('Loi cap nhat thong ke: ' + err); }

  const col = e.range.getColumn();
  const row = e.range.getRow();
  if (col !== 14 || row <= 1) return; // Cot N = Ma Van Don

  const trackingNo = String(e.range.getValue()).trim();
  if (!trackingNo) return;

  // Lay thong tin don hang tu hang do
  const rowData  = sheet.getRange(row, 1, 1, 14).getValues()[0];
  const orderNo  = rowData[0];  // A: Ma Don
  const name     = rowData[2];  // C: Ho Ten
  const email    = rowData[4];  // E: Email
  const address  = rowData[6];  // G: Dia Chi
  const items    = rowData[7];  // H: San Pham
  const total    = rowData[10]; // K: Tong TT

  if (!email) {
    Logger.log('Khong co email khach - bo qua don ' + orderNo);
    return;
  }

  sendTrackingEmail(email, name, orderNo, trackingNo, address, items, total);
}

// ---- Gui email thong bao ma van don ----
function sendTrackingEmail(email, name, orderNo, trackingNo, address, items, total) {
  const trackingUrl = 'https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?encode=utf-8&number=' + trackingNo.replace(/-/g, '');

  // Unicode Vietnamese with diacritics
  var subject = '[B\u1ebfp Thu\u1ef7 Japan] \u0110\u01a1n #' + orderNo + ' \u0111\u00e3 \u0111\u01b0\u1ee3c ship!';

  var htmlBody =
    '<div style="font-family:sans-serif;max-width:500px;margin:0 auto">' +
    '<div style="background:#2C1A0E;padding:20px;border-radius:12px 12px 0 0;text-align:center">' +
    '<h2 style="color:#FFD700;margin:0">B\u1ebfp Thu\u1ef7 Japan</h2>' +
    '<p style="color:#ccc;margin:4px 0;font-size:13px">\u0110\u1eb7c S\u1ea3n H\u00e0 N\u1ed9i T\u1ea1i Nh\u1eadt</p>' +
    '</div>' +
    '<div style="background:#fff8f0;padding:24px;border-radius:0 0 12px 12px;border:1px solid #eee">' +
    '<p style="font-size:16px">Ch\u00e0o <strong>' + name + '</strong>,</p>' +
    '<p>\u0110\u01a1n h\u00e0ng c\u1ee7a b\u1ea1n \u0111\u00e3 \u0111\u01b0\u1ee3c giao cho <strong>Yamato</strong> r\u1ed3i \u1ea1!</p>' +
    '<div style="background:#fff;border:2px solid #FFD700;border-radius:10px;padding:16px;margin:16px 0">' +
    '<p style="margin:0 0 8px;font-size:13px;color:#888">M\u00c3 V\u1eacN \u0110\u01a0N</p>' +
    '<p style="font-size:24px;font-weight:bold;color:#2C1A0E;margin:0">' + trackingNo + '</p>' +
    '<a href="' + trackingUrl + '" style="display:inline-block;margin-top:10px;background:#C8102E;color:#fff;padding:8px 20px;border-radius:8px;text-decoration:none;font-size:13px">Tra C\u1ee9u \u0110\u01a1n H\u00e0ng</a>' +
    '</div>' +
    '<table style="width:100%;font-size:13px;color:#555">' +
    '<tr><td style="padding:4px 0">\u0110\u01a1n h\u00e0ng:</td><td><strong>#' + orderNo + '</strong></td></tr>' +
    '<tr><td style="padding:4px 0">S\u1ea3n ph\u1ea9m:</td><td>' + items + '</td></tr>' +
    '<tr><td style="padding:4px 0">T\u1ed5ng ti\u1ec1n:</td><td><strong style="color:#C8102E">' + total + ' JPY</strong></td></tr>' +
    '<tr><td style="padding:4px 0">\u0110\u1ecba ch\u1ec9:</td><td>' + address + '</td></tr>' +
    '</table>' +
    '<hr style="margin:16px 0;border:none;border-top:1px solid #eee">' +
    '<p style="font-size:13px;color:#888">Li\u00ean h\u1ec7 h\u1ed7 tr\u1ee3:<br>' +
    '<a href="https://m.me/ThuyJapaan">Messenger</a> &nbsp;|&nbsp; ' +
    '<a href="https://zalo.me/+818051156688">Zalo: 080-5115-6688</a></p>' +
    '<p style="font-size:13px;color:#888">C\u1ea3m \u01a1n b\u1ea1n \u0111\u00e3 \u1ee7ng h\u1ed9 B\u1ebfp Thu\u1ef7 Japan!</p>' +
    '<p style="font-size:13px;color:#888">Ch\u00fac b\u1ea1n nh\u1eadn h\u00e0ng ngon, t\u01b0\u01a1i v\u00e0 tr\u1ecdn v\u1eb9n!</p>' +
    '</div></div>';

  GmailApp.sendEmail(email, subject, '', {
    htmlBody  : htmlBody,
    from      : 'thuyjapan1606@gmail.com',
    replyTo   : 'thuyjapan1606@gmail.com',
    name      : 'B\u1ebfp Thu\u1ef7 Japan'
  });

  Logger.log('Da gui email ma van don ' + trackingNo + ' den ' + email);
}

// ============================================================
// EMAIL THONG BAO DON HANG MOI (gui cho admin)
// ============================================================
function sendOrderNotification(orderNo, data) {
  const ADMIN_EMAIL = 'thuyjapan1606@gmail.com';

  const name    = data.name    || '';
  const phone   = data.phone   || '';
  const email   = data.email   || '';
  const postal  = data.postal  || '';
  const pref    = data.prefecture || '';
  const address = data.address || '';
  const note    = data.note    || '';
  const sub     = data.subtotal || 0;
  const ship    = data.shipping || 0;
  const total   = data.total    || 0;
  const items   = buildOrderItems(data.cartItems || []);
  const cart    = data.cartItems || [];

  var subject = '[B\u1ebfp Thu\u1ef7 Japan] \u0110\u01a1n m\u1edbi #' + orderNo + ' - ' + name;

  var rows = cart.map(function(i) {
    return '<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">' + i.name + ' (' + (i.size||'') + ')</td>' +
           '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">' + i.qty + '</td>' +
           '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + ((i.price||0) * i.qty).toLocaleString() + ' \xa5</td></tr>';
  }).join('');

  var htmlBody =
    '<div style="font-family:sans-serif;max-width:520px;margin:0 auto">' +
    '<div style="background:#2C1A0E;padding:18px 24px;border-radius:12px 12px 0 0">' +
    '<h2 style="color:#FFD700;margin:0;font-size:18px">[\u0110\u01a1n M\u1edbi] #' + orderNo + '</h2>' +
    '<p style="color:#ccc;margin:4px 0 0;font-size:13px">B\u1ebfp Thu\u1ef7 Japan</p>' +
    '</div>' +
    '<div style="background:#fff8f0;padding:20px 24px;border-radius:0 0 12px 12px;border:1px solid #eee">' +
    '<table style="width:100%;font-size:13px;margin-bottom:16px">' +
    '<tr><td style="color:#888;padding:4px 0;width:90px">H\u1ecd t\u00ean</td><td><strong>' + name + '</strong></td></tr>' +
    '<tr><td style="color:#888;padding:4px 0">S\u0110T</td><td>' + phone + '</td></tr>' +
    '<tr><td style="color:#888;padding:4px 0">Email</td><td>' + email + '</td></tr>' +
    '<tr><td style="color:#888;padding:4px 0">\u0110\u1ecba ch\u1ec9</td><td>\u3012' + postal + ' ' + pref + '<br>' + address + '</td></tr>' +
    (note ? '<tr><td style="color:#888;padding:4px 0">Ghi ch\u00fa</td><td style="color:#c00">' + note + '</td></tr>' : '') +
    '</table>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
    '<tr style="background:#2C1A0E;color:#FFD700"><th style="padding:8px;text-align:left">S\u1ea3n ph\u1ea9m</th><th style="padding:8px;text-align:center">SL</th><th style="padding:8px;text-align:right">Th\u00e0nh ti\u1ec1n</th></tr>' +
    rows +
    '</table>' +
    '<div style="margin-top:12px;text-align:right;font-size:13px">' +
    '<div style="color:#555">H\u00e0ng: ' + sub.toLocaleString() + ' \xa5 &nbsp;|&nbsp; Ship: ' + ship.toLocaleString() + ' \xa5</div>' +
    '<div style="font-size:18px;font-weight:bold;color:#C8102E;margin-top:4px">T\u1ed5ng: ' + total.toLocaleString() + ' \xa5</div>' +
    '</div>' +
    '</div></div>';

  try {
    GmailApp.sendEmail(ADMIN_EMAIL, subject, '', {
      htmlBody : htmlBody,
      from     : 'thuyjapan1606@gmail.com',
      name     : 'B\u1ebfp Thu\u1ef7 Japan Orders'
    });
  } catch(err) {
    Logger.log('Loi gui email thong bao: ' + err.toString());
  }
}

// ============================================================
// EMAIL XAC NHAN DON HANG GUI CHO KHACH HANG
// ============================================================
function sendCustomerConfirmation(orderNo, data) {
  const email = data.email || '';
  if (!email) return;

  const name    = data.name    || 'ban';
  const phone   = data.phone   || '';
  const postal  = data.postal  || '';
  const pref    = data.prefecture || '';
  const address = data.address || '';
  const note    = data.note    || '';
  const sub     = data.subtotal || 0;
  const ship    = data.shipping || 0;
  const total   = data.total    || 0;
  const cart    = data.cartItems || [];

  // Unicode: Bếp Thuỷ = B\u1ebfp Thu\u1ef7, Cảm ơn = C\u1ea3m \u01a1n, đã đặt = \u0111\u00e3 \u0111\u1eb7t, Đơn = \u0110\u01a1n
  var subject = '[B\u1ebfp Thu\u1ef7 Japan] C\u1ea3m \u01a1n b\u1ea1n \u0111\u00e3 \u0111\u1eb7t h\u00e0ng! \u0110\u01a1n #' + orderNo;

  var rows = cart.map(function(i) {
    return '<tr>' +
      '<td style="padding:8px;border-bottom:1px solid #f0e0d0">' + i.name + ' (' + (i.size||'') + ')</td>' +
      '<td style="padding:8px;border-bottom:1px solid #f0e0d0;text-align:center">' + i.qty + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #f0e0d0;text-align:right">' + ((i.price||0)*i.qty).toLocaleString() + ' \xa5</td>' +
      '</tr>';
  }).join('');

  var htmlBody =
    '<div style="font-family:sans-serif;max-width:520px;margin:0 auto">' +
    '<div style="background:#2C1A0E;padding:24px;border-radius:12px 12px 0 0;text-align:center">' +
    '<h2 style="color:#FFD700;margin:0">B\u1ebfp Thu\u1ef7 Japan</h2>' +
    '<p style="color:#ccc;margin:6px 0 0;font-size:13px">\u0110\u1eb7c S\u1ea3n H\u00e0 N\u1ed9i T\u1ea1i Nh\u1eadt</p>' +
    '</div>' +
    '<div style="background:#fff8f0;padding:24px;border-radius:0 0 12px 12px;border:1px solid #eee">' +
    '<p style="font-size:16px">Ch\u00e0o <strong>' + name + '</strong>,</p>' +
    '<p style="color:#444">B\u1ebfp Thu\u1ef7 Japan \u0111\u00e3 nh\u1eadn \u0111\u01b0\u1ee3c \u0111\u01a1n h\u00e0ng c\u1ee7a b\u1ea1n r\u1ed3i \u1ea1!<br>' +
    'Ch\u00fang t\u00f4i s\u1ebd x\u1eed l\u00fd v\u00e0 li\u00ean h\u1ec7 x\u00e1c nh\u1eadn thanh to\u00e1n s\u1edbm nh\u1ea5t c\u00f3 th\u1ec3. C\u1ea3m \u01a1n b\u1ea1n r\u1ea5t nhi\u1ec1u!</p>' +
    '<div style="background:#fff;border:2px solid #FFD700;border-radius:10px;padding:16px;margin:16px 0">' +
    '<p style="margin:0 0 4px;font-size:12px;color:#888">M\u00c3 \u0110\u01a0N H\u00c0NG</p>' +
    '<p style="font-size:22px;font-weight:bold;color:#2C1A0E;margin:0">#' + orderNo + '</p>' +
    '</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px">' +
    '<tr style="background:#2C1A0E;color:#FFD700">' +
    '<th style="padding:8px;text-align:left">S\u1ea3n ph\u1ea9m</th>' +
    '<th style="padding:8px;text-align:center">SL</th>' +
    '<th style="padding:8px;text-align:right">Th\u00e0nh ti\u1ec1n</th>' +
    '</tr>' + rows +
    '<tr><td colspan="2" style="padding:8px;text-align:right;color:#666">Ph\u00ed ship (' + pref + '):</td><td style="padding:8px;text-align:right">' + ship.toLocaleString() + ' \xa5</td></tr>' +
    '<tr style="font-weight:bold"><td colspan="2" style="padding:8px;text-align:right;color:#C8102E">T\u1ed4NG THANH TO\u00c1N:</td><td style="padding:8px;text-align:right;color:#C8102E;font-size:16px">' + total.toLocaleString() + ' \xa5</td></tr>' +
    '</table>' +
    '<div style="background:#f5f5f5;border-radius:8px;padding:12px;font-size:12px;color:#555;margin-bottom:16px">' +
    '<strong>\u0110\u1ecba ch\u1ec9 giao h\u00e0ng:</strong><br>' +
    '\u3012' + postal + ' ' + pref + '<br>' + address +
    (note ? '<br><br><strong style="color:#c00">Ghi ch\u00fa:</strong> ' + note : '') +
    '</div>' +
    '<hr style="border:none;border-top:1px solid #eee;margin:16px 0">' +
    '<p style="font-size:13px;color:#888;text-align:center">Li\u00ean h\u1ec7 h\u1ed7 tr\u1ee3:<br>' +
    '<a href="https://m.me/ThuyJapaan" style="color:#1877f2">Messenger</a> &nbsp;|&nbsp; ' +
    '<a href="https://zalo.me/+818051156688" style="color:#0068ff">Zalo: 080-5115-6688</a></p>' +
    '<p style="font-size:13px;color:#888;text-align:center">C\u1ea3m \u01a1n b\u1ea1n \u0111\u00e3 \u1ee7ng h\u1ed9 B\u1ebfp Thu\u1ef7 Japan!</p>' +
    '</div></div>';

  try {
    GmailApp.sendEmail(email, subject, '', {
      htmlBody : htmlBody,
      from     : 'thuyjapan1606@gmail.com',
      replyTo  : 'thuyjapan1606@gmail.com',
      name     : 'B\u1ebfp Thu\u1ef7 Japan'
    });
  } catch(err) {
    Logger.log('Loi gui email xac nhan khach: ' + err.toString());
  }
}

// ============================================================
// BANG THONG KE SAN XUAT - tu dong cap nhat sau moi don hang
// ============================================================
// XOA DON TEST TU SHEET + UPDATE LAI THONG KE SAN XUAT
// Chay 1 lan: chon ham "deleteTestOrdersFromSheet" -> Run
// ============================================================
function deleteTestOrdersFromSheet() {
  // Danh sach order_no test can xoa
  var testOrderNos = ['0025', '0045', '0054', '0057', '0059', '0060', '0064', '0065', '0074'];
  // Them cac order_no khac vao day neu can xoa them

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_ORDERS);
  if (!sheet) { Logger.log('Khong tim thay sheet ' + SHEET_NAME_ORDERS); return; }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('Sheet trong'); return; }

  // Doc tat ca Ma Don (cot A)
  var orderNos = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var rowsToDelete = [];

  for (var i = 0; i < orderNos.length; i++) {
    var no = String(orderNos[i][0]).trim();
    // Check both padded (0025) and unpadded (25) format
    var noPadded = /^\d+$/.test(no) ? no.padStart(4, '0') : no;
    if (testOrderNos.indexOf(no) >= 0 || testOrderNos.indexOf(noPadded) >= 0) {
      rowsToDelete.push(i + 2); // +2 because row 1 is header, arr starts at 0
    }
  }

  Logger.log('Tim thay ' + rowsToDelete.length + ' dong can xoa: ' + JSON.stringify(rowsToDelete));

  // Xoa tu DUOI LEN (de khong lech index)
  rowsToDelete.sort(function(a, b) { return b - a; });
  for (var j = 0; j < rowsToDelete.length; j++) {
    sheet.deleteRow(rowsToDelete[j]);
    Logger.log('Da xoa row ' + rowsToDelete[j]);
  }

  // Update lai thong ke san xuat
  try {
    updateProductStats(ss);
    Logger.log('Da update lai "Thong Ke San Xuat"');
  } catch (e) {
    Logger.log('Loi update stats: ' + e);
  }

  Logger.log('=== HOAN TAT ===');
  Logger.log('Da xoa: ' + rowsToDelete.length + ' don test');
  Logger.log('Stats san xuat: da tinh lai');
}

// ============================================================
// Chay thu cong: chon ham "updateProductStats" -> Run
// ============================================================
function updateProductStats(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();

  // San pham va don vi
  const PRODUCTS = [
    { code: 'GT',        name: 'Gi\u00f2 c\u00f3 ti\u00eau',                          unit: 'kg'  },
    { code: 'GKT',       name: 'Gi\u00f2 kh\u00f4ng ti\u00eau',                      unit: 'kg'  },
    { code: 'C',         name: 'Ch\u1ea3 qu\u1ebf c\u00f3 ti\u00eau',                 unit: 'kg'  },
    { code: 'CKT',       name: 'Ch\u1ea3 qu\u1ebf kh\u00f4ng ti\u00eau',              unit: 'kg'  },
    { code: 'CLUA TIEU', name: 'Ch\u1ea3 l\u1ee5a kh\u00f4ng qu\u1ebf c\u00f3 ti\u00eau', unit: 'kg'  },
    { code: 'CLUA',      name: 'Ch\u1ea3 l\u1ee5a kh\u00f4ng ti\u00eau, kh\u00f4ng qu\u1ebf', unit: 'kg'  },
    { code: 'M',         name: 'M\u1ecdc c\u00f3 ti\u00eau',                          unit: 'kg'  },
    { code: 'MKT',       name: 'M\u1ecdc kh\u00f4ng ti\u00eau',                       unit: 'kg'  },
    { code: 'Nem',       name: 'Nem l\u1ee5i cu\u1ed1n s\u1ea3 Hu\u1ebf (1 t\u00fai 10 c\u00e2y + s\u1ed1t)', unit: 'h\u1ed9p' },
    { code: 'Pte',       name: 'PA TE',                                    unit: 'h\u1ed9p' },
  ];

  // Doc tat ca don hang tu sheet Don Hang
  const orderSheet = ss.getSheetByName(SHEET_NAME_ORDERS);
  const totals = {};
  PRODUCTS.forEach(function(p) { totals[p.code] = 0; });

  if (orderSheet && orderSheet.getLastRow() > 1) {
    const rows = orderSheet.getRange(2, 1, orderSheet.getLastRow() - 1, 8).getValues();
    rows.forEach(function(row) {
      const sanPham = String(row[7] || ''); // Cot H: San Pham
      if (!sanPham) return;

      // Parse "0.5 GT 1 GKT 2 Nem" -> { GT: 0.5, GKT: 1, Nem: 2 }
      // Xu ly CLUA TIEU truoc CLUA de tranh nham
      var s = sanPham;
      var match;
      var regex = /(\d+\.?\d*)\s+(CLUA TIEU|CLUA|GT|GKT|CKT|C|MKT|M|Nem|Pte)/g;
      while ((match = regex.exec(s)) !== null) {
        var amount = parseFloat(match[1]);
        var code   = match[2];
        if (totals[code] !== undefined) {
          totals[code] += amount;
        }
      }
    });
  }

  // Tao hoac lay sheet Thong Ke
  var statsSheet = ss.getSheetByName(SHEET_NAME_STATS);
  if (!statsSheet) {
    statsSheet = ss.insertSheet(SHEET_NAME_STATS);
  }
  statsSheet.clearContents();

  // Tieu de
  var now = new Date();
  var dateStr = now.getFullYear() + '/' + (now.getMonth()+1) + '/' + now.getDate()
              + ' ' + now.getHours() + ':' + String(now.getMinutes()).padStart(2,'0');

  statsSheet.getRange('A1').setValue('BANG THONG KE SAN XUAT - Bep Thuy Japan');
  statsSheet.getRange('A2').setValue('Cap nhat: ' + dateStr);

  // Header
  var headers = ['STT', 'Ten San Pham', 'Tong So Luong', 'Don Vi', 'Ghi Chu'];
  statsSheet.getRange(4, 1, 1, headers.length).setValues([headers]);

  // Du lieu
  var dataRows = PRODUCTS.map(function(p, i) {
    var qty = totals[p.code];
    var note = qty === 0 ? 'Chua co don' : '';
    return [i + 1, p.name, qty, p.unit, note];
  });
  statsSheet.getRange(5, 1, dataRows.length, 5).setValues(dataRows);

  // Dinh dang
  // Tieu de lon
  statsSheet.getRange('A1').setFontSize(14).setFontWeight('bold').setFontColor('#2C1A0E');
  statsSheet.getRange('A2').setFontSize(10).setFontColor('#888888');

  // Header row
  statsSheet.getRange(4, 1, 1, 5)
    .setBackground('#2C1A0E').setFontColor('#FFD700').setFontWeight('bold').setHorizontalAlignment('center');

  // Du lieu rows
  for (var r = 0; r < dataRows.length; r++) {
    var rowNum = 5 + r;
    var bg = (r % 2 === 0) ? '#FFF8F0' : '#FFFFFF';
    statsSheet.getRange(rowNum, 1, 1, 5).setBackground(bg);
    // To mau do neu so luong > 0
    if (dataRows[r][2] > 0) {
      statsSheet.getRange(rowNum, 3).setFontColor('#C8102E').setFontWeight('bold');
    } else {
      statsSheet.getRange(rowNum, 3).setFontColor('#aaaaaa');
      statsSheet.getRange(rowNum, 5).setFontColor('#aaaaaa').setFontStyle('italic');
    }
  }

  // Do rong cot
  statsSheet.setColumnWidth(1, 50);
  statsSheet.setColumnWidth(2, 220);
  statsSheet.setColumnWidth(3, 130);
  statsSheet.setColumnWidth(4, 80);
  statsSheet.setColumnWidth(5, 120);

  // Canh giua cot STT, So Luong, Don Vi
  statsSheet.getRange(5, 1, dataRows.length, 1).setHorizontalAlignment('center');
  statsSheet.getRange(5, 3, dataRows.length, 2).setHorizontalAlignment('center');

  Logger.log('Da cap nhat bang thong ke san xuat');
}
