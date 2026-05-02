# AUDIT — Supabase Storage RLS for `payment-proofs` bucket

**Project**: Bếp Thuỷ Japan
**Date**: 2026-05-02
**Scope**: Read-only audit. No code or SQL changed.
**Trigger**: Admin can't see receipt images in `/thuythang` dashboard. Suspected RLS issue.

---

## TL;DR (read this first)

1. **No storage RLS policy for `payment-proofs` exists in any committed SQL file.** The migration `supabase-payment-proof.sql` only creates the `payment_confirmations` table + table-level RLS. The bucket itself was instructed to be created **manually via the Supabase Dashboard UI as `Public: NO`** (comment at line 188 of `supabase-payment-proof.sql`).
2. **Customer upload still works** because `thanh-vien.html` uses `createSignedUrl(path, 365*86400)` — signed URLs include a JWT token in the query string and bypass `storage.objects` SELECT policies. Apps Script writes use `service_role` key, which bypasses RLS entirely. Both writes are fine.
3. **Admin image rendering is the suspect.** `thuythang.html` line 2588 renders `<img src="' + c.screenshot_url + '">` — it trusts whatever URL was stored in `payment_confirmations.screenshot_url`. If that URL is a `/object/public/...` path (from Apps Script-created rows), and the bucket is private with no public-read policy, the `<img>` will 403.
4. **Most likely root cause**: mismatch between (a) signed URL written by `thanh-vien.html` (works forever-ish, 1-year token) vs. (b) public URL written by `google-apps-script.js` lines 1780 and 1842 (assumes bucket is public — silently broken if bucket is private).

---

## Section A — Current RLS policies (from SQL files)

### A.1. `payment_confirmations` table-level RLS — `supabase-payment-proof.sql`

| Policy name | Operation | Who | Condition |
|---|---|---|---|
| `User reads own confirmations` | SELECT | authenticated | `auth.uid() = user_id` |
| `User inserts own confirmations` | INSERT | authenticated | `auth.uid() = user_id` |
| `Admin reads all confirmations` | SELECT | authenticated | row in `public.admin_users` |
| `Admin updates confirmations` | UPDATE | authenticated | row in `public.admin_users` |

This is the **table** RLS. It controls who can read the row holding `screenshot_url`. Admin reads here are fine — admin can list confirmations and obtain the URL string. The question is whether the URL **resolves** when an `<img>` tag fetches it.

### A.2. `storage.objects` RLS for `payment-proofs` — NONE FOUND

Searched all 24 `supabase-*.sql` files in `K:\bep-thuy-japan\`. Zero hits for `bucket_id = 'payment-proofs'`. No `CREATE POLICY ... ON storage.objects` exists for this bucket in any tracked SQL.

For comparison, `supabase-product-extras.sql` does define 4 storage policies for the `product-images` bucket (public read for `anon`+`authenticated`; admin-only insert/update/delete). That bucket also has `INSERT INTO storage.buckets (id, name, public, ...) VALUES ('product-images', ..., true, ...)` — explicit public flag, in SQL. **`payment-proofs` has neither the bucket row nor the policies in tracked SQL.** Both were created via Dashboard UI per the line-186 comment.

### A.3. Inferred state of `storage.objects` for `payment-proofs`

If anh followed the line-188 instruction literally (`Public: NO`), then **with no policies defined the default is: nobody can SELECT/INSERT/UPDATE/DELETE objects in this bucket via the user/anon API.**

In Supabase, `storage.objects` has RLS enabled by default. With RLS enabled and zero policies:
- `anon` → all ops blocked
- `authenticated` → all ops blocked
- `service_role` → bypasses RLS (so Apps Script still works)
- **Signed URLs** → still work because they hit the storage API with a pre-signed token, not the RLS path

This matches observed behavior: customer upload works (signed URL); Apps Script-side AI verify/auto-upload works (service_role); but **admin browser fetching an image via `<img src="...">` may fail** if the URL is a `/object/public/...` style URL pointing at a private bucket.

---

## Section B — Is the bucket public or private?

**Cannot be determined from the tracked SQL alone — there is no `INSERT INTO storage.buckets (id='payment-proofs', ...)` row anywhere.** Configuration lives only in Supabase's runtime DB.

Evidence pointing each way:

- **Suggests private (intended)**: `supabase-payment-proof.sql` line 188 explicitly tells anh `Public: NO (private)`. `thanh-vien.html` line 2722 uses `createSignedUrl` (only needed if bucket is private — public buckets can use `getPublicUrl`). 
- **Suggests public (current state may differ)**: `google-apps-script.js` lines 1780 and 1842 build URLs of the form `https://.../storage/v1/object/public/payment-proofs/<path>` and store them in `payment_confirmations.image_url`. These URLs only resolve if the bucket is public OR there's a public-read RLS policy. The `thuythang.html` placeholder text at line 711 also references this pattern.

