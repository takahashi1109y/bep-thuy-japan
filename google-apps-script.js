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
//     GR_CF_BONUS_TOKEN    = <24-hex-char ID sau khi tao custom field "bonus_token" trong GR UI>

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
// Custom field bonus_token — anh tao trong GR UI roi paste ID vao Script Properties
const GR_CF_BONUS_TOKEN    = _prop('GR_CF_BONUS_TOKEN', '');

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
  // Admin/system types bypass payload validation
  var ADMIN_TYPES = ['payment_received', 'verify_receipt', 'campaign_email', 'campaign_test',
                     'order_confirmed', 'order_shipped', 'send_production_report',
                     'verify_then_create_order', 'manual_pending_order', 'fetch_tracking_events',
                     'admin_force_approve_payment', 'verify_dry_run',
                     'admin_create_order_from_ai_attempt'];  // 2026-05-07: bypass total validator (admin handler tự fetch data từ ai_verify_attempts)
  if (data.type && ADMIN_TYPES.indexOf(data.type) >= 0) return null;

  if (data.type === 'member') {
    if (!data.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) return 'Email invalid';
    if (!data.name || data.name.length < 1 || data.name.length > 100) return 'Name invalid';
    if (data.phone && data.phone.length > 30) return 'Phone too long';
  } else {
    // Customer order
    if (typeof data.total !== 'number' || data.total < 0 || data.total > 10000000) return 'Total invalid';
    if (data.pointsUsed && (typeof data.pointsUsed !== 'number' || data.pointsUsed < 0 || data.pointsUsed > 100000)) return 'pointsUsed invalid';
    if (data.userId && !/^[0-9a-f-]{36}$/i.test(data.userId)) return 'userId invalid';
  }
  return null;
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
      // Dong bo sang GetResponse voi tag "member" — kem bonus_token de GR email co the embed claim link
      try {
        var _memberToken = getBonusToken_(data.userId || null);
        addToGetResponse(data.email, data.name, data.phone, data.prefecture, 'member', _memberToken);
      } catch(ge) { Logger.log('GR member err: ' + ge); }
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

    // Bulk email campaign from admin "Gửi Tin" tab
    if (data.type === 'campaign_email') {
      var sent = sendCampaignEmail_(data.subject, data.body, data.recipients || []);
      return buildResponse({ success: true, type: 'campaign_email', sent: sent.ok, failed: sent.fail });
    }
    if (data.type === 'campaign_test') {
      sendCampaignEmail_(data.subject || '[TEST] Campaign', data.body, [{ email: data.test_email, name: 'Test' }]);
      return buildResponse({ success: true, type: 'campaign_test' });
    }

    // Auto-email when admin confirms payment / marks shipped
    if (data.type === 'order_confirmed') {
      try { sendOrderConfirmedEmail_(data); } catch(e) { Logger.log('Confirmed email err: ' + e); }
      return buildResponse({ success: true, type: 'order_confirmed' });
    }
    if (data.type === 'order_shipped') {
      try { sendOrderShippedEmail_(data); } catch(e) { Logger.log('Shipped email err: ' + e); }
      return buildResponse({ success: true, type: 'order_shipped' });
    }

    // AI verify on demand (admin clicks "🔄 Xác thực bằng AI" button)
    if (data.type === 'verify_receipt') {
      if (!data.confirmation_id || !data.image_url || !data.expected_amount) {
        return buildResponse({ success: false, error: 'Missing confirmation_id / image_url / expected_amount' });
      }
      var result = verifyReceiptWithAI_(data.confirmation_id, data.image_url, data.expected_amount);
      return buildResponse({ success: true, type: 'verify_receipt', result: result });
    }

    // ── Verify DRY-RUN (admin tool /thuythang Test Bill tab) ──
    // Run the full 8-layer fraud pipeline against any image URL + expected amount
    // WITHOUT touching DB / orders / payment_confirmations. Returns full layer-by-layer
    // breakdown so anh can debug failed bills from the browser instead of Apps Script editor.
    if (data.type === 'verify_dry_run') {
      if (!data.image_url || !data.expected_amount) {
        return buildResponse({ success: false, error: 'Missing image_url or expected_amount' });
      }
      try {
        var dryStart = Date.now();
        // Fetch image bytes → base64
        var imgResp = UrlFetchApp.fetch(data.image_url, { muteHttpExceptions: true });
        if (imgResp.getResponseCode() !== 200) {
          return buildResponse({
            success: false,
            error: 'Image fetch HTTP ' + imgResp.getResponseCode(),
            stage: 'fetch_image'
          });
        }
        var dryBase64 = Utilities.base64Encode(imgResp.getBlob().getBytes());
        // Run full pipeline
        var dryResult = verifyReceiptStandalone_(dryBase64, Number(data.expected_amount));
        return buildResponse({
          success: true,
          type: 'verify_dry_run',
          elapsed_ms: Date.now() - dryStart,
          match: !!dryResult.match,
          reason: dryResult.reason || '',
          raw_text: (dryResult.raw_text || '').slice(0, 1500),
          checks: dryResult.checks || {},
          detected_amount: dryResult.detected_amount || null,
          detected_date: dryResult.detected_date || null,
          detected_source: dryResult.detected_source || null,
          detected_ref: dryResult.detected_ref || null,
          hash: dryResult.hash || null,
          expected_amount: Number(data.expected_amount),
          image_url: data.image_url
        });
      } catch (dryErr) {
        Logger.log('verify_dry_run err: ' + dryErr);
        return buildResponse({ success: false, error: 'Dry run err: ' + dryErr.toString().slice(0, 200) });
      }
    }

    // Admin manual override: approve a payment confirmation that AI verify rejected (false negative).
    // Updates payment_confirmations row + bumps order to 'customer_paid' if still pending.
    // Full audit trail: manual_approver / manual_approve_reason / manual_approved_at.
    if (data.type === 'admin_force_approve_payment') {
      try {
        var fa = forceApprovePayment_(data);
        if (!fa.ok) return buildResponse({ success: false, error: fa.error || 'force_approve_failed' });
        return buildResponse({ success: true, confirmation_id: fa.confirmation_id, order_no: fa.order_no });
      } catch (faErr) {
        Logger.log('admin_force_approve_payment err: ' + faErr);
        return buildResponse({ success: false, error: 'Force approve err: ' + faErr.toString().slice(0, 200) });
      }
    }

    // Send production report email on demand (admin clicks "📧 Gửi báo cáo")
    if (data.type === 'send_production_report') {
      try {
        var pr_from = data.fromDate || '';
        var pr_to   = data.toDate   || '';
        var pr_to_email = data.recipient || PRODUCTION_REPORT_EMAIL;
        var report = sendDailyProductionReport(pr_from, pr_to, pr_to_email);
        return buildResponse({
          success: true,
          type: 'send_production_report',
          totalOrders: report ? report.totalOrders : 0,
          totalRevenue: report ? report.totalRevenue : 0,
          recipient: pr_to_email,
          range: report ? report.rangeLabel : ''
        });
      } catch(prerr) {
        return buildResponse({ success: false, error: 'Send report err: ' + prerr.toString() });
      }
    }

    // OPTION B: Verify receipt FIRST, then create order only if AI verifies amount matches
    if (data.type === 'verify_then_create_order') {
      // FIX 2026-05-07 (anh request): BLOCK GUEST ORDERS — defense in depth
      // (frontend goToCheckout + submitOrder đã block, đây là layer bảo vệ
      // nếu ai bypass FE bằng curl/Postman). Khách BẮT BUỘC có userId.
      if (!data.userId) {
        return buildResponse({
          success: false,
          error: 'must_login',
          detail: 'Vui lòng đăng ký thành viên + xác nhận email trước khi đặt đơn.'
        });
      }
      if (!data.receipt_base64 || typeof data.total !== 'number') {
        return buildResponse({ success: false, error: 'Missing receipt_base64 or total' });
      }
      var verifyRes = verifyReceiptStandalone_(data.receipt_base64, data.total);
      if (!verifyRes.match) {
        // FIX 2026-05-07 (anh request): KHÔNG auto-log AI fail nữa.
        // Trước đó mỗi lần khách upload ảnh fail → tạo 1 row ai_verify_attempts
        // → spam admin với rows trùng (khách test nhiều ảnh).
        // Bây giờ: chỉ ghi nhận khi khách CLICK button đỏ "🚨 Gửi đơn cho Thuỷ"
        // → flow manual_pending_order tạo đơn pending_manual_review (đầy đủ).
        // → Admin xem trong tab "🚨 Cần xem xét" (orders với status pending_manual_review).

        // Telegram alert — admin can intervene with manual override (rate-limited 1/5min per customer+order)
        try {
          sendVerifyFailureTelegram_({
            type: 'verify_failed',
            order_ref: data.orderRef || data.order_ref || '(chưa tạo đơn)',
            customer_name: data.name || '',
            customer_email: data.email || '',
            customer_phone: data.phone || '',
            expected_amount: data.total,
            detected_amount: verifyRes.detected_amount,
            reason: verifyRes.reason,
            checks: verifyRes.checks,
            raw_text: verifyRes.raw_text
          });
        } catch (tge) { Logger.log('TG verify_failed err: ' + tge); }
        return buildResponse({
          success: false,
          error: 'verify_failed',
          detail: {
            extracted_amount: verifyRes.detected_amount,
            expected_amount: data.total,
            reason: verifyRes.reason
          }
        });
      }
      // Verify passed → create order with status 'customer_paid' + ai_verified flag
      data.status = 'customer_paid';
      data.ai_verify_passed = true;
      data.ai_detected_amount = verifyRes.detected_amount;
      data.ai_screenshot_hash = verifyRes.hash;

      var orderNo2 = getNextOrderNo(ss);
      saveOrder(ss, orderNo2, data);
      saveYamato(orderNo2, data);
      sendOrderNotification(orderNo2, data);
      sendCustomerConfirmation(orderNo2, data);
      updateProductStats(ss);
      try {
        var buyerEmail2 = data.email || '';
        if (buyerEmail2) {
          var _token2 = getBonusToken_(data.userId || null);
          addToGetResponse(buyerEmail2, data.name || '', data.phone || '', data.prefecture || '',
            data.userId ? 'member-buyer' : 'buyer', _token2);
        }
      } catch(ge) { Logger.log('GR err: ' + ge); }
      try { saveOrderToSupabase(orderNo2, data); } catch(soe) { Logger.log('SB err: ' + soe); }
      try { savePaymentProofForVerifiedOrder_(orderNo2, data); } catch(pe) { Logger.log('Save proof err: ' + pe); }
      try { deductStockForOrder_(data.cartItems); } catch(dse) { Logger.log('Deduct stock err: ' + dse); }
      if (data.userId && data.pointsUsed > 0) {
        try { deductPointsFromSupabase(data.userId, orderNo2, data.pointsUsed); } catch(de) { Logger.log('Pts err: ' + de); }
      }
      return buildResponse({ success: true, orderNo: orderNo2, verified: true, detected_amount: verifyRes.detected_amount });
    }

    // OPTION B FALLBACK: Manual-review path. Customer hit AI verify failure N times,
    // claims they paid correctly. Skip AI verify, save order with status
    // 'pending_manual_review', upload receipt for admin to inspect, fire urgent
    // Telegram alert. Admin confirms/rejects from /thuythang within 24h.
    if (data.type === 'manual_pending_order') {
      // FIX 2026-05-07: BLOCK GUEST cho manual review path cũng
      if (!data.userId) {
        return buildResponse({
          success: false,
          error: 'must_login',
          detail: 'Vui lòng đăng ký thành viên + xác nhận email trước khi gửi đơn manual review.'
        });
      }
      if (!data.receipt_base64 || typeof data.total !== 'number') {
        return buildResponse({ success: false, error: 'Missing receipt_base64 or total' });
      }
      // Skip AI verify — admin will inspect manually
      data.status = 'pending_manual_review';
      data.ai_verify_passed = false;
      data.manual_review = true;
      data.verify_fail_count = Number(data.verify_fail_count || 0);

      var orderNoM = getNextOrderNo(ss);
      saveOrder(ss, orderNoM, data);
      saveYamato(orderNoM, data);
      sendOrderNotification(orderNoM, data);
      sendCustomerConfirmation(orderNoM, data);
      updateProductStats(ss);
      try {
        var buyerEmailM = data.email || '';
        if (buyerEmailM) {
          var _tokenM = getBonusToken_(data.userId || null);
          addToGetResponse(buyerEmailM, data.name || '', data.phone || '', data.prefecture || '',
            data.userId ? 'member-buyer' : 'buyer', _tokenM);
        }
      } catch(ge) { Logger.log('GR err: ' + ge); }
      try { saveOrderToSupabase(orderNoM, data); } catch(soe) { Logger.log('SB err: ' + soe); }
      try { savePaymentProofForManualReview_(orderNoM, data); } catch(pe) { Logger.log('Save manual proof err: ' + pe); }
      try { deductStockForOrder_(data.cartItems); } catch(dse) { Logger.log('Deduct stock err: ' + dse); }
      if (data.userId && data.pointsUsed > 0) {
        try { deductPointsFromSupabase(data.userId, orderNoM, data.pointsUsed); } catch(de) { Logger.log('Pts err: ' + de); }
      }
      // Urgent Telegram alert — admin must confirm within 24h
      try { sendManualReviewTelegramAlert_(orderNoM, data); } catch(te) { Logger.log('TG manual err: ' + te); }
      // Urgent admin email — gives bill thumbnail + quick action links, dedup'd 1/order
      try { sendManualReviewEmailToAdmin_({
        orderNo: orderNoM,
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        total: Number(data.total || 0),
        cartItems: data.cartItems || [],
        ship_address: data.ship_address || data.address || '',
        ai_layer_failed: data.ai_layer_failed || data.verify_fail_layer || ('after ' + (data.verify_fail_count || 0) + ' attempts'),
        ai_reason: data.ai_reason || data.verify_fail_reason || 'Khách báo đã thanh toán nhưng AI verify không khớp',
        verify_fail_count: data.verify_fail_count || 0,
        receipt_base64: data.receipt_base64,
        receipt_mime: data.receipt_mime
      }); } catch(me) { Logger.log('Manual review email err: ' + me); }
      // Secondary verify-funnel alert (rate-limited) — flags the manual-review fallback path
      try {
        sendVerifyFailureTelegram_({
          type: 'manual_review_pending',
          order_ref: '#' + orderNoM,
          customer_name: data.name || '',
          customer_email: data.email || '',
          customer_phone: data.phone || '',
          expected_amount: data.total,
          fail_count: data.verify_fail_count || 0
        });
      } catch (tgme) { Logger.log('TG manual_review_pending err: ' + tgme); }
      return buildResponse({ success: true, orderNo: orderNoM, manual_review: true, status: 'pending_manual_review' });
    }

    // ============================================================
    // ADD_TO_EXISTING_ORDER (2026-05-08) — Merge Orders Phase 2
    // Khách đã trả đơn gốc, muốn thêm hàng gộp ship (ship_fee=0).
    // RPC add_to_existing_order tạo đơn con, link parent_order_no.
    // ============================================================
    // FIX 2026-05-09 (Vấn đề 1): handler add_to_existing_order rewrite đầy đủ.
    // Bug cũ: 4 field names mismatch (items/amount/payment_method/'bank') + THIẾU
    // logic verify receipt → khách upload bill cũng bị reject ngay với 'missing_items'.
    // Bây giờ: dùng đúng tên field (cartItems/total/method/'bank_transfer') + verify
    // receipt qua AI Vision (giống pattern verify_then_create_order).
    if (data.type === 'add_to_existing_order') {
      // === Validate input — field names match frontend pattern existing ===
      if (!data.userId) {
        return buildResponse({ success: false, error: 'must_login',
          detail: 'Vui lòng đăng nhập trước khi thêm hàng vào đơn.' });
      }
      if (!data.parent_order_no || typeof data.parent_order_no !== 'string' || !data.parent_order_no.trim()) {
        return buildResponse({ success: false, error: 'missing_parent_order_no' });
      }
      if (!Array.isArray(data.cartItems) || data.cartItems.length === 0) {
        return buildResponse({ success: false, error: 'missing_items' });
      }
      if (typeof data.total !== 'number' || data.total < 0 || data.total > 10000000) {
        // Note: cho phép total=0 vì merge có thể ship_fee_delta=0 + items=0 (edge case)
        return buildResponse({ success: false, error: 'invalid_amount' });
      }
      if (!data.method || ['paypay', 'bank_transfer'].indexOf(data.method) < 0) {
        return buildResponse({ success: false, error: 'invalid_payment_method' });
      }
      if (!data.receipt_base64) {
        return buildResponse({ success: false, error: 'missing_receipt' });
      }

      // === Verify receipt qua AI Vision (pattern giống verify_then_create_order) ===
      var verifyRes = verifyReceiptStandalone_(data.receipt_base64, data.total);
      if (!verifyRes.match) {
        // Telegram alert — admin can intervene
        try {
          sendVerifyFailureTelegram_({
            type: 'verify_failed_merge',
            order_ref: 'merge into #' + data.parent_order_no.trim(),
            customer_name: data.name || '',
            customer_email: data.email || '',
            customer_phone: data.phone || '',
            expected_amount: data.total,
            detected_amount: verifyRes.detected_amount,
            reason: verifyRes.reason,
            checks: verifyRes.checks,
            raw_text: verifyRes.raw_text
          });
        } catch (tge) { Logger.log('TG verify_failed_merge err: ' + tge); }
        return buildResponse({
          success: false,
          error: 'verify_failed',
          detail: {
            extracted_amount: verifyRes.detected_amount,
            expected_amount: data.total,
            reason: verifyRes.reason
          }
        });
      }

      // === Verify PASS → tạo đơn con qua RPC ===
      // shipFeeDelta = data.shipping (frontend tính delta từ recalcMergeShipFee)
      // Nếu = 0 → ship miễn. Nếu > 0 → phụ thu chênh lệch.
      var mergeRes = addToExistingOrder_(
        data.parent_order_no.trim(),
        data.cartItems,
        data.total,
        data.userId,
        data.shipping || 0
      );

      if (!mergeRes.ok) {
        return buildResponse({ success: false, error: mergeRes.error });
      }

      // === Side effects (subset của verify_then_create_order) ===
      // - Yamato sheet: GỘP items vào row đơn cha (Phase 4 — KHÔNG tạo row mới)
      try {
        appendToYamatoParent_(
          data.parent_order_no.trim(),
          mergeRes.order_no,
          data.cartItems,
          data.name || ''
        );
      } catch(yme) { Logger.log('Merge Yamato append err: ' + yme); }
      // - Email confirm: TODO Phase 4 (sau)
      // - GetResponse sync: KHÔNG cần (khách đã sync khi đặt đơn gốc)
      // - Supabase orders insert: KHÔNG cần (RPC add_to_existing_order đã INSERT)
      // - Stock deduct: CẦN (đơn con cũng tiêu thụ inventory)
      try { deductStockForOrder_(data.cartItems); } catch(dse) { Logger.log('Merge deduct stock err: ' + dse); }
      // - Points deduct: nếu khách dùng điểm cho đơn merge
      if (data.userId && data.pointsUsed > 0) {
        try { deductPointsFromSupabase(data.userId, mergeRes.order_no, data.pointsUsed); } catch(de) { Logger.log('Merge pts err: ' + de); }
      }

      return buildResponse({
        success: true,
        status: 'success',
        orderNo: mergeRes.order_no,
        merged_with: data.parent_order_no.trim(),
        verified: true,
        detected_amount: verifyRes.detected_amount
      });
    }

    // ============================================================
    // ADMIN_CREATE_ORDER_FROM_AI_ATTEMPT (2026-05-07)
    // Admin click "Tạo đơn thủ công" trong tab "📋 Check thủ công":
    //   1. Fetch ai_verify_attempts row by id
    //   2. Build full order data từ row
    //   3. Run full create-order flow (giống verify_then_create_order)
    //      với status='confirmed' (admin đã verify thay AI)
    //   4. Insert payment_confirmations với receipt_url đã có sẵn
    //   5. Update ai_verify_attempts row → status='admin_resolved'
    // ============================================================
    if (data.type === 'admin_create_order_from_ai_attempt') {
      var attemptId = data.attempt_id;
      var adminEmail = data.admin_email || 'admin';
      var adminNotes = data.admin_notes || '';

      if (!attemptId) {
        return buildResponse({ success: false, error: 'missing_attempt_id' });
      }

      // 1) Fetch attempt row
      var attemptRow = null;
      try {
        var fetchUrl = SUPABASE_URL + '/rest/v1/ai_verify_attempts?id=eq.' + encodeURIComponent(attemptId);
        var fetchRes = UrlFetchApp.fetch(fetchUrl, {
          method: 'get',
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY
          },
          muteHttpExceptions: true
        });
        if (fetchRes.getResponseCode() === 200) {
          var rows = JSON.parse(fetchRes.getContentText() || '[]');
          attemptRow = rows.length > 0 ? rows[0] : null;
        }
      } catch (fe) { Logger.log('Fetch attempt err: ' + fe); }

      if (!attemptRow) {
        return buildResponse({ success: false, error: 'attempt_not_found' });
      }

      if (attemptRow.status !== 'pending') {
        return buildResponse({
          success: false,
          error: 'already_resolved',
          detail: 'Yêu cầu này đã được xử lý (status: ' + attemptRow.status + ')'
        });
      }

      // 2) Build data object matching verify_then_create_order shape
      var addr = attemptRow.customer_address || '';
      // Parse "270-0034 千葉県 松戸市新松戸6" → postal/prefecture/address
      // FIX 2026-05-07: Defensive parsing — graceful fallback nếu format khác
      var postalMatch = addr.match(/(\d{3}-?\d{4})/);
      var postal = postalMatch ? postalMatch[1] : '';
      var pref = '';
      var rest = addr;
      try {
        if (postal && postalMatch && postalMatch[0]) rest = rest.replace(postalMatch[0], '').trim();
        var prefMatch = rest.match(/(東京都|北海道|大阪府|京都府|[^\s]+?県)/);
        if (prefMatch) {
          pref = prefMatch[1];
          rest = rest.replace(pref, '').trim();
        }
      } catch (parseErr) {
        Logger.log('Address parse err: ' + parseErr + ' addr=' + addr);
      }
      // Fallback: nếu không parse được → keep raw address, postal/pref empty
      // Admin có thể edit sau trong sheet
      if (!rest) rest = addr;

      // FIX 2026-05-07: Calc shipping = total - subtotal (claimed_amount đã include ship)
      var totalAmt = Number(attemptRow.claimed_amount || 0);
      var subtotalAmt = 0;
      try {
        var items = attemptRow.cart_items || [];
        items.forEach(function(it) {
          subtotalAmt += Number(it.price || 0) * Number(it.qty || 1);
        });
      } catch (calcErr) { Logger.log('Subtotal calc err: ' + calcErr); }
      var shippingAmt = Math.max(0, totalAmt - subtotalAmt);

      var orderData = {
        name: attemptRow.customer_name || '',
        email: attemptRow.customer_email || '',
        phone: attemptRow.customer_phone || '',
        postal: postal,
        prefecture: pref,
        address: rest || addr,
        note: 'Admin xác nhận thủ công (AI verify fail). ' + (adminNotes || ''),
        deliveryTime: '',
        cartItems: attemptRow.cart_items || [],
        subtotal: subtotalAmt,
        shipping: shippingAmt,
        total: totalAmt,
        userId: attemptRow.user_id || null,
        pointsUsed: 0,
        // Admin override flags
        status: 'confirmed',
        ai_verify_passed: false,
        admin_manual_verified: true,
        admin_email: adminEmail,
        attempt_id: attemptId,
        receipt_url: attemptRow.receipt_url || null,
        receipt_path: attemptRow.receipt_path || null,
        receipt_mime: attemptRow.receipt_mime || 'image/jpeg'
      };

      // 3) Create order full flow (mirror verify_then_create_order success path)
      var orderNoA = getNextOrderNo(ss);
      Logger.log('[admin_create] Got orderNo=' + orderNoA + ' | email=' + orderData.email + ' | total=' + orderData.total);
      Logger.log('[admin_create] Email quota remaining: ' + MailApp.getRemainingDailyQuota());

      try { saveOrder(ss, orderNoA, orderData); Logger.log('[admin_create] saveOrder OK'); } catch(e) { Logger.log('[admin_create] saveOrder ERR: ' + e); }
      try { saveYamato(orderNoA, orderData); Logger.log('[admin_create] saveYamato OK'); } catch(e) { Logger.log('[admin_create] saveYamato ERR: ' + e); }
      try { sendOrderNotification(orderNoA, orderData); Logger.log('[admin_create] sendOrderNotification (admin) OK'); } catch(e) { Logger.log('[admin_create] sendOrderNotification ERR: ' + e); }

      // CRITICAL: Customer confirmation email — log explicitly để debug
      var emailSent = false;
      try {
        if (!orderData.email) {
          Logger.log('[admin_create] ⚠️ NO customer email in orderData — skip sendCustomerConfirmation');
        } else {
          Logger.log('[admin_create] → Calling sendCustomerConfirmation to ' + orderData.email);
          sendCustomerConfirmation(orderNoA, orderData);
          emailSent = true;
          Logger.log('[admin_create] ✓ sendCustomerConfirmation OK (no exception thrown)');
        }
      } catch(e) {
        Logger.log('[admin_create] ✗ sendCustomerConfirmation ERR: ' + e + ' | stack: ' + (e.stack || ''));
      }

      try { updateProductStats(ss); } catch(e) { Logger.log('[admin_create] updateProductStats ERR: ' + e); }
      try {
        if (orderData.email) {
          var _tokenA = getBonusToken_(orderData.userId || null);
          addToGetResponse(orderData.email, orderData.name, orderData.phone, orderData.prefecture,
            orderData.userId ? 'member-buyer' : 'buyer', _tokenA);
        }
      } catch(ge) { Logger.log('GR err: ' + ge); }
      try { saveOrderToSupabase(orderNoA, orderData); } catch(soe) { Logger.log('SB err: ' + soe); }

      // 4) Insert payment_confirmations row reusing existing receipt_url
      try {
        savePaymentProofForAdminResolved_(orderNoA, orderData);
      } catch (pe) { Logger.log('Save admin proof err: ' + pe); }

      try { deductStockForOrder_(orderData.cartItems); } catch (dse) { Logger.log('Deduct stock err: ' + dse); }

      // 5) Mark ai_verify_attempts as admin_resolved
      try {
        var patchUrl = SUPABASE_URL + '/rest/v1/ai_verify_attempts?id=eq.' + encodeURIComponent(attemptId);
        UrlFetchApp.fetch(patchUrl, {
          method: 'patch',
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          payload: JSON.stringify({
            status: 'admin_resolved',
            resolved_order_no: orderNoA,
            resolved_by: adminEmail,
            resolved_at: new Date().toISOString(),
            admin_notes: adminNotes || null
          }),
          muteHttpExceptions: true
        });
      } catch (upe) { Logger.log('Update attempt status err: ' + upe); }

      return buildResponse({
        success: true,
        orderNo: orderNoA,
        admin_resolved: true,
        attempt_id: attemptId,
        email_sent: emailSent,  // FIX 2026-05-07: frontend show warning nếu email fail
        customer_email: orderData.email || null
      });
    }

    // Fetch tracking events from carrier (Yamato/Sagawa)
    // Used by admin tracking tab to display delivery progress for an order
    if (data.type === 'fetch_tracking_events') {
      if (!data.carrier || !data.tracking_number) {
        return buildResponse({ success: false, error: 'Missing carrier or tracking_number' });
      }
      try {
        var events;
        if (data.carrier === 'sagawa') {
          events = scrapeSagawaTracking_(data.tracking_number);
        } else {
          events = scrapeYamatoTracking_(data.tracking_number);
        }
        return buildResponse({ success: true, events: events, carrier: data.carrier, count: events.length });
      } catch (err) {
        return buildResponse({ success: false, error: 'Scrape err: ' + err.toString().slice(0, 200) });
      }
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
        var _tokenB = getBonusToken_(data.userId || null);
        addToGetResponse(buyerEmail, buyerName, buyerPhone, buyerPref, data.userId ? 'member-buyer' : 'buyer', _tokenB);
      }
    } catch(ge) { Logger.log('GR order err: ' + ge); }

    // Luu don hang vao Supabase orders table (de khach xem lich su)
    try { saveOrderToSupabase(orderNo, data); } catch(soe) { Logger.log('Save order to SB err: ' + soe); }

    // Tu dong tru ton kho theo san pham trong cartItems
    try { deductStockForOrder_(data.cartItems); } catch(dse) { Logger.log('Deduct stock err: ' + dse); }

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

