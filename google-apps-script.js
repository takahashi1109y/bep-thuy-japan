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
    var resExist = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/orders?select=order_no', {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY
      },
      muteHttpExceptions: true
    });
    var existArr = JSON.parse(resExist.getContentText() || '[]');
    existArr.forEach(function(o) { existing[String(o.order_no)] = true; });
    Logger.log('Co ' + Object.keys(existing).length + ' don da ton tai trong Supabase');
  } catch (e) { Logger.log('Loi fetch existing: ' + e); return; }

  // Lay tat ca user (id, email) tu auth.users de match
  Logger.log('Dang fetch danh sach user de match email...');
  var emailToUserId = {};
  try {
    var resUsers = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/admin/users?per_page=1000', {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY
      },
      muteHttpExceptions: true
    });
    var usersData = JSON.parse(resUsers.getContentText() || '{}');
    var users = usersData.users || [];
    users.forEach(function(u) { if (u.email) emailToUserId[u.email.toLowerCase()] = u.id; });
    Logger.log('Co ' + Object.keys(emailToUserId).length + ' user co email');
  } catch (e) { Logger.log('Loi fetch users: ' + e); }

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
    var orderNo = String(row[COL['Ma Don']] || '').trim();
    if (!orderNo) continue;
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
