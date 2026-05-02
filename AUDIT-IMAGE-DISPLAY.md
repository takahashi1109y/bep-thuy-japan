# AUDIT — Bill image không hiển thị trong admin order modal

Date: 2026-05-02
Files audited:
- `K:/bep-thuy-japan/thuythang.html` (admin dashboard)
- `K:/bep-thuy-japan/google-apps-script.js` (server-side / Apps Script doPost)
- `K:/bep-thuy-japan/supabase-payment-proof.sql` (schema baseline)
- `K:/bep-thuy-japan/supabase-ai-payment-verify.sql` (AI columns migration)
- `K:/bep-thuy-japan/supabase-manual-approve-payment.sql` (manual override migration)
- `K:/bep-thuy-japan/thanh-vien.html` (customer-side reference: how it stored URLs originally)

---

## Section A — Current upload flow (Option B `verify_then_create_order`)

Trigger: customer clicks "Đặt hàng + thanh toán" in checkout. Browser sends POST to Apps Script with base64 receipt.

**Apps Script `doPost` → `verify_then_create_order`** (`google-apps-script.js:253-309`):

1. `verifyReceiptStandalone_(data.receipt_base64, data.total)` runs Vision OCR on the in-memory base64. **No Storage fetch happens here**, so private-bucket isn't an issue at verify time. AI verify therefore passes.
2. On success, order is saved.
3. Line 304: `savePaymentProofForVerifiedOrder_(orderNo2, data)` is called.

**`savePaymentProofForVerifiedOrder_`** (`google-apps-script.js:1752-1809`):

Step 1 — Upload to Storage:
```js
var path = 'auto/' + orderNo + '-' + ts + '.' + ext;          // line 1761
var uploadUrl = SUPABASE_URL + '/storage/v1/object/payment-proofs/' + encodeURIComponent(path);
// POST with service_role key + x-upsert: true   → goes into bucket 'payment-proofs'
```
Bucket `payment-proofs` is **PRIVATE** (per `supabase-payment-proof.sql:188`: "Public: NO"). Service-role upload still works because RLS is bypassed.

Step 2 — Build URL:
```js
var pubUrl = SUPABASE_URL + '/storage/v1/object/public/payment-proofs/' + encodeURIComponent(path);   // line 1780
```
This is the **public-bucket URL pattern** (`/object/public/...`) — but the bucket is private. Hitting it from a browser returns HTTP 400 / "Bucket is not public".

Step 3 — INSERT into `payment_confirmations` via PostgREST:
```js
var confPayload = {                                  // lines 1783-1796
  order_no: orderNo,
  user_id: data.userId || null,
  amount: data.total,                                // ❌ wrong column (schema = claimed_amount)
  method: 'auto_verified',                            // ❌ violates CHECK (method in 'bank_transfer','paypay')
  image_url: pubUrl,                                  // ❌ wrong column (schema = screenshot_url)
  screenshot_hash: data.ai_screenshot_hash || null,   // ✓
  notes: 'Auto-verified at checkout. ...',           // ❌ wrong column (schema = note)
  ai_status: 'matched',                              // ❌ column doesn't exist in any migration file
  ai_detected_amount: data.ai_detected_amount,       // ❌ wrong column (schema = ai_verified_amount)
  ai_match: true,                                    // ✓
  ai_confidence: 0.95,                               // ✓
  ai_verified_at: new Date().toISOString()           // ✓
};
```
Schema baseline (per `supabase-payment-proof.sql:11-26` + `supabase-ai-payment-verify.sql` + `supabase-manual-approve-payment.sql`):
```
id, order_no, user_id, method, claimed_amount, screenshot_url, screenshot_hash,
file_size, note, status, verified_by, verified_at, rejected_reason, created_at,
ai_verified_amount, ai_match, ai_reason, ai_verified_at, ai_raw_text, ai_confidence,
manual_approver, manual_approve_reason, manual_approved_at
```
`screenshot_url`, `claimed_amount`, `method` are NOT NULL with CHECK constraints — INSERT must FAIL with HTTP 400 unless production schema was relaxed via SQL Editor (no migration file commits this change).