// Standalone verify — for verify_then_create_order (no DB / no confirmation_id yet)
// Input: base64 image data + expected amount
// Output: { match: bool, detected_amount, reason, raw_text, checks, hash }
//
// THREE-LAYER VERIFY (all must pass to return match=true):
//  1. EXACT amount match (within ¥1)
//  2. Recipient name appears in text (Thanghoang / タカハラ / 口座番号 2168488 / 記号番号)
//  3. SHA-256 duplicate check against payment_confirmations.screenshot_hash
//
// Designed to reject:
//  - Random images (no matching amount)
//  - Bills from other shops with coincidentally matching amount (no recipient)
//  - Re-uploaded old bills from same customer (hash already used)
function verifyReceiptStandalone_(base64, expectedAmount) {
  var apiKey = _prop('GOOGLE_VISION_KEY', '');
  if (!apiKey) {
    Logger.log('GOOGLE_VISION_KEY not set — cannot verify');
    return { match: false, reason: 'AI chưa được cấu hình. Liên hệ Thuỷ.' };
  }
  expectedAmount = Number(expectedAmount) || 0;
  var result = {
    match: false, detected_amount: null, reason: '', raw_text: '',
    checks: { amount: false, recipient: false, duplicate: null },
    hash: null
  };

  try {
    // ── Layer 0: OCR ──
    var visionResp = UrlFetchApp.fetch(
      'https://vision.googleapis.com/v1/images:annotate?key=' + apiKey,
      {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({
          requests: [{
            image: { content: base64 },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
            imageContext: { languageHints: ['ja', 'vi', 'en'] }
          }]
        })
      }
    );
    if (visionResp.getResponseCode() !== 200) {
      result.reason = 'Lỗi Vision API: ' + visionResp.getContentText().slice(0, 150);
      return result;
    }
    var visionData = JSON.parse(visionResp.getContentText());
    var fullText = (visionData.responses && visionData.responses[0] && visionData.responses[0].fullTextAnnotation
      ? visionData.responses[0].fullTextAnnotation.text : '') || '';
    result.raw_text = fullText;
    if (!fullText) { result.reason = 'AI không đọc được text trong ảnh (ảnh mờ hoặc không có chữ)'; return result; }

    // ── Layer 1: EXACT amount match ──
    // Normalize full-width digits ０-９ → 0-9 BEFORE regex matching
    var normalizedText = fullText.replace(/[０-９]/g, function(ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    });
    // Allow optional whitespace between yen symbol and digits; match ¥, ￥, JPY;
    // accept trailing 円 (full-width) or ｴﾝ (half-width katakana)
    var amountRegex = /(?:[¥￥]\s*|JPY\s*)?(\d{1,3}(?:[,，]\d{3})+|\d{4,})\s*(?:円|ｴﾝ)?/g;
    var matches = [];
    var m;
    while ((m = amountRegex.exec(normalizedText)) !== null) {
      var n = parseInt(m[1].replace(/[,，]/g, ''), 10);
      if (n >= 100 && n <= 10000000) matches.push(n);
    }
    if (matches.length === 0) {
      result.reason = 'Không tìm thấy số tiền hợp lệ trong ảnh. Đảm bảo bill rõ nét.';
      return result;
    }
    var exactMatch = matches.find(function(n) { return Math.abs(n - expectedAmount) <= 1; });
    if (exactMatch == null) {
      var closest = matches.reduce(function(best, n) {
        return Math.abs(n - expectedAmount) < Math.abs(best - expectedAmount) ? n : best;
      }, matches[0]);
      result.detected_amount = closest;
      result.reason = '❌ Số tiền không khớp. Bill có ¥' + closest.toLocaleString()
                    + ' nhưng đơn cần ¥' + expectedAmount.toLocaleString()
                    + '. Vui lòng kiểm tra số tiền đã chuyển.';
      return result;
    }
    result.detected_amount = exactMatch;
    result.checks.amount = true;

    // ── Layer 2: Recipient name check ──
    var recipientCheck = checkRecipientName_(fullText);
    result.checks.recipient = recipientCheck.matched;
    if (!recipientCheck.matched) {
      result.reason = '❌ Bill không có tên người nhận đúng.\n' +
        'Bill phải có 1 trong: "なつみ" / "Thanghoang" (PayPay) / "タカハラ ケイイチロウ" / số tài khoản 2168488. ' +
        'Đảm bảo anh/chị chụp đầy đủ thông tin người nhận trong biên lai.';
      return result;
    }

    // ── Layer 3: Hash duplicate check ──
    var hashBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, base64);
    var hash = hashBytes.map(function(b) { return (b < 0 ? b + 256 : b).toString(16); })
                       .map(function(s) { return s.length === 1 ? '0' + s : s; }).join('');
    result.hash = hash;
    var dup = checkScreenshotDuplicate_(hash);
    if (dup.duplicate) {
      result.checks.duplicate = false;
      result.reason = '❌ Biên lai này đã được dùng cho đơn #' + dup.existing_order
                    + ' trước đó. Mỗi biên lai chỉ dùng cho 1 đơn.';
      return result;
    }
    result.checks.duplicate = true;

    // ── Layer 4: Source app — must be PayPay or a known Japanese bank ──
    var sourceCheck = checkPaymentSource_(fullText);
    result.checks.source = sourceCheck.matched;
    if (!sourceCheck.matched) {
      result.reason = '❌ Bill không phải từ PayPay hoặc ngân hàng Nhật được hỗ trợ.\n' +
        'Hệ thống nhận: PayPay, ゆうちょ, Mizuho, MUFG, SMBC, りそな, セブン, ソニー, SBI, 楽天, PayPay銀行, ジャパンネット, ジブン, GMO, AEON, etc. ' +
        'Vui lòng upload đúng screenshot từ app thanh toán hoặc app ngân hàng.';
      return result;
    }
    result.detected_source = sourceCheck.matched_keyword;

    // ── Layer 5: Completion keyword (must indicate transaction success) ──
    var completionCheck = checkCompletionKeyword_(fullText);
    result.checks.completion = completionCheck.matched;
    if (!completionCheck.matched) {
      result.reason = '❌ Bill chưa thể hiện giao dịch hoàn tất.\n' +
        'Cần screenshot lúc giao dịch ĐÃ THÀNH CÔNG (có chữ "完了" / "送金" / "振込" / "支払").';
      return result;
    }

    // ── Layer 6: Date in OCR text within last 48 hours ──
    var dateCheck = checkRecentDate_(fullText);
    result.checks.date = dateCheck.recent;
    result.detected_date = dateCheck.detected_date;
    if (dateCheck.detected_date && !dateCheck.recent) {
      result.reason = '❌ Bill có vẻ là giao dịch CŨ (' + dateCheck.detected_date + ').\n' +
        'Vui lòng dùng bill được tạo trong vòng 48 giờ. Nếu mới chuyển nhưng bill vẫn báo cũ — kiểm tra timezone trên điện thoại.';
      return result;
    }
    // If date can't be detected → don't reject (some bills don't show full date prominently)

    // ── Layer 7: Transaction reference ID (取引ID 17 digits or 受付番号) ──
    var refCheck = checkTransactionRef_(fullText);
    result.checks.transaction_ref = refCheck.matched;
    if (!refCheck.matched) {
      result.reason = '❌ Bill thiếu mã giao dịch (取引ID hoặc 受付番号).\n' +
        'Bill thật từ PayPay/ngân hàng luôn có mã giao dịch dài. Có thể bill đã bị crop hoặc chỉnh sửa.';
      return result;
    }
    result.detected_ref = refCheck.matched_value;

    // ── Layer 8: Photoshop / image-editor signature in EXIF ──
    var editCheck = checkImageEditorSignature_(base64);
    result.checks.no_editor_signature = !editCheck.detected_editor;
    if (editCheck.detected_editor) {
      result.reason = '❌ Phát hiện ảnh có thể đã bị chỉnh sửa bằng phần mềm: ' + editCheck.detected_editor + '.\n' +
        'Vui lòng upload screenshot GỐC từ app — không qua Photoshop / GIMP / app chỉnh ảnh.';
      return result;
    }

    // ALL 8 CHECKS PASS
    result.match = true;
    result.reason = '✓ Khớp ¥' + exactMatch.toLocaleString()
                  + ' · ' + recipientCheck.matched_keyword
                  + ' · ' + sourceCheck.matched_keyword
                  + ' · Hash unique';
    return result;
  } catch(err) {
    result.reason = 'Lỗi: ' + err.toString().slice(0, 200);
    Logger.log('verifyReceiptStandalone_ error: ' + err);
    return result;
  }
}

// =============================================================================
// DEBUG VERIFY — editor-only diagnostic helpers (NOT exposed via doPost).
// Run from the Apps Script editor (▶) and read output via View → Executions / Logs.
//
//   testVerifyBillDebug(imageUrl, expectedAmount)
//     Loads the image from a URL (Supabase Storage public URL or any HTTPS URL),
//     re-runs the full 8-layer fraud verify pipeline of verifyReceiptStandalone_,
//     and Logger.logs each layer's intermediate state so anh có thể nhìn thấy
//     OCR thực sự đọc gì + layer nào fail + lý do cụ thể.
//
//   testVerifyFromConfirmation(confirmationId)
//     Same as above but pulls image_url + amount from an existing
//     payment_confirmations row in Supabase. Useful để re-test các bill cũ đã fail.
//
//   testVerifyDebugRunner()
//     Convenience entry point — edit hardcoded values inside, then ▶ Run.
//
// Important: doPost() dispatches purely by data.type — these names không match
// bất kỳ branch nào, nên web request không thể gọi tới các hàm debug này.
// =============================================================================