**To verify the actual state**, run this in SQL Editor:

```sql
-- Section B verification (read-only)
SELECT id, name, public, file_size_limit, allowed_mime_types, created_at
FROM storage.buckets
WHERE id = 'payment-proofs';

SELECT polname, polcmd, polroles::regrole[], 
       pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS check_expr
FROM pg_policy
WHERE polrelid = 'storage.objects'::regclass
ORDER BY polname;
```

The `public` column on the first query is the truth.

---

## Section C — Can admin read the receipt images?

### C.1. Three URL flavors get stored in `payment_confirmations.screenshot_url`

1. **Customer-side (thanh-vien.html line 2722)** — signed URL with `?token=...` query string, 1-year expiry. Works regardless of bucket public/private. **OK for admin.**
2. **Apps Script auto-upload (google-apps-script.js line 1780 and 1842)** — `/storage/v1/object/public/payment-proofs/...`. Only works if bucket public. **Breaks for admin if bucket private.**
3. **Manual paste (thuythang.html line 711 placeholder)** — admin pastes a URL by hand. Whatever pattern they paste.

### C.2. What happens in admin's browser

The admin dashboard at `thuythang.html` line 2588 renders:

```html
<a href="' + c.screenshot_url + '" target="_blank">
  <img src="' + c.screenshot_url + '" style="...">
</a>
```

This is a vanilla browser `<img>` fetch with the admin's authenticated session cookie. **The `<img>` request does NOT carry the Supabase JWT** — it goes to `https://<project>.supabase.co/storage/v1/object/...` with no Authorization header. So:

- If URL is `/object/sign/...?token=...` → token validates → image loads.
- If URL is `/object/public/...` AND bucket is public → image loads.
- If URL is `/object/public/...` AND bucket is private → **403 Unauthorized** → broken image icon in admin dashboard.
- If URL is `/object/authenticated/...` → fails for the same no-Authorization-header reason.

### C.3. Recommended live test

In `/thuythang` dashboard, with admin logged in:

1. Open browser DevTools → Network tab.
2. Trigger the section that renders payment confirmations.
3. Filter Network for `payment-proofs`.
4. Check the response status of each image request.
   - **200** → that URL flavor works.
   - **400 / 403** → that URL flavor is broken. Look at the URL: does it contain `/object/public/` or `/object/sign/`?
5. Cross-reference with `payment_confirmations` table:

```sql
-- Section C verification (read-only)
SELECT id, order_no, screenshot_url, 
       CASE 
         WHEN screenshot_url LIKE '%/object/sign/%' THEN 'signed'
         WHEN screenshot_url LIKE '%/object/public/%' THEN 'public'
         WHEN screenshot_url LIKE '%/object/authenticated/%' THEN 'authenticated'
         ELSE 'other'
       END AS url_flavor,
       created_at
FROM public.payment_confirmations
ORDER BY created_at DESC
LIMIT 30;
```

If anh sees a mix of `signed` (newer, from customer browser) and `public` (older or Apps Script auto-uploads), that's the smoking gun.

---

## Section D — SQL fix proposals (do NOT run yet — confirm bucket state in Section B first)

Three options depending on intended security model.

### Option D.1. Make bucket public-read (simplest, least secure)