The fetch is wrapped in `muteHttpExceptions: true` and the function only does `Logger.log('Save payment_confirmation: HTTP ' + ...)` at line 1808 — so failures are silent and the order still completes. Anh's report ("a row in payment_confirmations is created") implies production schema has been altered out-of-band to add `image_url`, `amount`, `notes`, `ai_status`, `ai_detected_amount` and to drop NOT NULL on `screenshot_url`. **This needs to be confirmed with a Supabase SELECT.**

---

## Section B — Current display flow (admin clicks order)

`thuythang.html → openOrderModal(orderNo)` (lines 2467-2643).

Lines 2495-2496 — fetch confirmations:
```js
const { data: confs } = await sb.from('payment_confirmations')
  .select('*').eq('order_no', orderNo).order('created_at', { ascending: false });
```

Line 2588 — render the image:
```js
'<a href="' + c.screenshot_url + '" target="_blank">' +
'<img src="' + c.screenshot_url + '" style="...">' +
'</a>'
```

Admin reads the field name **`screenshot_url`**, not `image_url`. No `createSignedUrl` transformation. `<img>` src is whatever string is in the column. If string is `undefined` (because Apps Script wrote `image_url`, not `screenshot_url`), the img tag becomes `<img src="undefined">` which silently fails to render. If string is the public-pattern URL on a private bucket, the browser request returns 400.

For comparison — the **customer manual flow** (`thanh-vien.html:2715-2735`) does it correctly:
```js
const { data: upData } = await sb.storage.from('payment-proofs').upload(path, file, {...});
const { data: urlData } = await sb.storage.from('payment-proofs').createSignedUrl(path, 365 * 86400);
const screenshotUrl = urlData?.signedUrl || path;            // ← signed URL, NOT public pattern
await sb.rpc('submit_payment_confirmation', {                // ← uses RPC with correct schema
  p_screenshot_url: screenshotUrl,
  ...
});
```
That manual-flow image renders fine in the same modal because it (a) writes the canonical column `screenshot_url`, and (b) writes a signed URL the browser can fetch despite the private bucket.

---

## Section C — Identified mismatches / bugs

Two independent bugs combine to make the auto-verify image unreadable, plus several latent column-name mismatches that should also fail unless schema was altered out-of-band.

| # | Bug | Where | Severity |
|---|-----|-------|----------|
| **C1** | **Column name mismatch.** Apps Script writes `image_url`; admin reads `c.screenshot_url`. `c.screenshot_url` is `undefined` for auto-verify rows → `<img src="undefined">` doesn't render. | `google-apps-script.js:1788` vs `thuythang.html:2588` | **Blocker — root cause** |
| **C2** | **Public URL on private bucket.** Apps Script builds `/storage/v1/object/public/payment-proofs/...` but bucket is private (`supabase-payment-proof.sql:188`). Even if C1 were fixed, the browser would get HTTP 400 from Storage. | `google-apps-script.js:1780` | Blocker — also affects `verifyReceiptWithAI_` retry (line 1905 fetches that URL) |
| C3 | Wrong column `amount` (schema = `claimed_amount`). Also `claimed_amount` is NOT NULL → INSERT must 400 unless production schema was loosened. | `google-apps-script.js:1786` | Blocker IF schema unmodified |
| C4 | `method: 'auto_verified'` violates CHECK constraint `method in ('bank_transfer','paypay')`. | `google-apps-script.js:1787` | Blocker IF check still enforced |
| C5 | `screenshot_url` is NOT NULL in baseline; payload omits it. | `google-apps-script.js:1788` | Blocker IF schema unmodified |
| C6 | `notes` vs `note`, `ai_status` (no such column), `ai_detected_amount` vs `ai_verified_amount` — all silently dropped or 400-ing. | `google-apps-script.js:1790-1792` | Data loss / metadata not surfaced in admin badge |
| C7 | `Prefer: return=minimal` + `muteHttpExceptions: true` + only `Logger.log(HTTP code)` means INSERT failures are **completely silent**. Order completes successfully even when the proof row never lands. | `google-apps-script.js:1803-1808` | Hides every other bug above |