function testVerifyBillDebug(imageUrl, expectedAmount) {
  Logger.log('═══════════════════════════════════════════════════════════');
  Logger.log('DEBUG VERIFY START');
  Logger.log('  imageUrl       : ' + imageUrl);
  Logger.log('  expectedAmount : ¥' + Number(expectedAmount).toLocaleString());
  Logger.log('  timestamp      : ' + new Date().toISOString());
  Logger.log('═══════════════════════════════════════════════════════════');

  var apiKey = _prop('GOOGLE_VISION_KEY', '');
  if (!apiKey) {
    Logger.log('FAIL: GOOGLE_VISION_KEY not set in Script Properties.');
    return { match: false, reason: 'GOOGLE_VISION_KEY missing' };
  }
  if (!imageUrl) {
    Logger.log('FAIL: imageUrl is empty.');
    return { match: false, reason: 'imageUrl missing' };
  }
  expectedAmount = Number(expectedAmount) || 0;

  var summary = { match: false, failed_layer: null, detected_amount: null, reason: '' };
  var base64;

  try {
    // ── Step 0a: Fetch image bytes ──
    Logger.log('');
    Logger.log('── Step 0a: Fetch image ──');
    var fetchStart = Date.now();
    var imgResp = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true });
    var fetchMs = Date.now() - fetchStart;
    Logger.log('  HTTP        : ' + imgResp.getResponseCode());
    Logger.log('  bytes       : ' + imgResp.getBlob().getBytes().length);
    Logger.log('  fetch time  : ' + fetchMs + ' ms');
    if (imgResp.getResponseCode() !== 200) {
      Logger.log('FAIL: image fetch returned non-200');
      summary.failed_layer = 'fetch_image';
      summary.reason = 'image fetch HTTP ' + imgResp.getResponseCode();
      return summary;
    }
    base64 = Utilities.base64Encode(imgResp.getBlob().getBytes());
    Logger.log('  base64 len  : ' + base64.length);

    // ── Step 0b: Vision API OCR ──
    Logger.log('');
    Logger.log('── Step 0b: Vision API request ──');
    var ocrStart = Date.now();
    var visionResp = UrlFetchApp.fetch(
      'https://vision.googleapis.com/v1/images:annotate?key=' + apiKey,
      {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({
          requests: [{
            image: { content: base64 },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
            imageContext: { languageHints: ['ja', 'vi', 'en'] }
          }]
        })
      }
    );
    var ocrMs = Date.now() - ocrStart;
    var visionRaw = visionResp.getContentText();
    Logger.log('  HTTP        : ' + visionResp.getResponseCode());
    Logger.log('  response ms : ' + ocrMs);
    Logger.log('  raw[0..500] : ' + visionRaw.slice(0, 500));
    if (visionResp.getResponseCode() !== 200) {
      Logger.log('FAIL: Vision API non-200');
      summary.failed_layer = 'vision_api';
      summary.reason = 'Vision HTTP ' + visionResp.getResponseCode();
      return summary;
    }
    var visionData = JSON.parse(visionRaw);
    var fullText = (visionData.responses && visionData.responses[0] && visionData.responses[0].fullTextAnnotation
      ? visionData.responses[0].fullTextAnnotation.text : '') || '';
    Logger.log('  fullText len: ' + fullText.length);
    if (!fullText) {
      Logger.log('FAIL: OCR returned empty text');
      summary.failed_layer = 'ocr_empty';
      summary.reason = 'OCR text empty (ảnh mờ hoặc không có chữ)';
      return summary;
    }

    // ── Layer 1: amount ──
    Logger.log('');
    Logger.log('── Layer 1: Amount match ──');
    var amountRegex = /(?:¥|￥|JPY\s*)?(\d{1,3}(?:[,，]\d{3})+|\d{4,})\s*(?:円)?/g;
    var matches = [];
    var m;
    while ((m = amountRegex.exec(fullText)) !== null) {
      var n = parseInt(m[1].replace(/[,，]/g, ''), 10);
      if (n >= 100 && n <= 10000000) matches.push(n);
    }
    Logger.log('  extracted   : ' + JSON.stringify(matches));
    Logger.log('  expected    : ¥' + expectedAmount.toLocaleString());
    var exactMatch = matches.find(function(x) { return Math.abs(x - expectedAmount) <= 1; });
    if (exactMatch == null) {
      var closest = matches.length
        ? matches.reduce(function(best, x) {
            return Math.abs(x - expectedAmount) < Math.abs(best - expectedAmount) ? x : best;
          }, matches[0])
        : null;
      Logger.log('  closest     : ' + (closest != null ? '¥' + closest.toLocaleString() : '(no candidates)'));
      Logger.log('  RESULT      : ✗ FAIL (no exact match within ¥1)');
      summary.failed_layer = 'L1_amount';
      summary.detected_amount = closest;
      summary.reason = 'Amount mismatch — closest ¥' + (closest || 0) + ' vs expected ¥' + expectedAmount;
      return summary;
    }
    Logger.log('  matched     : ¥' + exactMatch.toLocaleString());
    Logger.log('  RESULT      : ✓ PASS');
    summary.detected_amount = exactMatch;

    // ── Layer 2: recipient ──
    Logger.log('');
    Logger.log('── Layer 2: Recipient name ──');
    Logger.log('  text[0..1000] : ' + fullText.slice(0, 1000).replace(/\n/g, ' ⏎ '));
    var recipientCheck = checkRecipientName_(fullText);
    if (recipientCheck.matched) {
      Logger.log('  matched name: ' + recipientCheck.matched_keyword);
      Logger.log('  RESULT      : ✓ PASS');
    } else {
      Logger.log('  matched name: (no patterns matched)');
      Logger.log('  expected one of: なつみ / Thanghoang / タカハラ / ケイイチロウ / 2168488 / 12030-21684881');
      Logger.log('  RESULT      : ✗ FAIL');
      summary.failed_layer = 'L2_recipient';
      summary.reason = 'No recipient name pattern matched';
      return summary;
    }

    // ── Layer 3: hash ──
    Logger.log('');
    Logger.log('── Layer 3: Hash duplicate ──');
    var hashBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, base64);
    var hash = hashBytes.map(function(b) { return (b < 0 ? b + 256 : b).toString(16); })
                       .map(function(s) { return s.length === 1 ? '0' + s : s; }).join('');
    Logger.log('  SHA-256     : ' + hash);
    var dup = checkScreenshotDuplicate_(hash);
    if (dup.duplicate) {
      Logger.log('  duplicate   : YES — already used by order #' + dup.existing_order);
      Logger.log('  RESULT      : ✗ FAIL');
      summary.failed_layer = 'L3_duplicate';
      summary.reason = 'Hash dup — existing order ' + dup.existing_order;
      return summary;
    }
    Logger.log('  duplicate   : no');
    Logger.log('  RESULT      : ✓ PASS');

    // ── Layer 4: source ──
    Logger.log('');
    Logger.log('── Layer 4: Payment source ──');
    var sourceCheck = checkPaymentSource_(fullText);
    if (sourceCheck.matched) {
      Logger.log('  matched src : ' + sourceCheck.matched_keyword);
      Logger.log('  RESULT      : ✓ PASS');
    } else {
      Logger.log('  matched src : (no match)');
      Logger.log('  expected one of: PayPay / ゆうちょ / Mizuho / MUFG / SMBC / etc.');
      Logger.log('  RESULT      : ✗ FAIL');
      summary.failed_layer = 'L4_source';
      summary.reason = 'No payment source matched';
      return summary;
    }

    // ── Layer 5: completion ──
    Logger.log('');
    Logger.log('── Layer 5: Completion keyword ──');
    var completionCheck = checkCompletionKeyword_(fullText);
    var completionKeywords = ['完了', '送金', '振込', 'お振込', '支払', 'お支払', '領収', '決済', '送付', '成功', '済', 'success', 'completed', 'paid'];
    var foundCompletion = completionKeywords.filter(function(k) {
      return new RegExp(k, 'i').test(fullText);
    });
    Logger.log('  found kws   : ' + (foundCompletion.length ? foundCompletion.join(', ') : '(none)'));
    if (completionCheck.matched) {
      Logger.log('  RESULT      : ✓ PASS');
    } else {
      Logger.log('  RESULT      : ✗ FAIL — bill not showing transaction success');
      summary.failed_layer = 'L5_completion';
      summary.reason = 'No completion keyword (完了/送金/振込/支払/etc.)';
      return summary;
    }

    // ── Layer 6: date ──
    Logger.log('');
    Logger.log('── Layer 6: Recent date (≤48h) ──');
    var allDates = [];
    var datePatterns = [
      /(20\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/g,
      /(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g,
      /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](20\d{2})/g
    ];
    for (var dp = 0; dp < datePatterns.length; dp++) {
      var dm;
      while ((dm = datePatterns[dp].exec(fullText)) !== null) allDates.push(dm[0]);
    }
    Logger.log('  all dates   : ' + (allDates.length ? allDates.join(', ') : '(none)'));
    var dateCheck = checkRecentDate_(fullText);
    Logger.log('  picked date : ' + (dateCheck.detected_date || '(none)'));
    Logger.log('  recent (48h): ' + dateCheck.recent);
    if (dateCheck.detected_date && !dateCheck.recent) {
      Logger.log('  RESULT      : ✗ FAIL — bill quá cũ');
      summary.failed_layer = 'L6_date';
      summary.reason = 'Date too old: ' + dateCheck.detected_date;
      return summary;
    }
    Logger.log('  RESULT      : ✓ PASS' + (dateCheck.detected_date ? '' : ' (date undetected — open-fail policy)'));

    // ── Layer 7: transaction ref ──
    Logger.log('');
    Logger.log('── Layer 7: Transaction reference ──');
    var refCheck = checkTransactionRef_(fullText);
    var attemptLog = [];
    if (/取引[\s]*(?:番号|ID|No)/i.test(fullText)) attemptLog.push('found 取引 keyword');
    if (/受付番号|振込番号|整理番号|お取扱番号|認証番号|参照番号|ご依頼人番号/.test(fullText)) attemptLog.push('found bank ref keyword');
    if (/\d{12,25}/.test(fullText.replace(/\s+/g, ''))) attemptLog.push('found 12+ digit numeric');
    if (/\b[A-Z]{2,4}\d{6,12}\b/.test(fullText)) attemptLog.push('found alpha-prefixed ref');
    Logger.log('  attempts    : ' + (attemptLog.length ? attemptLog.join(' | ') : '(none — no ref signal at all)'));
    if (refCheck.matched) {
      Logger.log('  matched val : ' + refCheck.matched_value);
      Logger.log('  RESULT      : ✓ PASS');
    } else {
      Logger.log('  RESULT      : ✗ FAIL — no transaction ref found');
      summary.failed_layer = 'L7_ref';
      summary.reason = 'No transaction ref ID';
      return summary;
    }

    // ── Layer 8: editor signature ──
    Logger.log('');
    Logger.log('── Layer 8: Image-editor EXIF signature ──');
    var editCheck = checkImageEditorSignature_(base64);
    if (editCheck.detected_editor) {
      Logger.log('  editor      : ' + editCheck.detected_editor);
      Logger.log('  RESULT      : ✗ FAIL — image edited');
      summary.failed_layer = 'L8_editor';
      summary.reason = 'Image edited with ' + editCheck.detected_editor;
      return summary;
    }
    Logger.log('  editor      : (no editor detected)');
    Logger.log('  RESULT      : ✓ PASS');

    // ── ALL PASS ──
    Logger.log('');
    Logger.log('═══════════════════════════════════════════════════════════');
    Logger.log('FINAL: ✓ MATCH — all 8 layers passed');
    Logger.log('  detected ¥' + exactMatch.toLocaleString() + ' · ' + recipientCheck.matched_keyword + ' · ' + sourceCheck.matched_keyword);
    Logger.log('═══════════════════════════════════════════════════════════');
    summary.match = true;
    summary.failed_layer = null;
    summary.reason = '✓ All layers passed';
    return summary;

  } catch (err) {
    Logger.log('');
    Logger.log('EXCEPTION: ' + err);
    Logger.log('Stack    : ' + (err && err.stack ? err.stack.slice(0, 600) : '(no stack)'));
    summary.failed_layer = summary.failed_layer || 'exception';
    summary.reason = 'Exception: ' + err.toString().slice(0, 200);
    return summary;
  }
}

// Re-test a past failure by loading the bill from payment_confirmations.
// Pulls image_url + amount from the row and feeds them to testVerifyBillDebug.
function testVerifyFromConfirmation(confirmationId) {
  Logger.log('═══════════════════════════════════════════════════════════');
  Logger.log('LOADING confirmation #' + confirmationId + ' from Supabase…');
  Logger.log('═══════════════════════════════════════════════════════════');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    Logger.log('FAIL: SUPABASE_URL / SUPABASE_SERVICE_KEY not set in Script Properties.');
    return { match: false, reason: 'Supabase creds missing' };
  }
  if (!confirmationId) {
    Logger.log('FAIL: confirmationId is empty.');
    return { match: false, reason: 'confirmationId missing' };
  }

  try {
    var url = SUPABASE_URL + '/rest/v1/payment_confirmations'
            + '?id=eq.' + encodeURIComponent(confirmationId)
            + '&select=id,order_no,amount,image_url,ai_status,ai_match,ai_detected_amount,created_at'
            + '&limit=1';
    var res = UrlFetchApp.fetch(url, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Accept': 'application/json'
      },
      muteHttpExceptions: true
    });
    Logger.log('Supabase HTTP : ' + res.getResponseCode());
    if (res.getResponseCode() !== 200) {
      Logger.log('FAIL: Supabase returned ' + res.getResponseCode() + ' — body: ' + res.getContentText().slice(0, 300));
      return { match: false, reason: 'Supabase HTTP ' + res.getResponseCode() };
    }
    var rows = JSON.parse(res.getContentText() || '[]');
    if (!rows.length) {
      Logger.log('FAIL: no payment_confirmations row with id=' + confirmationId);
      return { match: false, reason: 'Row not found' };
    }
    var row = rows[0];
    Logger.log('Loaded row    : ' + JSON.stringify({
      id: row.id,
      order_no: row.order_no,
      amount: row.amount,
      ai_status: row.ai_status,
      ai_match: row.ai_match,
      ai_detected_amount: row.ai_detected_amount,
      created_at: row.created_at
    }));
    if (!row.image_url) {
      Logger.log('FAIL: row has no image_url');
      return { match: false, reason: 'image_url missing on row' };
    }
    Logger.log('image_url     : ' + row.image_url);
    Logger.log('Re-running 8-layer verify on this bill now…');
    Logger.log('');

    return testVerifyBillDebug(row.image_url, row.amount);

  } catch (err) {
    Logger.log('EXCEPTION: ' + err);
    return { match: false, reason: 'Exception: ' + err.toString().slice(0, 200) };
  }
}

// Convenience runner — edit the values below, then ▶ Run testVerifyDebugRunner.
// Output: View → Executions (or Ctrl+Enter for Logs).
function testVerifyDebugRunner() {
  // ── Edit one of these two blocks before running ──

  // Option A: by image URL + expected amount
  var imageUrl       = '';   // e.g. 'https://curcsvwvjkjewtonkhnr.supabase.co/storage/v1/object/public/payment-proofs/...'
  var expectedAmount = 0;    // e.g. 12500

  // Option B: by confirmation_id (overrides Option A if set)
  var confirmationId = '';   // e.g. '1234' or UUID

  if (confirmationId) {
    Logger.log('Running testVerifyFromConfirmation(' + confirmationId + ')');
    return testVerifyFromConfirmation(confirmationId);
  }
  if (imageUrl && expectedAmount) {
    Logger.log('Running testVerifyBillDebug(<url>, ' + expectedAmount + ')');
    return testVerifyBillDebug(imageUrl, expectedAmount);
  }
  Logger.log('⚠ testVerifyDebugRunner: please edit the function source và set imageUrl+expectedAmount HOẶC confirmationId.');
  return null;
}

// Recipient-name fingerprint check.
// Returns { matched: bool, matched_keyword: string }
function checkRecipientName_(text) {
  // Patterns covering PayPay name, full-width / half-width katakana, romaji, account/symbol numbers
  var patterns = [
    // PayPay personal-transfer prefix patterns (UI styling: "Thanghoang さんに送る", "Thanghoang 様", etc.)
    { regex: /Thanghoang.{0,3}(?:さん|様)/i,                                              name: 'Thanghoang さん/様 (PayPay UI)' },
    { regex: /(?:送金先|宛先|送り先|To)[:\s]*Thanghoang/i,                                 name: '送金先/宛先: Thanghoang' },
    { regex: /Thanghoang.{0,3}に送/i,                                                     name: 'Thanghoang ...に送る/送りました' },
    // OCR tolerance — match if 8+ consecutive chars of "Thanghoang" appear (handles 1-2 char OCR errors, e.g. "Thanghoarq")
    { regex: /T[hH][a-z0-9]{1,2}n[a-z0-9]{0,2}h[a-z0-9]{0,2}o[a-z0-9]{1,3}n[gq]/i,        name: 'Thanghoang (OCR fuzzy)' },
    // PayPay personal-transfer prefix patterns cho なつみ (account renewed 2026-05-08)
    { regex: /なつみ.{0,3}(?:さん|様)/i,                                                  name: 'なつみ さん/様 (PayPay UI)' },
    { regex: /(?:送金先|宛先|送り先|To)[:\s]*なつみ/i,                                     name: '送金先/宛先: なつみ' },
    { regex: /なつみ.{0,3}に送/i,                                                         name: 'なつみ ...に送る/送りました' },
    { regex: /なつみ/,                          name: 'なつみ (hiragana)' },
    { regex: /ナツミ/,                          name: 'ナツミ (katakana, OCR convert)' },
    { regex: /natsumi/i,                       name: 'Natsumi (romaji)' },
    // Bank transfer prefix patterns for タカハラ (振込先/受取人/名義人/お振込先/お受取り)
    { regex: /(?:振込先|受取人|名義人|お振込先|お受取り)[:\s]*(?:タカハラ|ﾀｶﾊﾗ|Takahara)/i,   name: '振込先/受取人: タカハラ' },
    { regex: /thanghoang/i,                    name: 'Thanghoang' },
    { regex: /thang\s*hoang/i,                 name: 'Thang Hoang' },
    { regex: /タカハラ/,                        name: 'タカハラ' },
    { regex: /ﾀｶﾊﾗ/,                           name: 'ﾀｶﾊﾗ' },
    { regex: /takahara/i,                      name: 'Takahara' },
    { regex: /ケイイチロウ/,                    name: 'ケイイチロウ' },
    { regex: /ｹｲｲﾁﾛｳ/,                         name: 'ｹｲｲﾁﾛｳ' },
    { regex: /keiichiro/i,                     name: 'Keiichiro' },
    { regex: /2168488/,                        name: 'Tài khoản 2168488' },
    { regex: /12030[\-\s]?21684881/,           name: '記号番号 12030-21684881' },
    { regex: /二〇八店|208店/,                  name: '支店 208' }
  ];
  for (var i = 0; i < patterns.length; i++) {
    if (patterns[i].regex.test(text)) {
      return { matched: true, matched_keyword: patterns[i].name };
    }
  }
  return { matched: false };
}

// Layer 4: Source app — must be PayPay or a known Japanese bank
function checkPaymentSource_(text) {
  var sources = [
    { regex: /paypay|ペイペイ|ペイぺイ/i,                   name: 'PayPay' },
    { regex: /ゆうちょ|ゆう ちょ|JP\s*BANK|Japan\s*Post\s*Bank/i, name: 'ゆうちょ銀行' },
    { regex: /三菱\s*UFJ|MUFG|Mitsubishi\s*UFJ/i,         name: '三菱UFJ' },
    { regex: /三井住友|SMBC|Mitsui\s*Sumitomo/i,           name: '三井住友銀行' },
    { regex: /みずほ|Mizuho/i,                            name: 'みずほ銀行' },
    { regex: /りそな|Resona/i,                            name: 'りそな銀行' },
    { regex: /セブン銀行|Seven\s*Bank/i,                   name: 'セブン銀行' },
    { regex: /ソニー銀行|Sony\s*Bank/i,                    name: 'ソニー銀行' },
    { regex: /SBI(\s*ネット)?|SBI\s*Net/i,                 name: 'SBI銀行' },
    { regex: /楽天銀行|Rakuten\s*Bank/i,                   name: '楽天銀行' },
    { regex: /PayPay\s*銀行|ジャパンネット/i,              name: 'PayPay銀行' },
    { regex: /ジブン銀行|au\s*じぶん/i,                    name: 'auじぶん銀行' },
    { regex: /GMO\s*あおぞら|aozora/i,                     name: 'GMOあおぞらネット銀行' },
    { regex: /イオン銀行|AEON\s*Bank/i,                    name: 'イオン銀行' },
    { regex: /住信SBI|住信\s*SBI/i,                        name: '住信SBIネット銀行' },
    { regex: /LINE\s*Pay|ラインペイ/i,                     name: 'LINE Pay' },
    { regex: /d\s*払い|au\s*PAY|メルペイ|メルカリ/i,        name: 'Mobile Pay' }
  ];
  for (var i = 0; i < sources.length; i++) {
    if (sources[i].regex.test(text)) return { matched: true, matched_keyword: sources[i].name };
  }
  return { matched: false };
}

// Layer 5: Completion keyword — bill must indicate successful transaction
function checkCompletionKeyword_(text) {
  // 完了 = completed; 送金 = remit; 振込 = transfer; 支払 = payment; 領収 = receipt
  // Also accept 成功 / done / success for international bills
  var keywords = /完了|送り(?:ました)?|送金|送信|送付|振込|お振込|振替|支払|お支払|受取|受け取(?:り)?|領収|決済|成功|済(?:み)?|完済|success|completed|paid|sent/i;
  return { matched: keywords.test(text) };
}

// Layer 6: Date in OCR within last 72 hours.
// CRITICAL FIX: Bills have multiple dates including 有効期限 (expiry, future date).
// Old logic picked LATEST → would pick expiry → fail "future date" check.
// FIX: skip dates near expiry keywords; prefer dates near transaction keywords;
// fallback to OLDEST when no keyword context.
function checkRecentDate_(text) {
  var now = new Date();
  var cutoff = now.getTime() - (72 * 60 * 60 * 1000); // 72h (was 48; lenient)

  var patterns = [
    /(20\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/g,
    /(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g,
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](20\d{2})/g
  ];

  // Collect all dates with positional + keyword context
  var allDates = [];
  for (var p = 0; p < patterns.length; p++) {
    var rgx = patterns[p];
    var m;
    while ((m = rgx.exec(text)) !== null) {
      var y, mo, d;
      if (m[1].length === 4) { y = +m[1]; mo = +m[2]; d = +m[3]; }
      else { y = +m[3]; mo = +m[1]; d = +m[2]; }
      if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2024 || y > 2030) continue;
      var dt = new Date(y, mo - 1, d);
      if (isNaN(dt.getTime())) continue;

      // Examine 60 chars BEFORE this date for context keywords
      var ctxStart = Math.max(0, m.index - 60);
      var ctxBefore = text.substring(ctxStart, m.index);
      var hasExpiry = /有効期限|期限切れ|期限|expir|valid.{0,5}until/i.test(ctxBefore);
      var hasTxn = /取引完了|取引日|送信日|完了日|決済日|支払日|お振込日|受け取り完了|送金日|送りました|発行日|paid.{0,5}on|completed|transaction/i.test(ctxBefore);

      allDates.push({ date: dt, position: m.index, hasExpiry: hasExpiry, hasTxn: hasTxn });
    }
  }

  if (allDates.length === 0) return { recent: true, detected_date: null }; // unknown — pass

  // Step 1: filter out expiry-context dates
  var nonExpiry = allDates.filter(function(d) { return !d.hasExpiry; });
  if (nonExpiry.length === 0) nonExpiry = allDates; // fallback

  // Step 2: prefer transaction-context dates
  var txnDates = nonExpiry.filter(function(d) { return d.hasTxn; });
  var candidates = txnDates.length > 0 ? txnDates : nonExpiry;

  // Step 3: pick OLDEST (transaction usually earlier than expiry/future dates)
  candidates.sort(function(a, b) { return a.date - b.date; });
  var detected = candidates[0].date;

  var detectedTs = detected.getTime();
  if (detectedTs > now.getTime() + 24 * 60 * 60 * 1000) {
    return { recent: false, detected_date: Utilities.formatDate(detected, 'Asia/Tokyo', 'yyyy/MM/dd') };
  }
  return {
    recent: detectedTs >= cutoff,
    detected_date: Utilities.formatDate(detected, 'Asia/Tokyo', 'yyyy/MM/dd')
  };
}

// Layer 7: Transaction reference ID
// PayPay 取引番号/取引ID can be 17-22 digits (with or without spaces)
// Bank 受付番号 = alphanumeric. Strip whitespace for matching.
function checkTransactionRef_(text) {
  // Strip text for digit-pattern matching (PayPay sometimes splits ID with spaces in UI)
  var textStripped = text.replace(/[\s]+/g, '');

  // 1. PayPay: 取引番号 OR 取引ID OR トランザクションID + 12-25 alphanumeric chars
  var paypayId = /取引[\s]*(?:番号|ID|No)[\s:：]*([A-Za-z0-9\s]{12,30})/i.exec(text);
  if (paypayId) {
    var cleaned = paypayId[1].replace(/[\s]+/g, '');
    if (cleaned.length >= 12) return { matched: true, matched_value: cleaned };
  }
  // Same on stripped text
  var paypayIdStripped = /取引(?:番号|ID|No)([A-Za-z0-9]{12,30})/i.exec(textStripped);
  if (paypayIdStripped) return { matched: true, matched_value: paypayIdStripped[1] };

  // 2. 銀行 reference numbers
  var bankRef = /(?:受付番号|受付\s*No|振込番号|整理番号|お取扱番号|認証番号|参照番号|ご依頼人番号)[\s:：]*([A-Z0-9\s]{6,25})/i.exec(text);
  if (bankRef) {
    var cleaned2 = bankRef[1].replace(/[\s]+/g, '');
    if (cleaned2.length >= 6) return { matched: true, matched_value: cleaned2 };
  }

  // 3. Loose: any standalone 12+ digit number after stripping spaces (PayPay/bank fallback)
  var loose = /(\d{12,25})/.exec(textStripped);
  if (loose) return { matched: true, matched_value: loose[1] };

  // 4. Loose: alphanumeric ref like RT0M1234567 (Yucho format)
  var alpha = /\b([A-Z]{2,4}\d{6,12})\b/.exec(text);
  if (alpha) return { matched: true, matched_value: alpha[1] };

  return { matched: false };
}