Anyone with the URL can view. Receipts are not super-sensitive (customer's own bank screenshot), and URLs already contain a Date.now()+8-char-hash randomizer making them hard to guess. This matches the `product-images` pattern.

```sql
-- Make bucket publicly readable (anyone with URL can view)
UPDATE storage.buckets SET public = true WHERE id = 'payment-proofs';

-- Or, if bucket row missing, recreate:
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', true, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- Add public-read policy as belt-and-braces
DROP POLICY IF EXISTS "Public read payment proofs" ON storage.objects;
CREATE POLICY "Public read payment proofs" ON storage.objects
FOR SELECT TO anon, authenticated
USING (bucket_id = 'payment-proofs');
```

### Option D.2. Keep bucket private, add admin-read policy (recommended)

Customer keeps using signed URLs (1-year token). Admin browser gets a new policy that lets `<img>` fetches succeed when an admin session cookie is present. **Note**: bare `<img>` tags still don't send the Supabase JWT, so this only helps if anh switches admin dashboard to use signed URLs at render time. Adding the policy without changing render logic does NOT fix the bug.

```sql
-- Section D.2: Admin-read on payment-proofs (private bucket, JWT-required reads)
DROP POLICY IF EXISTS "Admins read payment proofs" ON storage.objects;
CREATE POLICY "Admins read payment proofs" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
);

-- Customers read their own (folder convention is {user_id}/...)
DROP POLICY IF EXISTS "Users read own payment proofs" ON storage.objects;
CREATE POLICY "Users read own payment proofs" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Customers upload to their own folder
DROP POLICY IF EXISTS "Users upload own payment proofs" ON storage.objects;
CREATE POLICY "Users upload own payment proofs" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

**For the admin dashboard with this option**, change `thuythang.html` line 2588 to call `sb.storage.from('payment-proofs').createSignedUrl(...)` at render time, so each `<img src>` carries a valid token. Otherwise plain `<img>` still 403s. (Code change out of scope for this audit.)

### Option D.3. Hybrid — bucket public, but new uploads go to signed URLs

If anh wants old `/object/public/...` URLs to keep working AND new uploads to be signed: just enable D.1. Customer code already uses signed URLs (which work on a public bucket too — they ignore the public path). No code change needed.

### Recommended path

**Run Option D.1**. Lowest risk to fix the dashboard, matches existing `product-images` pattern, doesn't require touching `thuythang.html` rendering, and Apps Script's `/object/public/...` URLs will resolve. Receipt URLs contain enough randomness (ms-timestamp + 8-char SHA prefix) that guessing is impractical, and `payment_confirmations` table-RLS still gates who can list/discover URLs.

---

## Notes & cross-references

- **Apps Script bypasses RLS via service_role**: confirmed by user note + by inspection of `K:\bep-thuy-japan\google-apps-script.js` lines 1765–1843 (uploads use `SUPABASE_URL + /storage/v1/object/payment-proofs/...` with the service-role bearer set in the request — RLS skipped). This is why writes always succeed.
- **Customer browser uses anon→authenticated session**: confirmed at `K:\bep-thuy-japan\thanh-vien.html` lines 2715, 2722. Uses `createSignedUrl` so does not depend on bucket-level public flag.
- **Admin browser uses authenticated session**: confirmed at `K:\bep-thuy-japan\thuythang.html` line 2588. Renders `<img src>` directly from stored URL — RLS does apply for the storage fetch, and `<img>` does not send the JWT, so private bucket ⇒ 403.
- **Comment at `supabase-payment-proof.sql:188`** is the only documentation of the bucket's intended public flag. SQL itself does not enforce it.

## Files referenced

- `K:\bep-thuy-japan\supabase-payment-proof.sql` (table RLS only; bucket setup deferred to UI)
- `K:\bep-thuy-japan\supabase-product-extras.sql` (template for what payment-proofs policies *could* look like)
- `K:\bep-thuy-japan\supabase-ai-payment-verify.sql` (adds AI columns; no storage policies)
- `K:\bep-thuy-japan\supabase-manual-approve-payment.sql` (manual override columns; no storage policies)
- `K:\bep-thuy-japan\thanh-vien.html` lines 2680–2760 (customer upload + signed URL)
- `K:\bep-thuy-japan\thuythang.html` lines 700–714, 2520–2600 (admin dashboard render)
- `K:\bep-thuy-japan\google-apps-script.js` lines 1750–1850 (Apps Script auto-upload + public URL pattern)
- `K:\bep-thuy-japan\thuyjapan-com-project-v2.md` lines 258–260 (project notes claim "3 RLS policies" — does not match what's in tracked SQL)
- `K:\bep-thuy-japan\TEST-PLAN-VERIFY.md` lines 261–296 (mentions test-fixtures separate bucket)