Same flaws exist in `savePaymentProofForManualReview_` (`google-apps-script.js:1815-1866`) — uses `manual/` prefix instead of `auto/`, but otherwise identical code, identical bugs.

**Most likely root cause for "image doesn't show":** anh has manually altered production schema to add `image_url` text column (so INSERT no longer 400s and a row IS created), but the admin code still reads `c.screenshot_url`. Even if anh aligned column names, the URL is built with the public pattern against a private bucket, so the `<img>` would still fail to load.

---

## Section D — Recommended fix

### Minimum viable fix (1-2 lines)

Apps Script `savePaymentProofForVerifiedOrder_` line 1780 — switch from public URL pattern to a signed URL, and rename the payload key to match the schema:

**`google-apps-script.js:1780-1796`**
```js
// Replace line 1780 with a signed URL (private bucket compatible):
var signResp = UrlFetchApp.fetch(
  SUPABASE_URL + '/storage/v1/object/sign/payment-proofs/' + encodeURIComponent(path),
  {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' },
    payload: JSON.stringify({ expiresIn: 365 * 86400 }),
    muteHttpExceptions: true
  }
);
var signed = JSON.parse(signResp.getContentText());
var pubUrl = SUPABASE_URL + '/storage/v1' + signed.signedURL;   // signed URL valid 1 year

// Then in confPayload (lines 1783-1796), rename keys to match schema:
var confPayload = {
  order_no: orderNo,
  user_id: data.userId || null,
  claimed_amount: data.total,                    // was: amount
  method: 'bank_transfer',                       // was: 'auto_verified' — must match CHECK
  screenshot_url: pubUrl,                        // was: image_url   ← THE KEY FIX
  screenshot_hash: data.ai_screenshot_hash || null,
  file_size: null,
  note: 'Auto-verified at checkout. AI detected ¥' + (data.ai_detected_amount || data.total).toLocaleString(),  // was: notes
  status: 'verified',
  ai_verified_amount: data.ai_detected_amount || data.total,   // was: ai_detected_amount
  ai_match: true,
  ai_confidence: 0.95,
  ai_verified_at: new Date().toISOString()
};
```

Apply the identical signed-URL + key rename to `savePaymentProofForManualReview_` (lines 1842-1853) — for that one set `status: 'submitted'`, `ai_match: false`, omit AI fields, and put the manual-review note text in `note`.

### Defence-in-depth additions (recommended)

1. Stop swallowing INSERT failures. After `Logger.log` add:
   ```js
   if (confRes.getResponseCode() >= 300) {
     Logger.log('Save proof body: ' + confRes.getContentText().slice(0,500));
     // optional: sendVerifyFailureTelegram_({ type: 'proof_save_failed', ... });
   }
   ```
   Currently any future column-mismatch fails completely silently.

2. Add `Prefer: return=representation` instead of `return=minimal` so production logs show what was inserted.

3. Decide policy: either make the `payment-proofs` bucket public (run `UPDATE storage.buckets SET public=true WHERE id='payment-proofs'`) AND keep `/object/public/...` URLs, OR keep it private AND use signed URLs everywhere. Mixing the two patterns is the source of bug C2. Since `thanh-vien.html` already uses signed URLs, **standardise on signed URLs** — no schema change needed.

4. Reconcile production schema with the migration files: if production has `image_url`, `amount`, `notes`, `ai_status`, `ai_detected_amount` columns, they should be added to a new `supabase-payment-confirmations-v2.sql` migration file (or removed from production). Right now codebase reality and migration files diverge.

5. Long-term: collapse this into a single RPC `auto_save_verified_payment_proof(p_order_no, p_user_id, p_path, p_hash, p_amount, p_ai_detected, p_ai_confidence)` that runs `security definer`, builds the signed URL server-side, and does the INSERT with correct column names. Eliminates an entire class of "Apps Script forgot to rename a column" bugs.