// Layer 8: Image editor signature (Photoshop / GIMP / etc.)
// Reads JPEG EXIF "Software" tag from the first 64KB of base64 data.
// Returns { detected_editor: string|null }
function checkImageEditorSignature_(base64) {
  try {
    // Decode first ~96KB (covers EXIF block in most JPEGs)
    var sample = base64.slice(0, 130000);
    var bytes = Utilities.base64Decode(sample);
    // Search for ASCII text in the first chunk — EXIF "Software" tag stores plain ASCII
    var text = '';
    for (var i = 0; i < Math.min(bytes.length, 96000); i++) {
      var b = bytes[i];
      // Printable ASCII range (extended a bit for accented chars and common symbols)
      if ((b >= 32 && b <= 126) || b === 0) {
        text += b === 0 ? ' ' : String.fromCharCode(b);
      } else {
        text += ' ';
      }
    }
    var editorPatterns = [
      { regex: /Adobe\s*Photoshop/i,        name: 'Adobe Photoshop' },
      { regex: /GIMP/,                       name: 'GIMP' },
      { regex: /Pixelmator/i,                name: 'Pixelmator' },
      { regex: /Affinity\s*Photo/i,          name: 'Affinity Photo' },
      { regex: /Snapseed/i,                  name: 'Snapseed' },
      { regex: /Photo\s*Editor/i,            name: 'Photo Editor' },
      { regex: /Picsart/i,                   name: 'PicsArt' },
      { regex: /Lightroom/i,                 name: 'Lightroom' },
      { regex: /CorelDRAW/i,                 name: 'CorelDRAW' },
      { regex: /Paint\.NET/i,                name: 'Paint.NET' }
    ];
    for (var j = 0; j < editorPatterns.length; j++) {
      if (editorPatterns[j].regex.test(text)) {
        return { detected_editor: editorPatterns[j].name };
      }
    }
    return { detected_editor: null };
  } catch(e) {
    Logger.log('checkImageEditorSignature_ err: ' + e);
    return { detected_editor: null }; // fail-open
  }
}

// Check if a screenshot hash already exists in payment_confirmations.
// Returns { duplicate: bool, existing_order: string|null }
function checkScreenshotDuplicate_(hash) {
  if (!hash || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) return { duplicate: false };
  try {
    var url = SUPABASE_URL + '/rest/v1/payment_confirmations'
            + '?screenshot_hash=eq.' + encodeURIComponent(hash)
            + '&select=order_no&limit=1';
    var res = UrlFetchApp.fetch(url, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Accept': 'application/json'
      },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return { duplicate: false };
    var arr = JSON.parse(res.getContentText() || '[]');
    if (Array.isArray(arr) && arr.length > 0) {
      return { duplicate: true, existing_order: arr[0].order_no };
    }
    return { duplicate: false };
  } catch (e) {
    Logger.log('checkScreenshotDuplicate_ err: ' + e);
    return { duplicate: false };
  }
}

// ============================================================
// DEBUG HELPER — find recent orders for an email
// READ-ONLY. Runs from Apps Script editor for anh to inspect a
// failed/in-flight checkout (e.g. AI verify rejected, was the
// order still saved?).
//
// Usage from editor:
//   findRecentOrdersForEmail('thanghoang1109@gmail.com', 2);
// or run testFindMyTestOrder() (wrapper below) and check Executions log.
//
// Returns: array of order rows (also logged via Logger.log).
// ============================================================
function findRecentOrdersForEmail(email, hoursBack) {
  if (!email) {
    Logger.log('findRecentOrdersForEmail: email is required');
    return [];
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    Logger.log('findRecentOrdersForEmail: SUPABASE_URL or SUPABASE_SERVICE_KEY missing');
    return [];
  }
  hoursBack = Number(hoursBack) > 0 ? Number(hoursBack) : 2;

  // Build a UTC ISO cutoff (Supabase timestamps are stored UTC).
  var cutoffMs = Date.now() - hoursBack * 3600 * 1000;
  var cutoffIso = new Date(cutoffMs).toISOString();

  var url = SUPABASE_URL + '/rest/v1/orders'
          + '?select=order_no,status,customer_name,customer_email,customer_phone,total,'
          + 'ai_verify_passed,ai_detected_amount,points_used,created_at'
          + '&customer_email=eq.' + encodeURIComponent(email)
          + '&created_at=gte.' + encodeURIComponent(cutoffIso)
          + '&order=created_at.desc'
          + '&limit=50';

  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'GET', // explicit — read-only
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Accept': 'application/json'
      },
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var body = res.getContentText() || '[]';
    if (code !== 200) {
      Logger.log('findRecentOrdersForEmail HTTP ' + code + ': ' + body.slice(0, 300));
      return [];
    }
    var rows = JSON.parse(body);
    if (!Array.isArray(rows)) {
      Logger.log('findRecentOrdersForEmail: response not array: ' + body.slice(0, 300));
      return [];
    }
    Logger.log('=== findRecentOrdersForEmail ===');
    Logger.log('Email: ' + email + ' | last ' + hoursBack + 'h | found ' + rows.length + ' order(s)');
    rows.forEach(function(o, i) {
      Logger.log(
        '[' + (i + 1) + '] #' + o.order_no
        + ' | status=' + o.status
        + ' | total=¥' + (o.total || 0)
        + ' | ai_verified=' + o.ai_verify_passed
        + ' | ai_amt=' + o.ai_detected_amount
        + ' | created=' + o.created_at
      );
    });
    if (rows.length === 0) {
      Logger.log('NOTE: 0 rows usually means verify_then_create_order returned early on verify_failed.');
      Logger.log('See URGENT-RECOVER-FAILED-ORDER.md -> Section C -> Option 1.');
    }
    return rows;
  } catch (e) {
    Logger.log('findRecentOrdersForEmail err: ' + e);
    return [];
  }
}

// Convenience wrapper anh can pick from the function dropdown in the
// Apps Script editor and click Run, no parameter editing needed.
function testFindMyTestOrder() {
  return findRecentOrdersForEmail('thanghoang1109@gmail.com', 2);
}

// After verify_then_create_order saves the order, persist the receipt image
// to Supabase Storage + create a payment_confirmations row linking to it.
function savePaymentProofForVerifiedOrder_(orderNo, data) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  if (!data.receipt_base64) return;

  // 1) Upload base64 → Storage 'payment-proofs/auto-{orderNo}-{ts}.jpg'
  var ts = Date.now();
  var ext = 'jpg';
  if (data.receipt_mime === 'image/png') ext = 'png';
  else if (data.receipt_mime === 'image/webp') ext = 'webp';
  var path = 'auto/' + orderNo + '-' + ts + '.' + ext;
  var bytes = Utilities.base64Decode(data.receipt_base64);
  var blob = Utilities.newBlob(bytes, data.receipt_mime || 'image/jpeg', path);

  var uploadUrl = SUPABASE_URL + '/storage/v1/object/payment-proofs/' + encodeURIComponent(path);
  var upRes = UrlFetchApp.fetch(uploadUrl, {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': data.receipt_mime || 'image/jpeg',
      'x-upsert': 'true'
    },
    payload: blob.getBytes(),
    muteHttpExceptions: true
  });
  if (upRes.getResponseCode() >= 300) {
    Logger.log('Receipt upload err: ' + upRes.getContentText().slice(0, 200));
    return;
  }

  // 2) Get a signed URL (1 year TTL) — bucket is private, public URL won't load in <img>
  var signedUrl = '';
  try {
    var signRes = UrlFetchApp.fetch(SUPABASE_URL + '/storage/v1/object/sign/payment-proofs/' + encodeURIComponent(path), {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({ expiresIn: 365 * 86400 }),
      muteHttpExceptions: true
    });
    if (signRes.getResponseCode() === 200) {
      var signData = JSON.parse(signRes.getContentText());
      // FIX 2026-05-06 (Bug C): Supabase signedURL la relative path "/object/sign/...?token=..."
      // PHAI prepend "/storage/v1" de full URL hop le. Truoc do thieu segment nay
      // -> URL stored la "https://curcsv.../object/sign/..." (404) -> admin khong xem duoc anh.
      var rel = String(signData.signedURL || '');
      if (rel.indexOf('http') === 0) {
        signedUrl = rel;  // already absolute
      } else if (rel) {
        signedUrl = SUPABASE_URL + '/storage/v1' + (rel.charAt(0) === '/' ? rel : '/' + rel);
      }
    } else {
      Logger.log('Sign URL HTTP ' + signRes.getResponseCode() + ': ' + signRes.getContentText().slice(0, 200));
    }
  } catch(e) { Logger.log('Sign URL err: ' + e); }
  // Fallback to bare path if signing failed (admin modal can re-sign)
  if (!signedUrl) signedUrl = path;

  // 3) Create payment_confirmations row matching column names used by /thanh-vien
  // FIX (anh report 2026-05-02): admin modal reads c.screenshot_url, not c.image_url
  var confPayload = {
    order_no: orderNo,
    user_id: data.userId || null,
    claimed_amount: data.total,
    method: (data.method === 'paypay') ? 'paypay' : 'bank_transfer',            // FIX 2026-05-07: dynamic theo khách chọn
    screenshot_url: signedUrl,
    screenshot_hash: data.ai_screenshot_hash || ('auto-' + orderNo + '-' + ts), // FIX: schema NOT NULL — fallback nếu AI không hash
    file_size: bytes.length,                                                    // FIX: column exists, useful cho admin
    note: 'Auto-verified at checkout. AI detected ¥' + (data.ai_detected_amount || data.total).toLocaleString(),
    status: 'verified',                                                         // FIX: CHECK status IN ('submitted','verified','rejected'); auto-verified → mark verified
    ai_verified_amount: data.ai_detected_amount || data.total,
    ai_match: true,
    ai_confidence: 0.95,
    ai_verified_at: new Date().toISOString()
    // REMOVED: ai_status — column doesn't exist (was silently dropped by PostgREST)
  };
  var confRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/payment_confirmations', {
    method: 'post',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    payload: JSON.stringify(confPayload),
    muteHttpExceptions: true
  });
  // FIX 2026-05-06 (Bug E): Log full response body khi HTTP fail de debug schema/RLS errors.
  var confCode = confRes.getResponseCode();
  if (confCode >= 300) {
    Logger.log('Save payment_confirmation FAIL HTTP ' + confCode + ': ' + confRes.getContentText().slice(0, 500));
  } else {
    Logger.log('Save payment_confirmation OK HTTP ' + confCode + ' (verified, signed URL: ' + signedUrl.slice(0, 80) + ')');
  }
}

// Manual-review fallback: persist customer's receipt to Storage and create a
// payment_confirmations row with ai_status='manual_review_pending' so admin
// can inspect from the dashboard. Mirrors savePaymentProofForVerifiedOrder_
// but skips all AI fields.
function savePaymentProofForManualReview_(orderNo, data) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  if (!data.receipt_base64) return;

  var ts = Date.now();
  var ext = 'jpg';
  if (data.receipt_mime === 'image/png') ext = 'png';
  else if (data.receipt_mime === 'image/webp') ext = 'webp';
  var path = 'manual/' + orderNo + '-' + ts + '.' + ext;
  var bytes = Utilities.base64Decode(data.receipt_base64);
  var blob = Utilities.newBlob(bytes, data.receipt_mime || 'image/jpeg', path);

  var uploadUrl = SUPABASE_URL + '/storage/v1/object/payment-proofs/' + encodeURIComponent(path);
  var upRes = UrlFetchApp.fetch(uploadUrl, {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': data.receipt_mime || 'image/jpeg',
      'x-upsert': 'true'
    },
    payload: blob.getBytes(),
    muteHttpExceptions: true
  });
  if (upRes.getResponseCode() >= 300) {
    Logger.log('Manual receipt upload err: ' + upRes.getContentText().slice(0, 200));
    return;
  }

  // Get signed URL (1 year) — same fix as auto-verified flow
  var signedUrl = '';
  try {
    var signRes = UrlFetchApp.fetch(SUPABASE_URL + '/storage/v1/object/sign/payment-proofs/' + encodeURIComponent(path), {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({ expiresIn: 365 * 86400 }),
      muteHttpExceptions: true
    });
    if (signRes.getResponseCode() === 200) {
      var signData = JSON.parse(signRes.getContentText());
      // FIX 2026-05-06 (Bug C): mirror generateSignedReceiptUrlForOrder_ pattern
      // -> prepend /storage/v1 cho relative path. Truoc do URL stored thieu segment.
      var rel = String(signData.signedURL || '');
      if (rel.indexOf('http') === 0) {
        signedUrl = rel;
      } else if (rel) {
        signedUrl = SUPABASE_URL + '/storage/v1' + (rel.charAt(0) === '/' ? rel : '/' + rel);
      }
    } else {
      Logger.log('Manual sign URL HTTP ' + signRes.getResponseCode() + ': ' + signRes.getContentText().slice(0, 200));
    }
  } catch(e) { Logger.log('Sign URL err: ' + e); }
  if (!signedUrl) signedUrl = path;

  var confPayload = {
    order_no: orderNo,
    user_id: data.userId || null,
    claimed_amount: data.total,
    method: (data.method === 'paypay') ? 'paypay' : 'bank_transfer',               // FIX 2026-05-07: dynamic theo khách chọn
    screenshot_url: signedUrl,
    screenshot_hash: 'manual-' + orderNo + '-' + ts,                               // FIX: schema NOT NULL — was MISSING entirely → INSERT double-fail
    file_size: bytes.length,                                                       // FIX: column exists
    note: 'Manual review requested. AI verify failed ' + (data.verify_fail_count || 0) + ' time(s). Admin to inspect.',
    status: 'submitted',                                                           // FIX: manual flow stays 'submitted' until admin acts
    ai_match: false
    // REMOVED: ai_status — column doesn't exist
  };
  var confRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/payment_confirmations', {
    method: 'post',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    payload: JSON.stringify(confPayload),
    muteHttpExceptions: true
  });
  // FIX 2026-05-06 (Bug E): Log full response body khi HTTP fail de debug.
  var confCode = confRes.getResponseCode();
  if (confCode >= 300) {
    Logger.log('Save manual payment_confirmation FAIL HTTP ' + confCode + ': ' + confRes.getContentText().slice(0, 500));
  } else {
    Logger.log('Save manual payment_confirmation OK HTTP ' + confCode + ' (submitted, signed URL: ' + signedUrl.slice(0, 80) + ')');
  }
}

// ============================================================
// AI VERIFY FAIL TRACKING (2026-05-07 — Bug K)
// Khi AI verify fail, log vao ai_verify_attempts table de admin xem
// trong tab "📋 Check thủ công" tren /thuythang.
// Bao gom: customer info, cart, AI fail reason, receipt screenshot URL.
// ============================================================
function logAIFailureToSupabase_(data, verifyRes) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  if (!data || !verifyRes) return;

  // 1) Upload receipt image to payment-proofs/ai-fail/ folder
  // FIX 2026-05-07: Use PUBLIC URL pattern (bucket payment-proofs đã PUBLIC).
  // Đơn giản hơn signed URL, không bao giờ expire, không có URL token issues.
  var receiptUrl = '';
  var receiptPath = '';
  if (data.receipt_base64) {
    try {
      var ts = Date.now();
      var ext = 'jpg';
      if (data.receipt_mime === 'image/png') ext = 'png';
      else if (data.receipt_mime === 'image/webp') ext = 'webp';
      // Sanitize email/phone cho path: chỉ giữ alphanum (avoid path encoding issues)
      var idStr = (data.email || data.phone || 'guest').replace(/[^a-zA-Z0-9]/g, '');
      receiptPath = 'ai-fail/' + ts + '-' + idStr + '.' + ext;
      var bytes = Utilities.base64Decode(data.receipt_base64);
      var uploadUrl = SUPABASE_URL + '/storage/v1/object/payment-proofs/' + encodeURIComponent(receiptPath);
      var upRes = UrlFetchApp.fetch(uploadUrl, {
        method: 'post',
        headers: {
          'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
          'Content-Type': data.receipt_mime || 'image/jpeg',
          'x-upsert': 'true'
        },
        payload: bytes,
        muteHttpExceptions: true
      });
      if (upRes.getResponseCode() < 300) {
        // Public URL — bucket payment-proofs đã PUBLIC (no token, no expiry)
        receiptUrl = SUPABASE_URL + '/storage/v1/object/public/payment-proofs/' + encodeURIComponent(receiptPath);
        Logger.log('AI-fail receipt uploaded OK: ' + receiptPath);
      } else {
        Logger.log('AI-fail receipt upload FAIL HTTP ' + upRes.getResponseCode() + ': ' + upRes.getContentText().slice(0, 300));
      }
    } catch (ue) { Logger.log('AI-fail receipt upload err: ' + ue); }
  }

  // 2) Insert row into ai_verify_attempts
  var payload = {
    customer_name:      data.name || null,
    customer_email:     data.email || null,
    customer_phone:     data.phone || null,
    customer_address:   ((data.postal || '') + ' ' + (data.prefecture || '') + ' ' + (data.address || '')).trim() || null,
    user_id:            data.userId || null,
    claimed_amount:     Number(data.total || 0),
    cart_items:         data.cartItems || [],
    ai_fail_reason:     verifyRes.reason || 'unknown',
    ai_detected_amount: verifyRes.detected_amount ? Number(verifyRes.detected_amount) : null,
    ai_raw_text:        (verifyRes.raw_text || '').slice(0, 5000),  // truncate to 5KB
    ai_checks:          verifyRes.checks || {},
    receipt_url:        receiptUrl || null,
    receipt_path:       receiptPath || null,
    receipt_mime:       data.receipt_mime || null,
    status:             'pending'
  };

  var insertRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/ai_verify_attempts', {
    method: 'post',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = insertRes.getResponseCode();
  if (code >= 300) {
    Logger.log('Log AI fail FAIL HTTP ' + code + ': ' + insertRes.getContentText().slice(0, 500));
  } else {
    Logger.log('Log AI fail OK HTTP ' + code + ' (customer: ' + (data.email || data.phone || 'guest') + ', amount: ¥' + data.total + ')');
  }
}

// ============================================================
// SAVE PAYMENT PROOF FOR ADMIN-RESOLVED AI ATTEMPT (2026-05-07)
// Admin click "Tạo đơn thủ công" → reuse receipt_url đã có sẵn từ
// ai_verify_attempts row. KHÔNG re-upload, chỉ insert payment_confirmations
// row pointing tới existing storage path.
// ============================================================
function savePaymentProofForAdminResolved_(orderNo, data) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  if (!data.receipt_url && !data.receipt_path) {
    Logger.log('No receipt_url/path for admin-resolved order ' + orderNo);
    return;
  }

  var ts = Date.now();
  // Prefer public URL (bucket public, no expiry)
  var screenshotUrl = data.receipt_url;
  if (!screenshotUrl && data.receipt_path) {
    screenshotUrl = SUPABASE_URL + '/storage/v1/object/public/payment-proofs/' + encodeURIComponent(data.receipt_path);
  }

  var confPayload = {
    order_no: orderNo,
    user_id: data.userId || null,
    claimed_amount: Number(data.total || 0),
    method: (data.method === 'paypay') ? 'paypay' : 'bank_transfer',  // FIX 2026-05-07: dynamic
    screenshot_url: screenshotUrl,
    screenshot_hash: 'admin-' + orderNo + '-' + ts,
    note: 'Admin verified manually (AI verify failed). ' + (data.admin_email || ''),
    status: 'verified',
    admin_confirmer: data.admin_email || 'admin',
    admin_confirmed_at: new Date().toISOString(),
    admin_action: 'confirmed',
    ai_match: false,
    ai_verified_at: new Date().toISOString()
  };

  try {
    var confRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/payment_confirmations', {
      method: 'post',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      payload: JSON.stringify(confPayload),
      muteHttpExceptions: true
    });
    var code = confRes.getResponseCode();
    if (code >= 300) {
      Logger.log('Save admin payment_confirmation FAIL HTTP ' + code + ': ' + confRes.getContentText().slice(0, 500));
    } else {
      Logger.log('Save admin payment_confirmation OK HTTP ' + code + ' (verified by ' + data.admin_email + ')');
    }
  } catch (e) {
    Logger.log('savePaymentProofForAdminResolved_ err: ' + e);
  }
}

// Urgent Telegram alert when a customer submits a manual-review order.
// Distinct from sendTelegramNotification_ — uses ⚠️ urgency styling so admin
// notices immediately and confirms within the promised 24h window.
function sendManualReviewTelegramAlert_(orderNo, data) {
  var botToken = _prop('TELEGRAM_BOT_TOKEN', '');
  var chatId = _prop('TELEGRAM_CHAT_ID', '');
  if (!botToken || !chatId) return;

  var text = '⚠️ *URGENT — Đơn cần duyệt thủ công*\n\n' +
    '📦 Đơn: #' + orderNo + '\n' +
    '👤 ' + (data.name || 'Khách') + '\n' +
    '💵 ¥' + Number(data.total || 0).toLocaleString() + '\n' +
    '📞 ' + (data.phone || '') + '\n' +
    '🔄 AI verify thất bại ' + (data.verify_fail_count || 0) + ' lần\n' +
    '📝 Khách xác nhận đã pay → cần admin kiểm tra biên lai trong 24h\n\n' +
    '👉 [Mở Dashboard](https://www.thuyjapan.com/thuythang)';

  UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' }),
    muteHttpExceptions: true
  });
}

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
// ADMIN MANUAL APPROVE OVERRIDE
// ============================================================
// When AI verify rejects a legit bill (false negative), admin can force-approve.
// Required: confirmation_id OR (order_no + image_url), expected_amount, reason, admin_email.
// Side effects:
//   1) Patches payment_confirmations row: ai_status='manual_approved', ai_match=true,
//      manual_approver, manual_approve_reason, manual_approved_at.
//   2) Bumps orders.status from 'pending' → 'customer_paid' so it shows up in admin queue.
function forceApprovePayment_(data) {
  var sbUrl = _prop('SUPABASE_URL', '');
  var sbKey = _prop('SUPABASE_SERVICE_KEY', '');
  if (!sbUrl || !sbKey) return { ok: false, error: 'Supabase creds missing' };

  var reason = (data.reason || '').toString().slice(0, 500);
  var adminEmail = (data.admin_email || '').toString().slice(0, 200);
  if (!reason) return { ok: false, error: 'Missing reason' };
  if (!adminEmail) return { ok: false, error: 'Missing admin_email' };

  // Resolve confirmation_id (either supplied or look up by order_no + image_url).
  var confId = data.confirmation_id || null;
  if (!confId) {
    if (!data.order_no) return { ok: false, error: 'Missing confirmation_id and order_no' };
    var lookupUrl = sbUrl + '/rest/v1/payment_confirmations'
      + '?select=id,order_no'
      + '&order=created_at.desc&limit=1'
      + '&order_no=eq.' + encodeURIComponent(data.order_no);
    if (data.image_url) {
      lookupUrl += '&screenshot_url=eq.' + encodeURIComponent(data.image_url);
    }
    var lr = UrlFetchApp.fetch(lookupUrl, {
      headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey },
      muteHttpExceptions: true
    });
    if (lr.getResponseCode() !== 200) {
      return { ok: false, error: 'Lookup failed: HTTP ' + lr.getResponseCode() };
    }
    var rows = JSON.parse(lr.getContentText() || '[]');
    if (!rows.length) return { ok: false, error: 'No matching confirmation found' };
    confId = rows[0].id;
  }

  // Patch payment_confirmations: mark as manually approved + audit fields.
  var nowIso = new Date().toISOString();
  var expectedAmt = Number(data.expected_amount) || null;
  var patchBody = {
    ai_status: 'manual_approved',
    ai_match: true,
    ai_reason: 'Manual approve by ' + adminEmail + ': ' + reason,
    manual_approver: adminEmail,
    manual_approve_reason: reason,
    manual_approved_at: nowIso
  };
  if (expectedAmt) patchBody.ai_verified_amount = expectedAmt;

  var patchRes = UrlFetchApp.fetch(
    sbUrl + '/rest/v1/payment_confirmations?id=eq.' + encodeURIComponent(confId) + '&select=id,order_no',
    {
      method: 'patch',
      contentType: 'application/json',
      headers: {
        'apikey': sbKey,
        'Authorization': 'Bearer ' + sbKey,
        'Prefer': 'return=representation'
      },
      payload: JSON.stringify(patchBody),
      muteHttpExceptions: true
    }
  );
  if (patchRes.getResponseCode() >= 300) {
    return { ok: false, error: 'Patch failed: HTTP ' + patchRes.getResponseCode() + ' ' + patchRes.getContentText().slice(0, 200) };
  }
  var patched = JSON.parse(patchRes.getContentText() || '[]');
  var orderNo = (patched[0] && patched[0].order_no) || data.order_no || null;

  // Bump orders.status from 'pending' → 'customer_paid' so it shows up for admin to confirm payment.
  // Only flip if currently 'pending' (don't downgrade confirmed/shipped/delivered).
  if (orderNo) {
    try {
      var orderPatchUrl = sbUrl + '/rest/v1/orders'
        + '?order_no=eq.' + encodeURIComponent(orderNo)
        + '&status=eq.pending';
      UrlFetchApp.fetch(orderPatchUrl, {
        method: 'patch',
        contentType: 'application/json',
        headers: {
          'apikey': sbKey,
          'Authorization': 'Bearer ' + sbKey,
          'Prefer': 'return=minimal'
        },
        payload: JSON.stringify({ status: 'customer_paid' }),
        muteHttpExceptions: true
      });
    } catch (oe) {
      Logger.log('Order status bump err (non-fatal): ' + oe);
    }
  }

  Logger.log('Manual approve OK: conf #' + confId + ' order ' + orderNo + ' by ' + adminEmail);
  return { ok: true, confirmation_id: confId, order_no: orderNo };
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

function sendDailyProductionReport(fromDate, toDate, recipientOverride) {
  var sbUrl = _prop('SUPABASE_URL', '');
  var sbKey = _prop('SUPABASE_SERVICE_KEY', '');
  if (!sbUrl || !sbKey) { Logger.log('Supabase creds missing'); return null; }

  // Default to today (JST). Pass YYYY-MM-DD strings to override.
  var now = new Date();
  var jst = new Date(now.getTime() + 9 * 3600 * 1000);
  var todayStr = jst.toISOString().slice(0, 10);
  var fromStr = fromDate || todayStr;
  var toStr   = toDate   || todayStr;
  var fromIso = fromStr + 'T00:00:00+09:00';
  var toIso   = toStr   + 'T23:59:59+09:00';

  // Query PAID orders only (confirmed/shipped/delivered).
  // Excludes: cancelled, pending (chưa báo TT), customer_paid (chưa xác nhận TT).
  // Reason: production should only be planned for orders that are confirmed paid.
  var url = sbUrl + '/rest/v1/orders?select=order_no,items,status,total,customer_name,created_at'
          + '&status=in.(confirmed,shipped,delivered)'
          + '&created_at=gte.' + encodeURIComponent(fromIso)
          + '&created_at=lte.' + encodeURIComponent(toIso)
          + '&order=created_at.asc';
  var resp = UrlFetchApp.fetch(url, {
    headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    Logger.log('Production report fetch failed: ' + resp.getContentText().slice(0, 300));
    return null;
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

  var sendTo = recipientOverride || PRODUCTION_REPORT_EMAIL;
  MailApp.sendEmail({
    to: sendTo,
    subject: '🏭 Báo cáo sản xuất ' + rangeLabel + ' — ' + totalOrders + ' đơn (¥' + totalRevenue.toLocaleString() + ')',
    htmlBody: html
  });
  Logger.log('Production report sent to ' + sendTo + ' for ' + rangeLabel);
  return { totalOrders: totalOrders, totalRevenue: totalRevenue, rangeLabel: rangeLabel, recipient: sendTo };
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

// ============================================================
// CAMPAIGN EMAIL (bulk send)
// ============================================================
function sendCampaignEmail_(subject, bodyText, recipients) {
  var ok = 0, fail = 0;
  var bodyHtml = renderCampaignBodyHtml_(bodyText);
  var sender = 'Bếp Thuỷ Japan <support@thuyjapan.com>';
  for (var i = 0; i < recipients.length; i++) {
    var r = recipients[i];
    if (!r.email) { fail++; continue; }
    try {
      MailApp.sendEmail({
        to: r.email,
        replyTo: 'support@thuyjapan.com',
        name: 'Bếp Thuỷ Japan',
        subject: subject,
        htmlBody: bodyHtml.replace(/\{\{name\}\}/g, escapeHtml_(r.name || ''))
                          .replace(/\{\{email\}\}/g, escapeHtml_(r.email))
      });
      ok++;
      // Rate-limit: small pause every 20 to avoid Gmail flagging
      if (ok % 20 === 0) Utilities.sleep(1000);
    } catch (e) {
      fail++;
      Logger.log('Campaign send fail to ' + r.email + ': ' + e);
    }
  }
  Logger.log('Campaign sent: ok=' + ok + ' fail=' + fail);
  return { ok: ok, fail: fail };
}

function renderCampaignBodyHtml_(text) {
  // Wrap plain text in branded email shell. \n → <br>. Preserve simple HTML tags.
  var safe = String(text || '').replace(/\r\n/g, '\n');
  // If user already used HTML tags (<p>, <br>, <strong>, etc.), keep as-is
  var hasHtml = /<[a-z]+[\s>]/i.test(safe);
  var content = hasHtml ? safe : safe.replace(/\n/g, '<br>');
  return '<div style="font-family:-apple-system,Inter,Helvetica,sans-serif;background:#FFF8F0;padding:20px;color:#2C1A0E;">' +
    '<div style="max-width:600px;margin:0 auto;background:white;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(44,26,14,0.08);">' +
      '<div style="background:linear-gradient(135deg,#2C1A0E,#4A2C1A);color:white;padding:24px;text-align:center;">' +
        '<h2 style="margin:0;font-family:Georgia,serif;color:#F4CC54;font-size:24px;">Bếp Thuỷ Japan</h2>' +
        '<p style="margin:6px 0 0;font-size:11px;color:#FFF1D6;letter-spacing:2px;">✦ ĐẶC SẢN PHỐ CỔ HÀ NỘI ✦</p>' +
      '</div>' +
      '<div style="padding:28px 24px;font-size:15px;line-height:1.7;color:#2C1A0E;">' + content + '</div>' +
      '<div style="background:#FEF3C7;padding:16px;text-align:center;font-size:12px;color:#78350F;">' +
        '🌐 <a href="https://www.thuyjapan.com" style="color:#C8102E;text-decoration:none;font-weight:600;">thuyjapan.com</a> · ' +
        '📞 <a href="tel:+818051156688" style="color:#C8102E;text-decoration:none;">080-5115-6688</a> · ' +
        '✉️ <a href="mailto:support@thuyjapan.com" style="color:#C8102E;text-decoration:none;">support@thuyjapan.com</a>' +
      '</div>' +
    '</div></div>';
}

function escapeHtml_(s) {
  return String(s || '').replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; });
}

// ============================================================
// AUTO EMAILS ON ORDER STATE CHANGE
// ============================================================
function sendOrderConfirmedEmail_(data) {
  if (!data.email) { Logger.log('No customer email — skip'); return; }
  var html = '<div style="font-family:-apple-system,Inter,sans-serif;padding:20px;background:#FFF8F0;color:#2C1A0E;">' +
    '<div style="max-width:560px;margin:0 auto;background:white;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);">' +
      '<div style="background:linear-gradient(135deg,#10B981,#059669);color:white;padding:24px;text-align:center;">' +
        '<h2 style="margin:0;color:white;font-family:Georgia,serif;">✅ Đơn hàng đã xác nhận</h2>' +
        '<p style="margin:6px 0 0;font-size:13px;opacity:0.9;">Bếp Thuỷ Japan đã nhận thanh toán</p>' +
      '</div>' +
      '<div style="padding:24px;line-height:1.7;">' +
        '<p>Chào <strong>' + escapeHtml_(data.name || '') + '</strong>,</p>' +
        '<p>Bếp đã nhận được thanh toán cho đơn <strong style="color:#C8102E;">#' + escapeHtml_(data.orderNo) + '</strong> — số tiền <strong>¥' + Number(data.total || 0).toLocaleString() + '</strong>.</p>' +
        '<p>Chúng em đang chuẩn bị hàng và sẽ gửi đi trong vòng <strong>24-48 giờ</strong>. Khi gửi xong, anh/chị sẽ nhận thêm 1 email có mã vận đơn để theo dõi.</p>' +
        '<p style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:10px 14px;border-radius:6px;margin:16px 0;font-size:13px;">💡 Anh/chị có thể xem chi tiết đơn tại <a href="https://www.thuyjapan.com/thanh-vien" style="color:#C8102E;font-weight:600;">trang Thành Viên</a>.</p>' +
        '<p style="margin-top:20px;color:#6B7280;font-size:13px;">Cảm ơn anh/chị đã ủng hộ Bếp Thuỷ Japan! 🍜</p>' +
      '</div>' +
    '</div></div>';
  MailApp.sendEmail({
    to: data.email,
    replyTo: 'support@thuyjapan.com',
    name: 'Bếp Thuỷ Japan',
    subject: '✅ Đơn #' + data.orderNo + ' đã xác nhận thanh toán — Bếp Thuỷ Japan',
    htmlBody: html
  });
  Logger.log('Order confirmed email sent to ' + data.email);
}

function sendOrderShippedEmail_(data) {
  if (!data.email) { Logger.log('No customer email — skip'); return; }
  var trackingHtml = data.trackingNo
    ? '<p>📦 Mã vận đơn: <strong style="font-family:monospace;background:#F3F4F6;padding:4px 10px;border-radius:6px;">' + escapeHtml_(data.trackingNo) + '</strong></p>'
    : '';
  var carrierHtml = data.carrier
    ? '<p>🚚 Đơn vị: <strong>' + escapeHtml_(data.carrier) + '</strong></p>' : '';
  var html = '<div style="font-family:-apple-system,Inter,sans-serif;padding:20px;background:#FFF8F0;color:#2C1A0E;">' +
    '<div style="max-width:560px;margin:0 auto;background:white;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);">' +
      '<div style="background:linear-gradient(135deg,#3B82F6,#1D4ED8);color:white;padding:24px;text-align:center;">' +
        '<h2 style="margin:0;color:white;font-family:Georgia,serif;">🚚 Đơn hàng đã gửi đi!</h2>' +
        '<p style="margin:6px 0 0;font-size:13px;opacity:0.9;">Bếp Thuỷ Japan đã giao cho đơn vị vận chuyển</p>' +
      '</div>' +
      '<div style="padding:24px;line-height:1.7;">' +
        '<p>Chào <strong>' + escapeHtml_(data.name || '') + '</strong>,</p>' +
        '<p>Đơn <strong style="color:#C8102E;">#' + escapeHtml_(data.orderNo) + '</strong> đã được gửi đi rồi nhé!</p>' +
        carrierHtml + trackingHtml +
        '<p>Dự kiến nhận hàng: <strong>1-3 ngày</strong> tùy khu vực. Hàng đông lạnh, anh/chị nhớ kiểm tra tủ lạnh / cấp đông ngay sau khi nhận để giữ tươi.</p>' +
        '<p style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:10px 14px;border-radius:6px;margin:16px 0;font-size:13px;">📋 Cách bảo quản chi tiết: <a href="https://www.thuyjapan.com/huong-dan-bao-quan" style="color:#C8102E;font-weight:600;">xem hướng dẫn</a></p>' +
        '<p style="margin-top:20px;color:#6B7280;font-size:13px;">Cảm ơn anh/chị đã ủng hộ Bếp Thuỷ! Chúc anh/chị bữa ăn ngon miệng. 🍜</p>' +
      '</div>' +
    '</div></div>';
  MailApp.sendEmail({
    to: data.email,
    replyTo: 'support@thuyjapan.com',
    name: 'Bếp Thuỷ Japan',
    subject: '🚚 Đơn #' + data.orderNo + ' đã gửi đi — Bếp Thuỷ Japan',
    htmlBody: html
  });
  Logger.log('Order shipped email sent to ' + data.email);
}

// Urgent admin email when a customer submits a manual-review order via the
// "📋 Gửi cho admin xem" fallback. Mirrors sendManualReviewTelegramAlert_ on
// the email channel so admin still notices when offline from Telegram.
// Rate-limit: max 1 email per order_no (CacheService, 24h TTL) — re-submits
// of the same order_no won't spam.
function sendManualReviewEmailToAdmin_(orderData) {
  if (!orderData || !orderData.orderNo) { Logger.log('sendManualReviewEmailToAdmin_: missing orderNo'); return; }

  // Dedupe: only one email per order_no per 24h
  try {
    var cache = CacheService.getScriptCache();
    var cacheKey = 'mr_email_sent_' + orderData.orderNo;
    if (cache.get(cacheKey)) {
      Logger.log('Manual review email already sent for ' + orderData.orderNo + ' — skip');
      return;
    }
    cache.put(cacheKey, '1', 86400); // 24h
  } catch (ce) { Logger.log('Cache dedupe err (continuing): ' + ce); }

  var adminEmail = _prop('PRODUCTION_REPORT_EMAIL', PRODUCTION_REPORT_EMAIL || 'support@thuyjapan.com');
  var subject = '🚨 Đơn cần xem xét — #' + orderData.orderNo + ' · ¥' + Number(orderData.total || 0).toLocaleString();
  var body = buildManualReviewEmailHtml_(orderData);

  try {
    MailApp.sendEmail({
      to: adminEmail,
      replyTo: 'support@thuyjapan.com',
      name: 'Bếp Thuỷ Japan System',
      subject: subject,
      htmlBody: body
    });
    Logger.log('Manual review email sent to ' + adminEmail + ' for order #' + orderData.orderNo);
  } catch (e) {
    Logger.log('Email err: ' + e);
  }
}

// Build the HTML body for the manual-review admin alert email.
// Matches the email-admin-review-needed.html template structure (red-tone alert,
// customer info, order details, AI fail reason, bill thumbnail, CTA buttons).
function buildManualReviewEmailHtml_(d) {
  var orderNo = escapeHtml_(d.orderNo);
  var amount = Number(d.total || 0).toLocaleString();
  var customerName = escapeHtml_(d.name || 'Khách');
  var customerEmail = escapeHtml_(d.email || '');
  var customerPhone = escapeHtml_(d.phone || '');
  var shipAddress = escapeHtml_(d.ship_address || '');
  var aiLayerFailed = escapeHtml_(d.ai_layer_failed || '');
  var aiReason = escapeHtml_(d.ai_reason || '');
  var createdAt = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'dd/MM/yyyy HH:mm');

  // Build items list as readable HTML
  var itemsHtml = '';
  if (Array.isArray(d.cartItems) && d.cartItems.length) {
    // Use size string ("2 hộp", "0.5kg") which already encodes total quantity.
    // Avoids "× 1" confusion for byBox products (cart normalized to qty=1).
    itemsHtml = d.cartItems.map(function(it) {
      var nm = escapeHtml_(it.name || '');
      var sz = escapeHtml_(it.size || '');
      return '• ' + nm + (sz ? ' — ' + sz : '');
    }).join('<br>');
  } else {
    itemsHtml = '(không có chi tiết)';
  }

  // Generate signed Storage URL (24h TTL) for the bill image so admin can view
  // even if bucket is private. Falls back to public URL pattern if signing fails.
  var billUrl = '';
  try {
    billUrl = generateSignedReceiptUrlForOrder_(d.orderNo, 86400) || '';
  } catch (su) { Logger.log('Signed URL err: ' + su); }
  if (!billUrl) {
    // Fallback: blank placeholder; admin will open /thuythang to see it
    billUrl = 'https://www.thuyjapan.com/thuythang';
  }

  var adminLink = 'https://www.thuyjapan.com/thuythang';
  var customerContactLink = d.email ? ('mailto:' + d.email) : adminLink;

  return '' +
'<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Bếp Thuỷ — Đơn cần admin xem xét #' + orderNo + '</title></head>' +
'<body style="margin:0;padding:0;background:#FEF2F2;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">' +
'<div style="display:none;font-size:1px;color:#FEF2F2;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Khách ' + customerName + ' đã thanh toán nhưng AI verify thất bại — cần anh xem</div>' +
'<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#FEF2F2;"><tr><td align="center" style="padding:20px 10px;">' +
'<table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px;width:100%;background:white;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);">' +
// Header
'<tr><td style="background:#7F1D1D;background:linear-gradient(135deg,#7F1D1D 0%,#B91C1C 50%,#DC2626 100%);padding:28px 24px;text-align:center;">' +
'<div style="font-size:42px;line-height:1;margin-bottom:6px;">🚨</div>' +
'<h1 style="color:#ffffff;margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;letter-spacing:0.5px;">ĐƠN CẦN ADMIN XEM XÉT</h1>' +
'<p style="color:#FECACA;margin:6px 0 0;font-size:13px;">AI verify thất bại — cần anh check tay</p></td></tr>' +
// Order ID
'<tr><td style="padding:24px 24px 8px;text-align:center;">' +
'<p style="margin:0;color:#6B7280;font-size:13px;">Mã đơn</p>' +
'<h2 style="color:#DC2626;margin:4px 0 0;font-size:24px;font-weight:bold;letter-spacing:0.5px;">#' + orderNo + '</h2>' +
'<p style="margin:8px 0 0;color:#1F2937;font-size:18px;"><strong>¥' + amount + '</strong></p>' +
'<div style="width:60px;height:3px;background:linear-gradient(90deg,#DC2626,#FCA5A5,#DC2626);margin:14px auto 0;border-radius:2px;"></div></td></tr>' +
// Intro
'<tr><td style="padding:20px 24px 0;color:#1F2937;font-size:15px;line-height:1.7;">' +
'<p style="margin:0 0 14px;"><strong>Anh ơi,</strong></p>' +
'<p style="margin:0 0 18px;">Có 1 đơn vừa được khách gửi qua nút <strong>"📋 Gửi bill cho Thuỷ xem"</strong> — AI verify đã thất bại nhưng khách báo đã thanh toán bằng <strong>' + (data.method === 'paypay' ? 'PayPay' : 'chuyển khoản ngân hàng') + '</strong> rồi. Cần anh vào xem và xử lý tay.</p></td></tr>' +
// Customer info
'<tr><td style="padding:0 24px 16px;">' +
'<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#F9FAFB;border-radius:10px;border:1px solid #E5E7EB;"><tr><td style="padding:18px 20px;">' +
'<h3 style="color:#1F2937;margin:0 0 12px;font-size:15px;font-weight:bold;">👤 Thông tin khách</h3>' +
'<p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#1F2937;"><span style="color:#6B7280;display:inline-block;width:60px;">Tên:</span> <strong>' + customerName + '</strong></p>' +
'<p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#1F2937;"><span style="color:#6B7280;display:inline-block;width:60px;">Email:</span> <a href="mailto:' + customerEmail + '" style="color:#C8102E;text-decoration:none;">' + customerEmail + '</a></p>' +
'<p style="margin:0;font-size:14px;line-height:1.6;color:#1F2937;"><span style="color:#6B7280;display:inline-block;width:60px;">Phone:</span> <strong>' + customerPhone + '</strong></p>' +
'</td></tr></table></td></tr>' +
// Order info
'<tr><td style="padding:0 24px 16px;">' +
'<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#FFFBEB;border-radius:10px;border:1px solid #FDE68A;"><tr><td style="padding:18px 20px;">' +
'<h3 style="color:#78350F;margin:0 0 12px;font-size:15px;font-weight:bold;">📦 Chi tiết đơn</h3>' +
'<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#1F2937;"><strong style="color:#6B7280;">Items:</strong><br><span style="display:block;padding:6px 0 0 8px;color:#1F2937;">' + itemsHtml + '</span></p>' +
'<p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#1F2937;border-top:1px dashed #FDE68A;padding-top:8px;"><strong style="color:#6B7280;">Tổng tiền:</strong> <strong style="color:#DC2626;font-size:16px;">¥' + amount + '</strong></p>' +
'<p style="margin:6px 0 0;font-size:14px;line-height:1.6;color:#1F2937;"><strong style="color:#6B7280;">Ship đến:</strong><br><span style="display:block;padding:4px 0 0 8px;color:#1F2937;">' + shipAddress + '</span></p>' +
'</td></tr></table></td></tr>' +
// AI fail box
'<tr><td style="padding:0 24px 16px;">' +
'<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#FEE2E2;border-radius:10px;border:1px solid #FCA5A5;"><tr><td style="padding:18px 20px;border-left:4px solid #DC2626;">' +
'<h3 style="color:#7F1D1D;margin:0 0 10px;font-size:15px;font-weight:bold;">🤖 AI Verify thất bại</h3>' +
'<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#1F2937;"><strong style="color:#6B7280;">Layer fail:</strong> <strong style="color:#DC2626;">' + aiLayerFailed + '</strong></p>' +
'<p style="margin:0;font-size:14px;line-height:1.6;color:#1F2937;"><strong style="color:#6B7280;">Lý do:</strong><br><span style="display:block;padding:6px 10px;margin-top:4px;background:#ffffff;border-radius:6px;color:#7F1D1D;font-style:italic;">' + aiReason + '</span></p>' +
'</td></tr></table></td></tr>' +
// Bill thumbnail (only if signed URL succeeded)
'<tr><td style="padding:0 24px 20px;">' +
'<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#F9FAFB;border-radius:10px;border:1px solid #E5E7EB;"><tr><td style="padding:18px 20px;text-align:center;">' +
'<h3 style="color:#1F2937;margin:0 0 12px;font-size:15px;font-weight:bold;">🧾 Ảnh bill khách gửi</h3>' +
'<a href="' + billUrl + '" target="_blank" style="display:inline-block;text-decoration:none;">' +
'<img src="' + billUrl + '" alt="Bill PayPay khách gửi" width="240" style="display:block;max-width:240px;width:100%;height:auto;border-radius:8px;border:2px solid #E5E7EB;margin:0 auto;"></a>' +
'<p style="margin:10px 0 0;font-size:12px;color:#6B7280;">👆 Click ảnh để xem full size (link có hiệu lực 24h)</p>' +
'</td></tr></table></td></tr>' +
// CTAs
'<tr><td style="padding:0 24px 12px;">' +
'<h3 style="color:#1F2937;margin:0 0 14px;font-size:16px;font-weight:bold;text-align:center;">⚡ Hành động nhanh</h3>' +
'<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-bottom:10px;"><tr><td align="center">' +
'<a href="' + adminLink + '" target="_blank" style="display:block;background:#DC2626;color:#ffffff;text-decoration:none;padding:14px 20px;border-radius:10px;font-size:15px;font-weight:bold;text-align:center;">✅ Xem ngay trong /thuythang</a>' +
'</td></tr></table>' +
'<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-bottom:10px;"><tr><td align="center">' +
'<a href="' + customerContactLink + '" target="_blank" style="display:block;background:#F59E0B;color:#ffffff;text-decoration:none;padding:14px 20px;border-radius:10px;font-size:15px;font-weight:bold;text-align:center;">💬 Hỏi khách thêm</a>' +
'</td></tr></table>' +
'<p style="margin:0 0 4px;font-size:12px;color:#6B7280;text-align:center;line-height:1.5;">Để từ chối: vào <strong>/thuythang</strong> → tab <strong>Đơn</strong> → mở đơn #' + orderNo + ' → bấm <strong>"Từ chối"</strong> + ghi lý do</p>' +
'</td></tr>' +
// Tip
'<tr><td style="padding:18px 24px 20px;">' +
'<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#FEF3C7;border-radius:10px;"><tr><td style="border-left:4px solid #D4A017;padding:14px 18px;">' +
'<p style="margin:0;color:#78350F;font-size:13px;line-height:1.6;">💡 <strong>Lưu ý:</strong> Khách đã được báo "đơn đang chờ xác nhận trong vòng 24h". Anh nên xử lý sớm để khách đỡ lo. Nếu bill đúng → bấm Xác nhận, đơn sẽ chuyển sang trạng thái <em>paid</em> và auto gửi email cảm ơn cho khách.</p>' +
'</td></tr></table></td></tr>' +
// Footer
'<tr><td style="background:#1F2937;padding:20px 24px;text-align:center;">' +
'<p style="color:#FCA5A5;margin:0 0 4px;font-weight:bold;font-size:13px;">🔒 Email nội bộ admin</p>' +
'<p style="color:#9CA3AF;margin:0;font-size:11px;">Chỉ gửi cho support@thuyjapan.com — không forward cho khách</p>' +
'<p style="color:#9CA3AF;margin:10px 0 0;font-size:11px;">Đơn được tạo lúc: <strong style="color:#D4A017;">' + createdAt + '</strong></p>' +
'<p style="color:#9CA3AF;margin:8px 0 0;font-size:11px;">' +
'<a href="https://www.thuyjapan.com/thuythang" style="color:#D4A017;text-decoration:none;">/thuythang admin</a> &nbsp;·&nbsp; ' +
'<a href="https://zalo.me/+818051156688" style="color:#D4A017;text-decoration:none;">Zalo</a> &nbsp;·&nbsp; ' +
'<a href="https://m.me/ThuyJapaan" style="color:#D4A017;text-decoration:none;">Messenger</a></p>' +
'</td></tr>' +
'</table></td></tr></table></body></html>';
}

// Generate a 24h-signed URL to the most recent receipt for an order in
// the payment-proofs Storage bucket. Returns null on any failure (caller
// should fall back to public URL or admin dashboard link).
function generateSignedReceiptUrlForOrder_(orderNo, expiresInSec) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;

  // 1. Find the latest payment_confirmations row for this order_no to get URL.
  // FIX 2026-05-06: Schema column is `screenshot_url`, NOT `image_url`. Trước đó
  // SELECT trả về 0 row vì query sai column → luôn return null → Telegram alert
  // + admin modal fallback đều thiếu bill URL. Sửa thành screenshot_url.
  try {
    var listUrl = SUPABASE_URL + '/rest/v1/payment_confirmations'
      + '?select=screenshot_url&order_no=eq.' + encodeURIComponent(orderNo)
      + '&order=created_at.desc&limit=1';
    var listRes = UrlFetchApp.fetch(listUrl, {
      method: 'get',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY
      },
      muteHttpExceptions: true
    });
    if (listRes.getResponseCode() >= 300) return null;
    var rows = JSON.parse(listRes.getContentText() || '[]');
    if (!rows.length || !rows[0].screenshot_url) return null;

    // Extract path inside bucket. screenshot_url có thể là:
    //  (a) Signed URL: {SUPABASE_URL}/storage/v1/object/sign/payment-proofs/{path}?token=...
    //  (b) Public URL: {SUPABASE_URL}/storage/v1/object/public/payment-proofs/{path}
    //  (c) Bare path: 'auto/BTJ-0149-1730000.jpg' (fallback nếu sign fail)
    var imageUrl = rows[0].screenshot_url;
    var signMarker = '/storage/v1/object/sign/payment-proofs/';
    var pubMarker = '/storage/v1/object/public/payment-proofs/';
    var bucketPath = null;
    var sIdx = imageUrl.indexOf(signMarker);
    var pIdx = imageUrl.indexOf(pubMarker);
    if (sIdx !== -1) {
      // Signed URL → strip query string + extract path
      var afterMarker = imageUrl.substring(sIdx + signMarker.length);
      var qIdx = afterMarker.indexOf('?');
      bucketPath = decodeURIComponent(qIdx === -1 ? afterMarker : afterMarker.substring(0, qIdx));
    } else if (pIdx !== -1) {
      bucketPath = decodeURIComponent(imageUrl.substring(pIdx + pubMarker.length));
    } else if (imageUrl.indexOf('http') !== 0) {
      // Bare path (case c)
      bucketPath = imageUrl;
    } else {
      return imageUrl; // unknown URL pattern, return as-is
    }

    // 2. Request signed URL from Supabase Storage
    var signRes = UrlFetchApp.fetch(SUPABASE_URL + '/storage/v1/object/sign/payment-proofs/' + encodeURIComponent(bucketPath), {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({ expiresIn: Number(expiresInSec) || 86400 }),
      muteHttpExceptions: true
    });
    if (signRes.getResponseCode() >= 300) return imageUrl; // fall back to public
    var signed = JSON.parse(signRes.getContentText() || '{}');
    if (!signed.signedURL) return imageUrl;
    // Supabase returns a relative path like "/object/sign/...?token=..."
    var rel = String(signed.signedURL);
    if (rel.indexOf('http') === 0) return rel;
    return SUPABASE_URL + '/storage/v1' + (rel.charAt(0) === '/' ? rel : '/' + rel);
  } catch (e) {
    Logger.log('generateSignedReceiptUrlForOrder_ err: ' + e);
    return null;
  }
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

// FIX 2026-05-09 (Bug -100 điểm — Fix B): generic admin alert helper.
// Dùng cho cảnh báo bất thường (race condition, anomaly, etc.) — không phải
// thông báo đơn hàng thường. Gửi free text Telegram cho admin.
function sendTelegramAlertAdmin_(message) {
  var botToken = _prop('TELEGRAM_BOT_TOKEN', '');
  var chatId = _prop('TELEGRAM_CHAT_ID', '');
  if (!botToken || !chatId) return;
  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chatId, text: String(message).slice(0, 3500) }),
      muteHttpExceptions: true
    });
  } catch (e) { Logger.log('[sendTelegramAlertAdmin_] err: ' + e); }
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
    status: data.status || 'pending', // Option B uses 'customer_paid' when verified at checkout
    note:          data.note || '',
    delivery_time: data.deliveryTime || '',
    // FIX 2026-05-09: Defensive — set created_at explicit. DB cũng có DEFAULT now()
    // (sau migration supabase-fix-orders-created-at.sql) nhưng set ở đây luôn để
    // không bao giờ bị NULL (đã gặp bug với đơn 0206).
    created_at: new Date().toISOString()
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

  // FIX 2026-05-07: Log full response body khi HTTP fail để debug.
  // Trước đó silent fail (chỉ log status code) → không biết constraint reject.
  var code = res.getResponseCode();
  if (code >= 300) {
    Logger.log('[saveOrderToSupabase] FAIL HTTP ' + code + ' for ' + orderNo + ' status=' + payload.status + ': ' + res.getContentText().slice(0, 600));
  } else {
    Logger.log('[saveOrderToSupabase] OK HTTP ' + code + ' #' + orderNo + ' status=' + payload.status);
  }
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

  // FIX 2026-05-09 (Bug -100 điểm — Fix B): Check balance trước khi deduct.
  // Race condition: khách mở 2 tab cùng lúc → mỗi tab thấy balance=100 → cả 2
  // submit dùng 100 điểm → tab 1 trừ OK → tab 2 trừ → balance âm.
  // Backend defense: query points_balance VIEW. Nếu không đủ → SKIP deduct +
  // Telegram alert cho admin. Không reject order (khách đã thanh toán) — admin
  // manually adjust nếu cần.
  try {
    var balUrl = SUPABASE_URL + '/rest/v1/points_balance?user_id=eq.' + encodeURIComponent(userId) + '&select=total_points';
    var balRes = UrlFetchApp.fetch(balUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY
      },
      muteHttpExceptions: true
    });
    if (balRes.getResponseCode() === 200) {
      var rows = JSON.parse(balRes.getContentText());
      var currentBalance = (rows && rows[0]) ? Number(rows[0].total_points) : 0;
      if (currentBalance < pointsUsed) {
        Logger.log('[deductPoints] WARN: balance ' + currentBalance + ' < pointsUsed ' + pointsUsed +
                   ' for user ' + userId + ' #' + orderNo + ' — SKIP deduct + alert admin');
        // Telegram alert admin
        try {
          sendTelegramAlertAdmin_(
            '⚠️ POINTS BALANCE INSUFFICIENT\n' +
            'User: ' + userId.substring(0,8) + '...\n' +
            'Order: #' + orderNo + '\n' +
            'Current balance: ' + currentBalance + '\n' +
            'Requested deduct: ' + pointsUsed + '\n' +
            'Action: SKIPPED deduct (race condition? 2 tabs?)\n' +
            'Admin: kiểm tra DB + adjust manually nếu cần'
          );
        } catch(tge) { Logger.log('[deductPoints] TG alert err: ' + tge); }
        return; // SKIP — không insert deduct âm
      }
    }
  } catch (be) {
    Logger.log('[deductPoints] balance check err (continue with deduct): ' + be);
    // Continue — defensive nhưng không block (nếu balance check fail vì network thì
    // vẫn cho deduct như trước, để khách không bị mất điểm khi balance check chỉ
    // tạm thời unavailable).
  }

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

/**
 * Lay bonus_token tu Supabase profiles cho mot userId cu the.
 * Return string token hoac null neu userId null/khong tim thay.
 */
function getBonusToken_(userId) {
  if (!userId) return null;
  try {
    var url = SUPABASE_URL + '/rest/v1/profiles?id=eq.' + encodeURIComponent(userId) + '&select=bonus_token&limit=1';
    var res = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY
      },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return null;
    var rows = JSON.parse(res.getContentText());
    if (!rows || !rows.length) return null;
    return rows[0].bonus_token || null;
  } catch (e) {
    Logger.log('getBonusToken_ err: ' + e);
    return null;
  }
}

function addToGetResponse(email, name, phone, prefecture, source, bonusToken) {
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
  // Push bonus_token neu co custom field ID va token hop le
  if (GR_CF_BONUS_TOKEN && bonusToken) {
    customFields.push({ customFieldId: GR_CF_BONUS_TOKEN, value: [String(bonusToken)] });
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

// ============================================================
// ADD_TO_EXISTING_ORDER HELPER (2026-05-09 V2 — recalc shipping)
// Gọi Supabase RPC add_to_existing_order để tạo đơn con.
//
// Params:
//   parentOrderNo   {string}  order_no đơn cha (e.g. "0123")
//   newItems        {Array}   cart items đơn con
//   newTotal        {number}  tổng tiền items (KHÔNG gồm ship delta)
//   userId          {string}  UUID khách (RPC verify owner)
//   shipFeeDelta    {number}  phí ship phụ thu (max(0, newShip - parentShip))
//                             0 = ship miễn (weight chưa vượt mức cũ)
//                             >0 = phụ thu phần chênh lệch
//
// Returns: { ok: true, order_no, amount, ship_fee_delta } hoặc { ok: false, error }
// ============================================================
function addToExistingOrder_(parentOrderNo, newItems, newTotal, userId, shipFeeDelta) {
  try {
    // RPC signature V2 (2026-05-09):
    //   add_to_existing_order(p_parent, p_user_id, p_items, p_total, p_ship_fee_delta)
    // Apps Script gọi qua service_role key → auth.uid() return NULL → pass p_user_id.
    var rpcUrl = SUPABASE_URL + '/rest/v1/rpc/add_to_existing_order';
    var rpcPayload = {
      p_parent: parentOrderNo,
      p_user_id: userId,
      p_items: newItems,
      p_total: newTotal,
      p_ship_fee_delta: shipFeeDelta || 0
    };

    var res = UrlFetchApp.fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      payload: JSON.stringify(rpcPayload),
      muteHttpExceptions: true
    });

    var httpCode = res.getResponseCode();
    var body;
    try { body = JSON.parse(res.getContentText()); } catch (pe) { body = null; }

    if (httpCode !== 200 || !body) {
      var rawErr = res.getContentText().slice(0, 300);
      Logger.log('addToExistingOrder_ RPC HTTP ' + httpCode + ': ' + rawErr);
      return { ok: false, error: 'rpc_error' };
    }

    // RPC returns jsonb — Apps Script REST wraps it: body may be the object directly
    var result = Array.isArray(body) ? body[0] : body;

    if (!result || result.ok === false) {
      var errCode = (result && result.error) ? result.error : 'rpc_unknown_error';
      Logger.log('addToExistingOrder_ RPC logic err: ' + errCode);
      return { ok: false, error: errCode };
    }

    Logger.log('addToExistingOrder_ success: child=' + result.order_no + ' parent=' + parentOrderNo);

    // TODO: update Yamato sheet (Phase 4 — Agent E)
    // Agent E sẽ: tìm row parent trong YAMATO_SHEET → gộp items đơn con vào cell items
    // hoặc tạo row riêng với link về parent. Không implement ở đây.

    // TODO: send merge confirmation email (Phase 4 — Agent E)
    // Nội dung: "Đã thêm món X+Y vào đơn #<parent>. Tổng đơn gộp ¥XXXX."
    // Dùng MailApp.sendEmail giống sendOrderShippedEmail_ pattern.

    return { ok: true, order_no: result.order_no, amount: result.amount };

  } catch (e) {
    Logger.log('addToExistingOrder_ exception: ' + e);
    return { ok: false, error: 'internal_error' };
  }
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
    MailApp.sendEmail(ADMIN_EMAIL, subject, '', {
      htmlBody : htmlBody,
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
    // byBox: cart stores wt = boxCount * 0.5; box count = qty * wt / 0.5
    // kg: total kg = qty * wt
    const amount = mapped.byBox ? (item.qty * item.wt / 0.5) : (item.qty * item.wt);
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

// ---- Tu dong tru ton kho qua Supabase RPC deduct_stock_for_order ----
// cartItems: [{ name: "[GT] Giò có tiêu", wt: 1.0, qty: 1, ... }, ...]
// kg products: amount = wt (kg). Box products (Nem, Pte): amount = wt/0.5 (so hop/tui)
function deductStockForOrder_(cartItems) {
  if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) return;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    Logger.log('Skip deduct stock: missing Supabase config');
    return;
  }

  // Aggregate per product code (in case same product appears twice in cart)
  var totals = {};
  cartItems.forEach(function(item) {
    var match = (item.name || '').match(/^\[([^\]]+)\]/);
    if (!match) return;
    var code = match[1];
    var mapped = CODE_MAP[code];
    if (!mapped) return;
    var wt = Number(item.wt) || 0;
    if (wt <= 0) return;
    // byBox products store wt = boxCount * 0.5; convert back to box count
    var amount = mapped.byBox ? (wt / 0.5) : wt;
    totals[code] = (totals[code] || 0) + amount;
  });

  var items = Object.keys(totals).map(function(code) {
    return { code: code, amount: totals[code] };
  });
  if (items.length === 0) return;

  try {
    var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/deduct_stock_for_order', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      payload: JSON.stringify({ p_items: items }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var body = res.getContentText();
    Logger.log('deduct_stock_for_order HTTP ' + code + ' - ' + body.substring(0, 300));
    if (code >= 300) return;

    // Warn admin via Telegram if any product hit 0 or went negative
    try {
      var results = JSON.parse(body);
      if (Array.isArray(results)) {
        var alerts = results.filter(function(r) { return r.remaining != null && Number(r.remaining) <= 0; });
        if (alerts.length > 0) sendStockAlertTelegram_(alerts);
      }
    } catch(pe) {}
  } catch(e) {
    Logger.log('deduct_stock_for_order err: ' + e);
  }
}

// ---- Telegram canh bao khi ton kho cham/vuot 0 ----
function sendStockAlertTelegram_(alerts) {
  var botToken = _prop('TELEGRAM_BOT_TOKEN', '');
  var chatId = _prop('TELEGRAM_CHAT_ID', '');
  if (!botToken || !chatId) return;
  var lines = alerts.map(function(a) {
    return '• *' + a.code + '*: còn ' + a.remaining + (Number(a.remaining) < 0 ? ' (âm — oversold!)' : ' (hết hàng)');
  });
  var text = '⚠️ *Cảnh báo tồn kho*\n\n' + lines.join('\n') +
    '\n\n👉 [Mở Tồn Kho](https://www.thuyjapan.com/thuythang) để bổ sung.';
  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' }),
      muteHttpExceptions: true
    });
  } catch(e) { Logger.log('Stock alert TG err: ' + e); }
}

// ---- Telegram alert when AI verify fails OR khách dùng manual-review fallback ----
// payload.type = 'verify_failed' | 'manual_review_pending'
// Rate-limited: 1 alert per 5 min per customer+order combo (key in ScriptProperties).
// Silently skips if Telegram bot not configured.
function sendVerifyFailureTelegram_(payload) {
  var botToken = _prop('TELEGRAM_BOT_TOKEN', '');
  var chatId = _prop('TELEGRAM_CHAT_ID', '');
  if (!botToken || !chatId) return;  // not configured → silent skip
  if (!payload || !payload.type) return;
  try {
    // ── Rate limit: hash(customerKey + orderRef) bucketed by 5-min window ──
    var customerKey = (payload.customer_email || payload.customer_phone || payload.customer_name || 'anon')
      .toString().toLowerCase().replace(/\s+/g, '').slice(0, 40);
    var orderKey = (payload.order_ref || '').toString().replace(/[^a-zA-Z0-9#]/g, '').slice(0, 30);
    var bucket = Math.floor(Date.now() / (5 * 60 * 1000));  // 5-min bucket
    var rateKey = ('tg_verify_' + payload.type + '_' + customerKey + '_' + orderKey + '_' + bucket).slice(0, 100);
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty(rateKey)) {
      Logger.log('TG verify alert rate-limited: ' + rateKey);
      return;
    }
    props.setProperty(rateKey, '1');

    // ── Build message based on type ──
    var text;
    var dashUrl = 'https://www.thuyjapan.com/thuythang';
    if (payload.type === 'manual_review_pending') {
      // URGENT: customer used Agent 4's submit-anyway fallback
      text = '🚨 *URGENT — Manual Review Pending*\n\n' +
        '📦 Đơn: ' + (payload.order_ref || '(?)') + '\n' +
        '👤 Khách: ' + (payload.customer_name || '(?)') + '\n' +
        '💵 Số tiền: ¥' + Number(payload.expected_amount || 0).toLocaleString() + '\n' +
        '📞 ' + (payload.customer_phone || '(không có)') + '\n' +
        (payload.fail_count ? '🔄 AI verify đã fail ' + payload.fail_count + ' lần\n' : '') +
        '\n⚠️ *Khách đã pay ngoài hệ thống — cần review*\n\n' +
        '👉 [Mở /thuythang để duyệt](' + dashUrl + ')';
    } else {
      // verify_failed: which layer? amount mismatch? text excerpt?
      var failedLayer = '(unknown)';
      if (payload.checks && typeof payload.checks === 'object') {
        var layerOrder = ['amount', 'recipient', 'duplicate', 'source', 'completion', 'date', 'transaction_ref', 'no_editor_signature'];
        for (var i = 0; i < layerOrder.length; i++) {
          var k = layerOrder[i];
          if (payload.checks[k] === false) { failedLayer = k; break; }
        }
        if (failedLayer === '(unknown)' && payload.checks.amount !== true) failedLayer = 'amount (no match found)';
      }
      var excerpt = (payload.raw_text || '').toString().replace(/\s+/g, ' ').trim().slice(0, 200);
      if (excerpt.length === 200) excerpt += '...';
      // Escape underscores/asterisks in excerpt to avoid breaking Markdown
      excerpt = excerpt.replace(/([_*\[\]`])/g, '\\$1');

      text = '⚠️ *AI Verify Failed*\n\n' +
        '📦 Đơn ref: ' + (payload.order_ref || '(chưa tạo đơn)') + '\n' +
        '👤 Khách: ' + (payload.customer_name || '(?)') + '\n' +
        '📞 ' + (payload.customer_phone || '(không có)') + '\n' +
        '💵 Expected: ¥' + Number(payload.expected_amount || 0).toLocaleString() + '\n' +
        '💳 Detected: ' + (payload.detected_amount != null
          ? '¥' + Number(payload.detected_amount).toLocaleString()
          : '(không đọc được)') + '\n' +
        '❌ Layer fail: *' + failedLayer + '*\n' +
        (excerpt ? '\n📄 _Trích OCR:_ ' + excerpt + '\n' : '') +
        '\n👉 [Mở /thuythang để override](' + dashUrl + ')';
    }

    UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' }),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('sendVerifyFailureTelegram_ err: ' + e);
  }
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

  // Sheet status: customer_paid → "Da TT - Cho gui", else "Cho gui hang"
  var sheetStatus = (data.status === 'customer_paid' || data.ai_verify_passed)
    ? 'Da TT - Cho gui'
    : 'Cho gui hang';

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
    sheetStatus,
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
  // Declare outside try so catch block can reference them for diagnostics
  var yamatoSS = null;
  var yamatoSheet = null;
  try {
    yamatoSS    = SpreadsheetApp.openById(YAMATO_SS_ID);
    yamatoSheet = yamatoSS.getSheetByName(YAMATO_SHEET);
    if (!yamatoSheet) {
      Logger.log('Yamato sheet not found. Expected name: ' + YAMATO_SHEET + '. Available tabs: ' + yamatoSS.getSheets().map(function(s) { return s.getName(); }).join(', '));
      return;
    }

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
// ============================================================
// APPEND TO YAMATO PARENT ROW — Merge Orders Phase 4 (2026-05-09)
// Khi đơn merge tạo, KHÔNG thêm row Yamato mới. Thay vào đó tìm row đơn cha
// và append items đơn con vào cell AB (productSummary), update cell P
// (recipientName) thành "0206+0206-M1---{name}" để anh thấy ngay khi in label.
//
// Params:
//   parentOrderNo     {string} order_no đơn cha (e.g. "0206")
//   childOrderNo      {string} order_no đơn con (e.g. "0206-M1")
//   childCartItems    {Array}  cart items đơn con
//   childCustomerName {string} fallback nếu cell P không có separator "---"
//
// Returns: true nếu update OK, false nếu fail (parent row not found, sheet error)
// ============================================================
function appendToYamatoParent_(parentOrderNo, childOrderNo, childCartItems, childCustomerName) {
  var yamatoSS = null, yamatoSheet = null;
  try {
    yamatoSS = SpreadsheetApp.openById(YAMATO_SS_ID);
    yamatoSheet = yamatoSS.getSheetByName(YAMATO_SHEET);
    if (!yamatoSheet) {
      Logger.log('[appendToYamato] Yamato sheet not found');
      return false;
    }

    // Find row có cell A = parentOrderNo (col 1, 1-indexed)
    var lastRow = yamatoSheet.getLastRow();
    if (lastRow < 1) return false;
    var colA = yamatoSheet.getRange(1, 1, lastRow, 1).getValues();
    var parentRow = -1;
    for (var i = 0; i < colA.length; i++) {
      if (String(colA[i][0]).trim() === String(parentOrderNo).trim()) {
        parentRow = i + 1;
        break;
      }
    }

    if (parentRow === -1) {
      Logger.log('[appendToYamato] Parent row not found for orderNo: ' + parentOrderNo);
      return false;
    }

    // Get current cell P (recipientName, col 16) và AB (productSummary, col 28)
    var currentP = String(yamatoSheet.getRange(parentRow, 16).getValue() || '');
    var currentAB = String(yamatoSheet.getRange(parentRow, 28).getValue() || '');

    // Cell P format: "0206---Phan Nguyen" → tách "---" → append childOrderNo
    // → "0206+0206-M1---Phan Nguyen" (anh chọn format rõ — option 2)
    var idxSep = currentP.indexOf('---');
    var beforeSep, afterSep;
    if (idxSep >= 0) {
      beforeSep = currentP.substring(0, idxSep);
      afterSep = currentP.substring(idxSep + 3);
    } else {
      beforeSep = String(parentOrderNo);
      afterSep = childCustomerName || '';
    }
    var newP = beforeSep + '+' + childOrderNo + '---' + afterSep;

    // Cell AB: append " | " + new product summary (separator pipe space)
    var childSummary = buildProductSummary(childCartItems);
    var newAB = currentAB + ' | ' + childSummary;

    // Write back
    yamatoSheet.getRange(parentRow, 16).setValue(newP);
    yamatoSheet.getRange(parentRow, 28).setValue(newAB);

    Logger.log('[appendToYamato] OK row ' + parentRow + ' parent=' + parentOrderNo + ' child=' + childOrderNo + ' newP=' + newP);
    return true;
  } catch (e) {
    Logger.log('[appendToYamato] EXCEPTION: ' + e);
    return false;
  }
}

function buildProductSummary(cartItems) {
  if (!cartItems || !Array.isArray(cartItems)) return '';

  const totals = {};
  cartItems.forEach(function(item) {
    const match = (item.name || '').match(/^\[([^\]]+)\]/);
    if (!match) return;
    const rawCode = match[1];
    const mapped  = CODE_MAP[rawCode];
    if (!mapped) return;
    // byBox: cart stores wt = boxCount * 0.5; box count = qty * wt / 0.5
    // kg: total kg = qty * wt
    const amount = mapped.byBox ? (item.qty * item.wt / 0.5) : (item.qty * item.wt);
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

// ============================================================
// TEST sendCustomerConfirmation TRỰC TIẾP trong editor
// Bypass web app deployment để test code hiện tại.
// ============================================================
function testSendCustomerConfirmation() {
  Logger.log('=== TEST sendCustomerConfirmation ===');
  Logger.log('Email quota: ' + MailApp.getRemainingDailyQuota());

  var fakeOrderNo = 'TEST-' + Date.now();
  var fakeData = {
    name: 'Thang Test',
    email: 'thanghoang1109+test98@gmail.com',
    phone: '07084560340',
    postal: '270-0034', prefecture: '千葉県', address: '松戸市新松戸6',
    note: 'Test', cartItems: [{ name: '[GT] Giò có tiêu', size: '1kg', qty: 1, price: 2300, wt: 1 }],
    subtotal: 2300, shipping: 500, total: 2800
  };

  try {
    sendCustomerConfirmation(fakeOrderNo, fakeData);
    Logger.log('✓ NO EXCEPTION — check Gmail Sent của takahashi1109y');
  } catch (e) {
    Logger.log('✗ EXCEPTION: ' + e.toString());
    Logger.log('  Stack: ' + (e.stack || ''));
  }
  Logger.log('=== Done ===');
}

// ============================================================
// TEST EMAIL — chay function nay TRONG EDITOR de check Gmail quota
// + send test email. Log se hien ngay phia duoi editor.
// ============================================================
function testEmailQuota() {
  Logger.log('=== EMAIL QUOTA TEST ===');
  Logger.log('Email quota remaining today: ' + MailApp.getRemainingDailyQuota());

  // Try send test email
  var testEmail = 'thanghoang1109+test98@gmail.com';
  try {
    MailApp.sendEmail(testEmail, '[TEST] Bep Thuy email check', 'This is a test email at ' + new Date(), {
      name: 'Bếp Thuỷ Japan TEST'
    });
    Logger.log('✓ TEST EMAIL SENT OK to ' + testEmail);
    Logger.log('  → Check Gmail Sent của thuyjapan1606@gmail.com');
    Logger.log('  → Check Inbox/Spam của ' + testEmail);
  } catch (e) {
    Logger.log('✗ TEST EMAIL FAIL: ' + e.toString());
    Logger.log('  → Stack: ' + (e.stack || 'no stack'));
  }

  Logger.log('=== Done. Email quota AFTER: ' + MailApp.getRemainingDailyQuota() + ' ===');
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

// ============================================================
// TEST FIX byBox - Verify Nem/Pte hien thi dung so hop
// Run truoc khi push production de chac chan formula dung.
// Bug truoc fix: 2 hop Pate hien thi "1 pte" (sai). Sau fix: "2 pte".
// ============================================================
function testByBoxFix() {
  Logger.log('=== TEST byBox fix ===');
  var pass = 0, fail = 0;

  function assertEq(label, actual, expected) {
    var ok = actual === expected;
    Logger.log((ok ? '✓ PASS' : '✗ FAIL') + ' ' + label
      + ' | expected="' + expected + '" actual="' + actual + '"');
    ok ? pass++ : fail++;
  }

  // Case 1: Modern cart - 2 hop Pate (qty=1, wt=1.0 = 2 hop * 0.5)
  var cart1 = [{ name: '[Pte] Pa Te Pho Co', qty: 1, wt: 1.0, size: '2 hộp' }];
  assertEq('modern 2 hop Pate -> buildProductSummary', buildProductSummary(cart1), '2 pte');
  assertEq('modern 2 hop Pate -> buildOrderItems',     buildOrderItems(cart1),     '2 Pte');

  // Case 2: Modern cart - 2 hop Nem
  var cart2 = [{ name: '[Nem] Nem Lui Hue', qty: 1, wt: 1.0, size: '2 hộp' }];
  assertEq('modern 2 hop Nem -> buildProductSummary', buildProductSummary(cart2), '2 nem');

  // Case 3: Legacy cart format - 2 hop Nem (qty=2, wt=0.5 per box)
  var cart3 = [{ name: '[Nem] Nem Lui Hue', qty: 2, wt: 0.5, size: '0.5kg' }];
  assertEq('legacy 2 hop Nem -> buildProductSummary', buildProductSummary(cart3), '2 nem');

  // Case 4: Mixed cart (anh's exact bug case): 2 hop Pate + 2 hop Nem + 0.5kg Gio
  var cart4 = [
    { name: '[Pte] Pa Te Pho Co', qty: 1, wt: 1.0, size: '2 hộp' },
    { name: '[Nem] Nem Lui Hue',  qty: 1, wt: 1.0, size: '2 hộp' },
    { name: '[GT] Gio Co Tieu',   qty: 1, wt: 0.5, size: '0.5kg' }
  ];
  assertEq('mixed cart -> buildProductSummary', buildProductSummary(cart4), '0.5g 2 nem 2 pte');
  assertEq('mixed cart -> buildOrderItems',     buildOrderItems(cart4),     '0.5 GT 2 Nem 2 Pte');

  // Case 5: kg product unchanged. CKT mapped.code='ckt' (len 3) -> with space.
  var cart5 = [{ name: '[CKT] Cha que khong tieu', qty: 1, wt: 1.0, size: '1kg' }];
  assertEq('kg product (CKT 1kg) -> buildProductSummary', buildProductSummary(cart5), '1 ckt');

  // Case 6: Multiple boxes aggregated (3 hop Pate split into 2 cart lines)
  var cart6 = [
    { name: '[Pte] Pa Te Pho Co', qty: 1, wt: 1.0, size: '2 hộp' },
    { name: '[Pte] Pa Te Pho Co', qty: 1, wt: 0.5, size: '1 hộp' }
  ];
  assertEq('split Pate 2+1 -> buildProductSummary', buildProductSummary(cart6), '3 pte');

  Logger.log('=== Test done: ' + pass + ' pass, ' + fail + ' fail ===');
  return { pass: pass, fail: fail };
}

// ---- Test saveYamato voi cart byBox format thuc te (anh's bug case) ----
// Sau khi run, kiem tra row "TEST-BB" trong Yamato sheet.
// Cot AB phai la "2 nem 2 pte" (sau fix), KHONG phai "1 nem 1 pte" (truoc fix).
function testSaveYamatoByBoxFix() {
  const mockData = {
    name: 'TEST BYBOX FIX',
    phone: '09042376886',
    postal: '2700034',
    prefecture: '千葉県',
    address: '松戸市新松戸６－１１８－２',
    note: 'TEST BYBOX FIX - DELETE AFTER VERIFY',
    deliveryTime: '0812',
    cartItems: [
      { name: '[Pte] Pa Te Pho Co', qty: 1, wt: 1.0, size: '2 hộp', price: 1600 },
      { name: '[Nem] Nem Lui Hue',  qty: 1, wt: 1.0, size: '2 hộp', price: 1600 }
    ]
  };
  saveYamato('TEST-BB', mockData);
  Logger.log('testSaveYamatoByBoxFix: DONE');
  Logger.log('  -> Mo Yamato sheet, tim row "TEST-BB"');
  Logger.log('  -> Cot AB phai la "2 nem 2 pte" (sau fix)');
  Logger.log('  -> Neu thay "1 nem 1 pte" -> fix CHUA chay (redeploy lai)');
}

// ============================================================
// BACKFILL YAMATO - Day cac don bi miss tu Supabase sang Yamato sheet
// Chay 1 lan tu Apps Script Editor sau khi redeploy
// An toan: skip don da co trong Yamato (idempotent)
// ============================================================
//
// Cach dung:
//   1) Chay testBackfillDryRun() truoc -> xem Logger se day bao nhieu don
//   2) Neu OK, chay backfillYamatoOrders() de thuc su day vao Yamato sheet
//   3) Mo Yamato spreadsheet (ID: YAMATO_SS_ID) -> tab "外部データ取り込み基本レイアウト" de verify
//
// Logic:
//   - Lay don tu Supabase orders (status IN: confirmed, shipped, delivered, customer_paid)
//   - Lay order_no da co trong Yamato sheet (cot A)
//   - Voi moi don thieu, build data object va goi saveYamato(orderNo, data)
//
// Status loai tru: pending (chua tra), cancelled (da huy)
// ============================================================

// ---- Helper: lay danh sach don confirmed/shipped/delivered/customer_paid tu Supabase ----
function _fetchYamatoEligibleOrdersFromSupabase_() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    Logger.log('ERROR: Thieu SUPABASE_URL hoac SUPABASE_SERVICE_KEY trong Script Properties');
    return [];
  }
  // Status eligible cho Yamato: confirmed, shipped, delivered, customer_paid
  // Loai pending (chua TT) va cancelled (da huy)
  var statusFilter = 'in.(confirmed,shipped,delivered,customer_paid)';
  var url = SUPABASE_URL + '/rest/v1/orders'
    + '?select=order_no,status,customer_name,customer_phone,customer_email,'
    + 'recipient_name,recipient_phone,ship_postal,ship_prefecture,ship_address,ship_mailbox,'
    + 'items,note,delivery_time,total,subtotal,shipping_fee,created_at'
    + '&status=' + encodeURIComponent(statusFilter)
    + '&order=order_no.asc'
    + '&limit=10000';
  try {
    var res = UrlFetchApp.fetch(url, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Accept': 'application/json'
      },
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var text = res.getContentText() || '[]';
    Logger.log('Fetch Supabase orders HTTP ' + code + ' (' + text.length + ' chars)');
    if (code >= 300) {
      Logger.log('Fetch err body (first 500): ' + text.substring(0, 500));
      return [];
    }
    var arr = JSON.parse(text);
    if (!Array.isArray(arr)) {
      Logger.log('CANH BAO: response khong phai array');
      return [];
    }
    return arr;
  } catch (e) {
    Logger.log('ERROR fetch Supabase orders: ' + e);
    return [];
  }
}

// ---- Helper: lay danh sach order_no da co trong Yamato sheet (cot A) ----
function _fetchExistingYamatoOrderNos_() {
  var existing = {};
  try {
    var yamatoSS = SpreadsheetApp.openById(YAMATO_SS_ID);
    var yamatoSheet = yamatoSS.getSheetByName(YAMATO_SHEET);
    if (!yamatoSheet) {
      Logger.log('ERROR: Yamato sheet "' + YAMATO_SHEET + '" khong ton tai. Tabs co san: '
        + yamatoSS.getSheets().map(function(s) { return s.getName(); }).join(', '));
      return existing;
    }
    var lastRow = yamatoSheet.getLastRow();
    if (lastRow < 2) {
      Logger.log('Yamato sheet rong (chi co header). 0 don da ton tai.');
      return existing;
    }
    // Cot A = so thu tu (order_no). Doc tu hang 2 (skip header)
    var values = yamatoSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    values.forEach(function(row) {
      var raw = row[0];
      if (raw === null || raw === undefined || raw === '') return;
      var key = String(raw).trim();
      if (!key) return;
      existing[key] = true;
      // Cung luu phien ban pad 4-digit de match (vi sheet co the luu "42" hay 42 trong khi DB luu "0042")
      if (/^\d+$/.test(key)) existing[key.padStart(4, '0')] = true;
    });
    Logger.log('Da co ' + Object.keys(existing).length + ' order_no trong Yamato sheet (ke ca pad variants)');
  } catch (e) {
    Logger.log('ERROR fetch existing Yamato order_nos: ' + e);
  }
  return existing;
}

// ---- Helper: build data object tu Supabase order row, dung shape ma saveYamato can ----
function _supabaseOrderToYamatoData_(o) {
  // saveYamato expects: { name, phone, postal, prefecture, address, note, deliveryTime, cartItems }
  // - phone -> recipient_phone uu tien, fallback customer_phone
  // - name  -> recipient_name  uu tien, fallback customer_name
  // - note  -> ship_mailbox + note (ten toa nha + ghi chu)
  // - cartItems -> items array (luu y: items la JSONB trong DB)
  var name = (o.recipient_name && String(o.recipient_name).trim())
    || (o.customer_name && String(o.customer_name).trim())
    || '';
  var phone = (o.recipient_phone && String(o.recipient_phone).trim())
    || (o.customer_phone && String(o.customer_phone).trim())
    || '';
  // Note ghi vao Yamato la "ten toa nha" - uu tien ship_mailbox
  // Neu khong co ship_mailbox, fall back order note (vi nhieu khi note co dia chi phong)
  var noteParts = [];
  if (o.ship_mailbox) noteParts.push(String(o.ship_mailbox).trim());
  if (o.note) noteParts.push(String(o.note).trim());
  var noteCombined = noteParts.filter(function(s) { return !!s; }).join(' ');

  var items = o.items;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch (e) { items = []; }
  }
  if (!Array.isArray(items)) items = [];

  return {
    name: name,
    phone: phone,
    postal: String(o.ship_postal || '').trim(),
    prefecture: String(o.ship_prefecture || '').trim(),
    address: String(o.ship_address || '').trim(),
    note: noteCombined,
    deliveryTime: String(o.delivery_time || '0812').trim() || '0812',
    cartItems: items,
    status: o.status || ''
  };
}

// ---- DRY RUN: chi log nhung gi SE duoc insert, KHONG goi saveYamato ----
function testBackfillDryRun() {
  Logger.log('=== DRY RUN: BACKFILL YAMATO (preview only) ===');
  Logger.log('Khong day du lieu thuc te. Chi log de xem truoc.');
  Logger.log('');

  var supabaseOrders = _fetchYamatoEligibleOrdersFromSupabase_();
  Logger.log('Tong don eligible tu Supabase: ' + supabaseOrders.length);

  var existing = _fetchExistingYamatoOrderNos_();

  var missing = [];
  supabaseOrders.forEach(function(o) {
    var orderNo = String(o.order_no || '').trim();
    if (!orderNo) return;
    var orderNoPadded = /^\d+$/.test(orderNo) ? orderNo.padStart(4, '0') : orderNo;
    if (existing[orderNo] || existing[orderNoPadded]) return;
    missing.push(o);
  });

  Logger.log('');
  Logger.log('=== KET QUA DRY RUN ===');
  Logger.log('Tong don eligible:        ' + supabaseOrders.length);
  Logger.log('Da co trong Yamato:       ' + (supabaseOrders.length - missing.length));
  Logger.log('Don THIEU (se duoc day):  ' + missing.length);
  Logger.log('');

  if (missing.length === 0) {
    Logger.log('Khong co don nao thieu. Yamato sheet da day du.');
    return;
  }

  Logger.log('--- Chi tiet ' + Math.min(missing.length, 50) + ' don dau tien ---');
  missing.slice(0, 50).forEach(function(o, idx) {
    var d = _supabaseOrderToYamatoData_(o);
    var summary = buildProductSummary(d.cartItems);
    Logger.log((idx + 1) + '. #' + o.order_no
      + ' [' + (o.status || '?') + ']'
      + ' name=' + d.name
      + ' phone=' + d.phone
      + ' postal=' + d.postal
      + ' pref=' + d.prefecture
      + ' addr=' + (d.address || '').substring(0, 40)
      + ' note=' + (d.note || '').substring(0, 30)
      + ' time=' + d.deliveryTime
      + ' items=' + (Array.isArray(d.cartItems) ? d.cartItems.length : 0)
      + ' summary=' + summary);
  });
  if (missing.length > 50) {
    Logger.log('... va ' + (missing.length - 50) + ' don nua (an di trong dry run)');
  }
  Logger.log('');
  Logger.log('De thuc su day du lieu, chay: backfillYamatoOrders()');
}

// ---- THUC SU day cac don thieu vao Yamato sheet ----
function backfillYamatoOrders() {
  Logger.log('=== BACKFILL YAMATO ORDERS - START ===');
  var supabaseOrders = _fetchYamatoEligibleOrdersFromSupabase_();
  if (supabaseOrders.length === 0) {
    Logger.log('Khong co don eligible nao tu Supabase. Dung.');
    return;
  }

  var existing = _fetchExistingYamatoOrderNos_();

  var stats = { totalEligible: supabaseOrders.length, alreadyExist: 0, missing: 0,
                processed: 0, skipped: 0, errors: 0 };
  var missingOrders = [];

  supabaseOrders.forEach(function(o) {
    var orderNo = String(o.order_no || '').trim();
    if (!orderNo) { stats.skipped++; return; }
    var orderNoPadded = /^\d+$/.test(orderNo) ? orderNo.padStart(4, '0') : orderNo;
    if (existing[orderNo] || existing[orderNoPadded]) {
      stats.alreadyExist++;
      return;
    }
    missingOrders.push(o);
  });
  stats.missing = missingOrders.length;

  Logger.log('Tong don eligible:    ' + stats.totalEligible);
  Logger.log('Da co trong Yamato:   ' + stats.alreadyExist);
  Logger.log('Skip (no order_no):   ' + stats.skipped);
  Logger.log('Don THIEU se day:     ' + stats.missing);
  Logger.log('');

  if (missingOrders.length === 0) {
    Logger.log('Khong co don nao thieu. Yamato sheet da day du. Dung.');
    return;
  }

  // Xu ly tung don. saveYamato append 1 row moi lan -> ko bi tranh chap row index.
  for (var i = 0; i < missingOrders.length; i++) {
    var o = missingOrders[i];
    var orderNo = String(o.order_no || '').trim();
    var orderNoForYamato = /^\d+$/.test(orderNo) ? orderNo.padStart(4, '0') : orderNo;
    try {
      var data = _supabaseOrderToYamatoData_(o);
      Logger.log('[' + (i + 1) + '/' + missingOrders.length + '] Pushing #' + orderNoForYamato
        + ' name=' + data.name + ' status=' + (o.status || '?'));
      saveYamato(orderNoForYamato, data);
      stats.processed++;
      // Throttle nhe de tranh hit quota
      if ((i + 1) % 10 === 0) Utilities.sleep(300);
    } catch (err) {
      stats.errors++;
      Logger.log('ERROR don #' + orderNo + ': ' + err);
    }
  }

  Logger.log('');
  Logger.log('=== BACKFILL YAMATO ORDERS - DONE ===');
  Logger.log('Found ' + stats.missing + ' missing orders. '
    + 'Processed ' + stats.processed + '. '
    + 'Skipped ' + (stats.alreadyExist + stats.skipped) + '. '
    + 'Errors ' + stats.errors + '.');
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

  MailApp.sendEmail(email, subject, '', {
    htmlBody  : htmlBody,
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
    // byBox: SL = box count = qty * wt / 0.5 (cart normalized to qty=1, wt encodes box count).
    // kg: SL = qty (raw).
    var match = (i.name || '').match(/^\[([^\]]+)\]/);
    var mapped = match ? CODE_MAP[match[1]] : null;
    var displayQty = (mapped && mapped.byBox)
      ? Math.max(1, Math.round((Number(i.qty)||1) * (Number(i.wt)||0) / 0.5))
      : i.qty;
    return '<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">' + i.name + ' (' + (i.size||'') + ')</td>' +
           '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">' + displayQty + '</td>' +
           '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + ((i.price||0) * (Number(i.qty)||1)).toLocaleString() + ' \xa5</td></tr>';
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
    MailApp.sendEmail(ADMIN_EMAIL, subject, '', {
      htmlBody : htmlBody,
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
    // byBox: SL = box count = qty * wt / 0.5; kg: SL = qty.
    var match = (i.name || '').match(/^\[([^\]]+)\]/);
    var mapped = match ? CODE_MAP[match[1]] : null;
    var displayQty = (mapped && mapped.byBox)
      ? Math.max(1, Math.round((Number(i.qty)||1) * (Number(i.wt)||0) / 0.5))
      : i.qty;
    return '<tr>' +
      '<td style="padding:8px;border-bottom:1px solid #f0e0d0">' + i.name + ' (' + (i.size||'') + ')</td>' +
      '<td style="padding:8px;border-bottom:1px solid #f0e0d0;text-align:center">' + displayQty + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #f0e0d0;text-align:right">' + ((i.price||0) * (Number(i.qty)||1)).toLocaleString() + ' \xa5</td>' +
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
    MailApp.sendEmail(email, subject, '', {
      htmlBody : htmlBody,
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

// ============================================================
// TRACKING SCRAPERS — Yamato (宅急便) & Sagawa (飛脚宅配便)
// ============================================================
// Fetches public tracking pages and parses event rows out of the
// HTML tables. Called from doPost type='fetch_tracking_events'.
//
// IMPORTANT: The regex below is best-effort against the carriers'
// current public HTML structure. If Yamato/Sagawa change their
// markup, scraping may return [] (empty array). Admin should then
// inspect the page source and update the rowRegex pattern.
// Both functions return an empty array on parse failure rather
// than throwing, so the admin UI degrades gracefully.
// ============================================================

function scrapeYamatoTracking_(trackingNo) {
  // Strip dashes/spaces — Yamato chỉ accept digits (e.g. 3898-5807-6156 → 389858076156)
  var cleanNo = String(trackingNo || '').replace(/[^0-9]/g, '');
  if (!cleanNo) throw new Error('Yamato: empty tracking number');

  // POST với form-encoded body — Yamato server-side render HTML khi nhận POST
  // (GET với ?number=X chỉ trả landing page rỗng)
  // number00=1 → "show detailed info", number01=TRACKING (1st parcel)
  var url = 'https://toi.kuronekoyamato.co.jp/cgi-bin/tneko';
  Logger.log('Yamato scrape POST: ' + url + ' number01=' + cleanNo);
  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: 'number00=1&number01=' + encodeURIComponent(cleanNo),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    muteHttpExceptions: true,
    followRedirects: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Yamato HTTP ' + resp.getResponseCode());
  }
  var html = resp.getContentText('UTF-8');

  // Parse div-based timeline (modern Yamato HTML 2026):
  // <div class="tracking-invoice-block-detail">
  //   <ol>
  //     <li>
  //       <div class="item">荷物受付</div>
  //       <div class="date">05月02日 15:33</div>
  //       <div class="name">松戸主水新田営業所（新松戸７丁目）</div>
  //     </li>
  //   </ol>
  // </div>
  var events = [];
  var currentYear = (new Date()).getFullYear();

  try {
    var rowRegex = /<li[^>]*>\s*<div class="item">([^<]+)<\/div>\s*<div class="date">([^<]+)<\/div>\s*<div class="name">(?:<a[^>]*>)?([^<]+)(?:<\/a>)?<\/div>\s*<\/li>/g;
    var m;
    while ((m = rowRegex.exec(html)) !== null) {
      var status = m[1].trim();
      var dateStr = m[2].trim();  // "05月02日 15:33" or "12月31日 09:00"
      var location = m[3].trim();

      // Parse "MM月DD日 HH:MM" → date "YYYY-MM-DD" + time "HH:MM"
      var dateMatch = dateStr.match(/(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/);
      if (!dateMatch) continue;  // skip malformed rows
      var month = dateMatch[1].length < 2 ? '0' + dateMatch[1] : dateMatch[1];
      var day = dateMatch[2].length < 2 ? '0' + dateMatch[2] : dateMatch[2];
      var hour = dateMatch[3].length < 2 ? '0' + dateMatch[3] : dateMatch[3];
      var minute = dateMatch[4];
      var date = currentYear + '-' + month + '-' + day;
      var timeStr = hour + ':' + minute;

      events.push({
        date: date,
        time: timeStr,
        status: status,
        location: location,
        type: classifyYamatoStatus_(status)
      });
    }
  } catch (parseErr) {
    Logger.log('Yamato parse err: ' + parseErr);
    return [];
  }

  Logger.log('Yamato found ' + events.length + ' events for ' + cleanNo);

  // Sort by date+time descending (newest first)
  events.sort(function(a, b) {
    var ka = a.date + ' ' + a.time;
    var kb = b.date + ' ' + b.time;
    return kb.localeCompare(ka);
  });

  return events;
}

function classifyYamatoStatus_(status) {
  var s = (status || '').toLowerCase();
  if (s.indexOf('配達完了') >= 0 || s.indexOf('投函') >= 0 || s.indexOf('受取') >= 0) return 'delivered';
  if (s.indexOf('持ち戻り') >= 0 || s.indexOf('不在') >= 0) return 'attempt';
  if (s.indexOf('配達中') >= 0 || s.indexOf('お届け中') >= 0) return 'in_transit';
  if (s.indexOf('発送') >= 0 || s.indexOf('発店') >= 0 || s.indexOf('荷物受付') >= 0) return 'shipped';
  return 'other';
}

function scrapeSagawaTracking_(trackingNo) {
  // Sagawa uses GET with okurijoNo parameter (or sometimes okurijoNo1).
  // We try okurijoNo first; if needed, admin can swap in okurijoNo1.
  // Strip dashes defensively (Sagawa tolerant nhưng consistent với Yamato)
  var cleanNo = String(trackingNo || '').replace(/[^0-9]/g, '');
  if (!cleanNo) throw new Error('Sagawa: empty tracking number');
  var url = 'https://k2k.sagawa-exp.co.jp/p/web/okurijoinput?okurijoNo=' + cleanNo;
  Logger.log('Sagawa scrape: ' + url);
  var resp = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BepThuyTracking/1.0)'
    },
    muteHttpExceptions: true,
    followRedirects: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Sagawa HTTP ' + resp.getResponseCode());
  }
  var html = resp.getContentText('UTF-8');

  // Sagawa returns events in a similar table structure.
  // Date may appear as M/D (no year) or YYYY/M/D depending on the row.
  var events = [];

  try {
    var rowRegex = /<tr[^>]*>\s*<td[^>]*>(\d{1,2}\/\d{1,2}|\d{4}\/\d{1,2}\/\d{1,2})<\/td>\s*<td[^>]*>(\d{1,2}:\d{2})<\/td>\s*<td[^>]*>([^<]+)<\/td>(?:\s*<td[^>]*>([^<]*)<\/td>)?\s*<\/tr>/g;
    var m;
    var year = (new Date()).getFullYear();
    while ((m = rowRegex.exec(html)) !== null) {
      var dateRaw = m[1];
      if (dateRaw.length <= 5) {  // M/D, no year
        dateRaw = year + '/' + dateRaw;
      }
      var dateParts = dateRaw.split('/').map(function(p) { return p.length < 2 ? ('0' + p) : p; });
      var date = dateParts.join('-');
      var timeStr = m[2];
      var status = m[3].trim();
      var location = m[4] ? m[4].trim() : '';
      events.push({
        date: date,
        time: timeStr,
        status: status,
        location: location,
        type: classifySagawaStatus_(status)
      });
    }
  } catch (parseErr) {
    Logger.log('Sagawa parse err: ' + parseErr);
    return [];
  }

  Logger.log('Sagawa found ' + events.length + ' events for ' + trackingNo);

  events.sort(function(a, b) {
    var ka = a.date + ' ' + a.time;
    var kb = b.date + ' ' + b.time;
    return kb.localeCompare(ka);
  });

  return events;
}

function classifySagawaStatus_(status) {
  var s = (status || '').toLowerCase();
  if (s.indexOf('配達済み') >= 0 || s.indexOf('お届け') >= 0) return 'delivered';
  if (s.indexOf('持ち戻り') >= 0 || s.indexOf('不在') >= 0) return 'attempt';
  if (s.indexOf('輸送中') >= 0 || s.indexOf('配達中') >= 0 || s.indexOf('持ち出し') >= 0) return 'in_transit';
  if (s.indexOf('集荷') >= 0 || s.indexOf('発送') >= 0) return 'shipped';
  return 'other';
}

// ============================================================
// CHECK YAMATO DELIVERED STATUS — Phase 2 (2026-05-09)
// Auto chuyển status `shipped → delivered` khi Yamato báo 配達完了.
// Trigger: anh chạy thủ công LẦN ĐẦU để backfill 86 đơn shipped hiện tại.
// Sau đó setup Time Trigger hàng ngày (vd 9h sáng JST).
//
// Logic:
//   1. Query Supabase orders WHERE status='shipped' AND tracking_number not null
//   2. Loop từng đơn → scrapeYamatoTracking_ → check '配達完了' trong events
//   3. Nếu có → UPDATE orders set status='delivered' + delivered_at=now()
//   4. Sleep 500ms giữa requests (tránh Yamato rate limit)
//   5. Telegram alert + log summary
// ============================================================
function checkYamatoDeliveredStatus_() {
  Logger.log('═══ CHECK YAMATO DELIVERED STATUS ═══');
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    Logger.log('FAIL: SUPABASE config missing');
    return;
  }

  // 1. Query orders shipped với tracking_number
  var url = SUPABASE_URL + '/rest/v1/orders?status=eq.shipped&tracking_number=not.is.null&select=order_no,tracking_number,carrier';
  var res = UrlFetchApp.fetch(url, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY
    },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    Logger.log('FAIL: Supabase HTTP ' + res.getResponseCode());
    return;
  }
  var orders = JSON.parse(res.getContentText());
  Logger.log('Found ' + orders.length + ' shipped orders to check');

  var updated = 0, stillShipping = 0, errors = 0, skipped = 0;
  var t0 = Date.now();

  for (var i = 0; i < orders.length; i++) {
    var o = orders[i];
    // Skip nếu carrier không phải Yamato (Sagawa khác — sẽ implement sau)
    if (o.carrier && o.carrier.toLowerCase().indexOf('sagawa') !== -1) {
      Logger.log((i+1) + '/' + orders.length + ' SKIP Sagawa #' + o.order_no);
      skipped++;
      continue;
    }

    try {
      var events = scrapeYamatoTracking_(o.tracking_number);
      var isDelivered = events && events.some(function(e) {
        return (e.status || '').indexOf('配達完了') !== -1;
      });

      if (isDelivered) {
        // UPDATE status to delivered
        var updRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/orders?order_no=eq.' + encodeURIComponent(o.order_no), {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          payload: JSON.stringify({ status: 'delivered' }),
          muteHttpExceptions: true
        });
        if (updRes.getResponseCode() === 204) {
          Logger.log((i+1) + '/' + orders.length + ' ✓ DELIVERED #' + o.order_no);
          updated++;
        } else {
          Logger.log((i+1) + '/' + orders.length + ' ⚠️ UPDATE fail HTTP ' + updRes.getResponseCode() + ' #' + o.order_no);
          errors++;
        }
      } else {
        stillShipping++;
      }
      Utilities.sleep(500); // rate limit Yamato
    } catch (e) {
      Logger.log((i+1) + '/' + orders.length + ' EXCEPTION #' + o.order_no + ': ' + e);
      errors++;
    }
  }

  var elapsed = Math.round((Date.now() - t0) / 1000);
  Logger.log('═══ DONE in ' + elapsed + 's ═══');
  Logger.log('Total checked: ' + orders.length);
  Logger.log('Updated to delivered: ' + updated);
  Logger.log('Still shipping: ' + stillShipping);
  Logger.log('Skipped (non-Yamato): ' + skipped);
  Logger.log('Errors: ' + errors);

  // Telegram summary nếu có update
  if (updated > 0) {
    try {
      sendTelegramAlertAdmin_(
        '📦 YAMATO DELIVERED CHECK\n' +
        'Total: ' + orders.length + '\n' +
        '✓ Updated → delivered: ' + updated + '\n' +
        '🚚 Still shipping: ' + stillShipping + '\n' +
        '⏱ Elapsed: ' + elapsed + 's'
      );
    } catch(e) {}
  }
}

// ============================================================
// YAMATO SCRAPER HEALTH MONITORING
// Weekly Tuesday 09:00 JST — alert anh nếu Yamato thay HTML structure
// Reuses scrapeYamatoTracking_ để tránh duplicate POST + parse logic
// ============================================================
function testYamatoScraperHealth() {
  var ADMIN_EMAIL = 'thuyjapan1606@gmail.com';
  var TEST_TRACKING = '389858076156';  // Tracking thật của anh — rotate nếu Yamato xóa khỏi system

  try {
    var events = scrapeYamatoTracking_(TEST_TRACKING);
    Logger.log('[YAMATO-HEALTH] Found ' + events.length + ' events for ' + TEST_TRACKING);

    if (events.length >= 1) {
      Logger.log('[YAMATO-OK] Health check passed — ' + events.length + ' events');
      return true;
    }

    // 0 events = HTML structure changed OR test tracking expired — send alert
    var subject = '[ALERT] Yamato Scraper Health Check FAILED';
    var html =
      '<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px">' +
      '<h2 style="color:#C8102E;margin:0 0 16px 0">⚠️ Yamato Scraper trả 0 events</h2>' +
      '<p><b>Test tracking:</b> ' + TEST_TRACKING + '</p>' +
      '<p><b>Khả năng nguyên nhân:</b></p>' +
      '<ul style="line-height:1.6">' +
      '<li>Yamato đã thay đổi HTML structure (regex <code>&lt;li&gt;&lt;div class="item"&gt;...&lt;/div&gt;</code> không còn match)</li>' +
      '<li>Tracking ' + TEST_TRACKING + ' đã bị Yamato xóa khỏi system (retention period ~6 tháng)</li>' +
      '</ul>' +
      '<p><b>Action:</b> Mở <a href="https://toi.kuronekoyamato.co.jp/cgi-bin/tneko">Yamato site</a>, paste tracking ' + TEST_TRACKING + ', nếu site vẫn show events → scraper broken (cần update regex). Nếu site cũng 0 events → rotate test tracking trong testYamatoScraperHealth().</p>' +
      '<p style="color:#666;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">Function: testYamatoScraperHealth · ' + new Date().toISOString() + ' · Bếp Thuỷ Japan</p>' +
      '</div>';
    MailApp.sendEmail(ADMIN_EMAIL, subject, 'Yamato scraper trả 0 events cho ' + TEST_TRACKING + '. Mở email HTML để xem chi tiết.', {
      htmlBody: html,
      replyTo: 'thuyjapan1606@gmail.com'
    });
    return false;
  } catch (err) {
    Logger.log('[YAMATO-CRITICAL] ' + err);
    MailApp.sendEmail(ADMIN_EMAIL, '[CRITICAL] Yamato Scraper EXCEPTION', '', {
      htmlBody: '<div style="font-family:Arial;padding:20px"><h2 style="color:#C8102E">Yamato Scraper Exception</h2><pre style="background:#fee;padding:14px;border-radius:6px;font-size:12px;overflow-x:auto">' + err.toString() + '\n\n' + (err.stack || '') + '</pre></div>',
      replyTo: 'thuyjapan1606@gmail.com'
    });
    return false;
  }
}

// Chạy 1 lần để cài trigger weekly Tuesday 09:00 JST
// (Apps Script Editor → chọn function này từ dropdown → click Run)
//
// LƯU Ý: Function này cần scope `script.scriptapp` (manage triggers).
// Lần đầu Run, Apps Script sẽ prompt authorization. Nếu fail với
// "Specified permissions are not sufficient" → dùng UI manual thay:
//   Apps Script Editor → ⏰ Triggers (sidebar) → + Add Trigger → chọn
//   testYamatoScraperHealth, Time-driven, Week timer, Tuesday, 9am-10am
function createYamatoMonitoringTrigger() {
  // Cleanup duplicate triggers nếu chạy lại — graceful degradation nếu scope chưa grant
  try {
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === 'testYamatoScraperHealth') {
        ScriptApp.deleteTrigger(t);
      }
    });
  } catch (err) {
    Logger.log('[YAMATO-TRIGGER] Skip cleanup (scope chưa grant lần đầu): ' + err);
  }
  // Tạo trigger mới — sẽ prompt auth lần đầu
  ScriptApp.newTrigger('testYamatoScraperHealth')
    .timeBased()
    .everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.TUESDAY)
    .atHour(9)
    .create();
  Logger.log('Yamato monitoring trigger installed — runs every Tuesday 09:00 JST');
}
