# SECURITY AUDIT — Mandatory Phone Update Flow (post-duplicate-clear)

- **Auditor**: Agent 7/10 (Security review for mandatory phone update changes)
- **Date**: 2026-05-03
- **Scope**: Resolve-duplicate-phones SQL + RPC `update_user_phone` + frontend mandatory modal
- **Files in scope**:
  - `K:\bep-thuy-japan\supabase-phone-resolve-duplicates.sql` (BACKUP table `_phone_dup_backup_2026_05_03` + UPDATE clearing 18 accounts)
  - `K:\bep-thuy-japan\supabase-update-user-phone-rpc.sql` (RPC granted to `authenticated`)
  - `K:\bep-thuy-japan\thanh-vien.html` (modal `phone-update-modal`, `checkAndPromptPhoneUpdate`, `submitPhoneUpdate`)
- **Related docs reviewed**:
  - `K:\bep-thuy-japan\CUSTOMER-OUTREACH-DUPLICATE-PHONE.md` (privacy notice templates)
  - `K:\bep-thuy-japan\privacy.html` (APPI/GDPR clauses)
  - `K:\bep-thuy-japan\SECURITY-AUDIT-PHONE-LOGIN-V2.md` (prior audit — companion piece)
- **Threat model**: Public-facing consumer site (Vietnamese diaspora in Japan). Phone numbers = PII. Adversary class: opportunistic enumerator / scraper / curious authenticated customer; not a targeted nation-state actor.

---

## Summary at a glance

| Concern | Severity | Status |
|---|---|---|
| RLS on backup table `_phone_dup_backup_2026_05_03` | OK | RLS enabled + grants revoked inline (lines 44-45) |
| RPC `update_user_phone` enables phone enumeration via `DUPLICATE` message | **MEDIUM** | Trade-off; not deployed yet, recommendation below |
| RPC `update_user_phone` not rate-limited at app level | **MEDIUM** | Mitigated by auth requirement + Supabase platform limits |
| `DUPLICATE` message leaks owner uid? | OK | Verified — only boolean fact "đã được tài khoản khác sử dụng" leaks |
| Frontend modal can be DOM-bypassed | OK | UX-only nudge; server is the gate |
| XSS via `reason` in modal | OK | `textContent` (line 1990) — DOM-safe |
| Audit log of phone updates | LOW | Acceptable — not a credentialed action |
| APPI/GDPR notice for 18 cleared accounts | LOW | Outreach plan exists; one improvement recommended |
| Schedule to DROP backup table | **MEDIUM** | 60-day plan documented but no calendar reminder yet |
| `SECURITY DEFINER` + `SET search_path` on RPC | OK | Defensive search_path set |
| SQL injection in RPC | OK | Parameterized + builtins only |
| `prof-phone` form bypass of unique check | LOW | `saveProfile` writes direct UPDATE — relies on UNIQUE INDEX backstop |

---

## Security Findings

### Secure items

- **Backup table RLS is enabled inline in the SQL itself**. `supabase-phone-resolve-duplicates.sql:43-45`:
  ```sql
  ALTER TABLE public._phone_dup_backup_2026_05_03 ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public._phone_dup_backup_2026_05_03 FROM anon, authenticated;
  ```
  This is a direct improvement over the V2 backfill table audited last time, where RLS was missing and had to be added as a HIGH-priority recommendation. **Anh applied the lesson from prior audit — well done.** Once Block 1 runs, the table cannot be queried through PostgREST by `anon` or `authenticated` roles. Only `service_role` retains access, which is correct.

- **RPC `update_user_phone` uses `SECURITY DEFINER` correctly**. `supabase-update-user-phone-rpc.sql:19-20`:
  ```sql
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
  ```
  Defensive `search_path` is set, preventing the classic SECURITY DEFINER hijack attack where a malicious schema shadows `profiles` or `auth.users`.

- **RPC requires authentication before doing anything else**. Lines 28-35:
  ```sql
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED', ...);
  END IF;
  ```
  And `GRANT EXECUTE ... TO authenticated` (line 104) — `anon` cannot call this. So the `DUPLICATE` enumeration concern below is bounded by "must have a valid Bếp Thuỷ account first".

- **RPC writes only the caller's own row**. Line 78-80:
  ```sql
  UPDATE public.profiles SET phone = v_normalized WHERE id = v_uid;
  ```
  `v_uid := auth.uid()` and is never substituted by user-controlled input. Attacker cannot pivot to overwrite another user's phone.

- **Race condition is handled with `EXCEPTION WHEN unique_violation`**. Lines 81-88. Even if two clients try to claim the same phone simultaneously and the SELECT precheck (Step 5) both return NULL, the UNIQUE INDEX on `profiles.phone` (`idx_profiles_phone_unique` from `supabase-phone-login.sql`) will reject the loser with a clean error message rather than crashing the function.

- **DUPLICATE message does NOT leak the uid of the user who owns the phone**. The pre-check selects `id INTO v_existing_uid` but never includes that uid in the response (line 68-74). Only the boolean "this phone is taken" is exposed. Same for the EXCEPTION branch (line 83-87). No email, no display_name, no customer_code is ever leaked through this RPC.

- **Strict regex `^0\d{10}$` blocks fishing with prefixes**. Line 53. Same anti-enumeration property as `find_email_by_phone`. Cannot probe with `01`, `0904`, etc.

- **Phone normalization is whitelist-based** (`regexp_replace(p_phone, '\D', '', 'g')` line 47, then strict regex). No way to slip a SQL injection or weird Unicode; all non-digits are stripped before the regex check.

- **GRANT scope is minimum-privilege**. Line 103-104: `REVOKE ALL FROM PUBLIC`, then `GRANT EXECUTE TO authenticated` only. `anon` cannot call. This is correct for a "must be logged in" feature.

- **Modal `reason` text uses `textContent`, not `innerHTML`** — `thanh-vien.html:1990`:
  ```js
  document.getElementById('phone-update-reason').textContent = reason;
  ```
  Even if `reason` later started embedding user-controlled data (e.g., the user's old `phone` from `currentProfile.phone`, line 1986), DOM-injecting `<script>` would not execute. **No XSS surface here.**

- **Backup table `INSERT ... ON CONFLICT (id) DO NOTHING`** (line 61) — idempotent, anh can re-run Block 1 without duplicating rows. Reduces operator-error blast radius.

- **Block 2 UPDATE re-derives the duplicate set independently** (lines 78-82) rather than trusting the backup table to drive the clearing. This means if Block 1 fails partway through, Block 2 still clears the right set. Nice defensive pattern.

- **Rollback plan exists** (lines 119-125). Commented-out by default to avoid accidents, restorable if Block 4 finds anh cleared the wrong row.

- **Frontend reminder banner is non-blocking**. After dismiss, the user gets a subtle yellow banner (`#phone-update-reminder` line 593-596) instead of being locked out. Good UX/security balance — security is enforced server-side via UNIQUE INDEX and the RPC, not by the modal.

- **CSV export query (Block 4) joins `_phone_dup_backup_2026_05_03` with `profiles`** but is admin-only (run from Supabase dashboard, not exposed). Plain SQL anh runs once locally.

- **Rate-limit existence**: Although not application-level, Supabase platform applies PostgREST rate limits. RPC requires auth, so an attacker has to burn account creation captchas first.

---

### Concerns

#### Concern #1 — RPC `DUPLICATE` response is a phone-enumeration oracle (severity **MEDIUM**)

- **Risk vector**: Once authenticated, any customer can call `update_user_phone(p_phone)` repeatedly. Step 5 (lines 62-74) responds with `error: 'DUPLICATE'` if the phone is taken, or proceeds to UPDATE if not. By feeding 11-digit candidates and inspecting the response, the attacker enumerates the phone-number set of Bếp Thuỷ Japan customers.
- **Likelihood**: **Low–Medium**. Attacker needs:
  1. A valid customer account (creates one for free, but one-account-per-email + hCaptcha + email verification raises the bar)
  2. To probe many candidate phones — JP mobile namespace 10^10, but if attacker has a list of phones from another breach, targeted lookup is feasible
  3. Each successful claim *takes* the phone from the attacker's account (since UPDATE proceeds on non-DUPLICATE) — there is a self-defeating mechanic: every time the answer is "available", the attacker actually consumes it. So attacker can only ask the question if they're willing to either (a) keep their phone field churning, or (b) deliberately submit only known-bad / known-bad-format candidates so the regex rejects before UPDATE.
  - Crucially: **the attacker cannot set `p_phone` to a candidate and learn it's taken without overwriting their own phone if it's available.** This is a hidden but real mitigation — accidental rate-limiter via self-destructive probing. Worth calling out: the current design is more enumeration-resistant than it first appears.
- **Impact**: Membership disclosure — attacker can check "is this specific phone a Bếp Thuỷ customer". Not credential access.
- **Mitigation currently in place**:
  - Auth required (no anon abuse)
  - Strict regex `^0\d{10}$` blocks fishing prefixes
  - Self-overwrite mechanic limits sustained probing
  - Supabase platform rate-limit on PostgREST
- **Suggested action** (in priority order):
  - **Option A — accept the risk** (recommended for soft launch): Document this in the V8 handover. Risk is bounded by self-overwrite mechanic + auth gate. Wait for Supabase Logs evidence of abuse before tightening.
  - **Option B — read-only probe RPC** (`is_phone_taken(p_phone)` returning boolean) — DON'T add. It would *worsen* the oracle by removing the self-overwrite cost. Anh should explicitly NOT introduce this.
  - **Option C — add per-user rate limit at app level**: Track last-call timestamp per uid in a small table. Limit to e.g. 5 calls per hour. Adds complexity; not needed for current scale.
  - **Option D — server-side phone change cooldown**: After a successful update, refuse another `update_user_phone` call from same uid for N minutes. Combines with self-overwrite mitigation to make probing essentially infeasible. **Recommended if abuse appears post-deploy.**

#### Concern #2 — Backup table retention policy is documented but has no automated reminder (severity **MEDIUM**)

- **Risk vector**: `_phone_dup_backup_2026_05_03` contains email + display_name + phone for 18 accounts. APPI principle: data retention should be no longer than necessary. The outreach doc mentions "DROP backup table sau 60 ngày" (`CUSTOMER-OUTREACH-DUPLICATE-PHONE.md:188-191`), but there is no calendar reminder, cron job, or scheduled task. If anh forgets, this PII sits indefinitely.
- **Likelihood**: **Medium** — easy to forget given the volume of work in V7/V8.
- **Impact**: Indefinite retention of cleared phone numbers + emails for 18 customers. Increases blast radius if `service_role` key ever leaks.
- **Mitigation currently in place**: Documented intent only.
- **Suggested action**:
  1. Add to `pending_thuyjapan_action_items.md` (memory file) a TODO with date `2026-07-02` (60 days post-clear): "DROP TABLE public._phone_dup_backup_2026_05_03".
  2. Or use Supabase pg_cron to schedule the DROP automatically:
     ```sql
     SELECT cron.schedule(
       'drop_phone_dup_backup',
       '0 9 2 7 *',  -- 9 AM JST on July 2
       'DROP TABLE IF EXISTS public._phone_dup_backup_2026_05_03;'
     );
     ```
  3. Same recommendation applies to `_phone_backfill_backup_2026_05_03` from V2 backfill — pair them.

#### Concern #3 — No application-level rate limit on `update_user_phone` RPC (severity **MEDIUM**)

- **Risk vector**: Combined with Concern #1, an attacker who is willing to consume their phone slot can enumerate. Even without enumeration, an attacker could spam UPDATEs to (a) waste DB resources or (b) repeatedly trigger the trigger chain (normalize_phone trigger fires on every UPDATE).
- **Likelihood**: **Low**. Auth-gated + Supabase platform throttling. Not abuse-proof but generous.
- **Impact**: Resource burn; not data leak.
- **Mitigation currently in place**: Supabase platform PostgREST limits.
- **Suggested action**: Skip unless abuse appears. If implementing: see Concern #1 Option D (per-user cooldown after successful update).

#### Concern #4 — `saveProfile()` direct UPDATE path bypasses RPC validation (severity **LOW**)

- **Risk vector**: `thanh-vien.html:2569` — `saveProfile` does `sb.from('profiles').update({display_name, phone, ...})` directly. This bypasses `update_user_phone` and goes through PostgREST UPDATE (subject to RLS + UNIQUE INDEX, but NOT the `^0\d{10}$` regex enforced by the RPC).
- **Likelihood**: **Low**. The `normalize_phone` trigger from `supabase-phone-login.sql` re-runs on every UPDATE and sets phone to NULL if it doesn't match `^0\d{10}$` after normalization. So a malformed phone slipping through here ends up NULL, not malformed. **Defense-in-depth holds.**
- **Impact**: User can intentionally null their phone via the profile form. Not a security issue (they own their data).
- **Mitigation currently in place**: `normalize_phone` trigger.
- **Suggested action**: None required. Optional cleanup: route `saveProfile` through `update_user_phone` for consistency, but it's not a security concern.

#### Concern #5 — Modal `reason` interpolation includes user-controlled `phone` value (severity **LOW**)

- **Risk vector**: Line 1986 — `reason = '... Số hiện tại của anh/chị: ' + phone`. `phone` comes from `currentProfile.phone` (DB field). If an attacker has previously set their own `profiles.phone` to malicious content (e.g., via direct API call before unique constraint, or pre-clear-up state), it would be string-concatenated into `reason`.
- **Likelihood**: **Very Low**. (a) `normalize_phone` trigger strips non-digits on every write. (b) `reason` is rendered with `textContent`, NOT `innerHTML`. So even if `phone = '<script>alert(1)</script>'` got into the DB (impossible given the trigger), it would render as plain text.
- **Impact**: None.
- **Mitigation currently in place**: `textContent` + `normalize_phone` trigger.
- **Suggested action**: None.

#### Concern #6 — Outreach email template arguably under-discloses the privacy event (severity **LOW**)

- **Risk vector**: APPI requires meaningful notice when handling personal data — including correction or deletion. The Bếp Thuỷ outreach (`CUSTOMER-OUTREACH-DUPLICATE-PHONE.md` Email Template) tells the customer *what* happened ("đã tạm xoá số đt khỏi tài khoản") and *what to do* (re-enter), but does NOT explicitly disclose:
  - That the phone was preserved in a backup table for 60 days
  - That `email + display_name + cleared_phone` is in `_phone_dup_backup_2026_05_03`
  - The customer's right to request immediate deletion (APPI Article 30 — request to stop use, delete)
- **Likelihood**: **Low** — APPI complaint requires customer actively complains. Bếp Thuỷ's customer base is friendly diaspora, not litigious.
- **Impact**: Minor regulatory exposure if a JP regulator audits and finds the notice insufficient.
- **Mitigation currently in place**: `privacy.html:253-260` general APPI notice exists. Outreach references customer service contact (Zalo).
- **Suggested action** (low priority, anh decides):
  - Add one sentence to the email template:
    > "Số đt cũ của anh/chị tạm thời được lưu ở bảng backup nội bộ trong 60 ngày để em rollback nếu cần, sau đó sẽ tự động xoá vĩnh viễn. Nếu anh/chị muốn em xoá ngay không cần backup, nhắn em qua Zalo nhé ạ."
  - This satisfies APPI Articles 24/27 transparency expectation and aligns with `privacy.html` clauses.

#### Concern #7 — No audit log of who triggered the phone-update RPC (severity **LOW**)

- **Risk vector**: After deployment, anh has no native record of which uids called `update_user_phone`, when, with what input, success/failure. If a customer later disputes "tôi không update phone", anh can only point to the current `profiles.phone` value.
- **Likelihood**: **Very Low**. Phone update is non-credentialed; impact of disputes is small.
- **Impact**: Operational accountability gap.
- **Mitigation currently in place**: Supabase Postgres logs capture function calls (debug level), but not at INFO by default.
- **Suggested action**: Skip — explicitly acceptable per anh's spec for non-critical action. If later anh wants this:
  - Add an `INSERT INTO _phone_update_audit_log (uid, old_phone, new_phone, called_at) VALUES (v_uid, (SELECT phone FROM profiles WHERE id = v_uid), v_normalized, now());` step inside the RPC before Step 6.
  - Or rely on Supabase's auth.audit_log_entries — not the same surface, but adjacent.

---

## RECOMMENDED ACTIONS (anh nên làm)

Ordered by priority:

1. **[MEDIUM — schedule before forgetting]** Set 2026-07-02 reminder to DROP both backup tables:
   ```sql
   DROP TABLE IF EXISTS public._phone_dup_backup_2026_05_03;
   DROP TABLE IF EXISTS public._phone_backfill_backup_2026_05_03;
   ```
   Add to `pending_thuyjapan_action_items.md` with the exact date. Or use `pg_cron` (Concern #2 snippet above).

2. **[MEDIUM — monitor 7 days post-deploy]** Watch Supabase Logs for `update_user_phone` abuse:
   - Dashboard → Logs → API → filter `/rpc/update_user_phone`
   - Flag any single `auth.uid` calling > 10 times in 1 hour, or > 50 times in 24 hours
   - If abuse appears: implement Concern #1 Option D (server-side cooldown after successful update)

3. **[LOW — within 7 days, optional]** Augment outreach email with APPI-style transparency note (Concern #6 suggested sentence). Pure compliance polish; customer experience unchanged.

4. **[LOW — verify after Block 1 runs]** Confirm RLS actually applied:
   ```sql
   SELECT relname, relrowsecurity
     FROM pg_class
    WHERE relname = '_phone_dup_backup_2026_05_03';
   -- expect relrowsecurity = t
   
   SELECT grantee, privilege_type
     FROM information_schema.role_table_grants
    WHERE table_name = '_phone_dup_backup_2026_05_03';
   -- should NOT contain anon or authenticated
   ```

5. **[LOW — operational hygiene]** When anh exports CSV from Block 4 for outreach:
   - Save to encrypted location (KeePass attachment, BitLocker drive)
   - Delete after outreach is done
   - Same rule as V2 audit Block 6 export

6. **[INFO — health check, optional]** Weekly verification query:
   ```sql
   -- catch any malformed phone that bypassed trigger
   SELECT count(*) FROM public.profiles
    WHERE phone IS NOT NULL AND phone !~ '^0\d{10}$';
   -- expect 0
   
   -- catch any new duplicate phone that bypassed UNIQUE INDEX
   SELECT phone, count(*) FROM public.profiles
    WHERE phone IS NOT NULL AND phone <> ''
    GROUP BY phone HAVING count(*) > 1;
   -- expect 0 rows
   ```

---

## Overall Security Verdict

**SECURE — ship as-is, with monitoring plan in Action #2**

This change is materially more secure than its V2 predecessor (audited in `SECURITY-AUDIT-PHONE-LOGIN-V2.md`):

- The backup table now has RLS + grants revoked **inline in the SQL itself** — closing the HIGH severity gap from the prior audit. Anh applied the lesson; the dangerous "PostgREST exposes new public-schema table" trap is closed by construction this time.
- The RPC is auth-gated (`authenticated` only, not `anon`), `SECURITY DEFINER` with `search_path` set, parameterized, and uses race-safe `EXCEPTION WHEN unique_violation` as a backstop for the SELECT pre-check.
- The `DUPLICATE` response, while technically an enumeration oracle, has a built-in self-overwrite mitigation that materially reduces feasibility. An attacker probing for "is this phone a Bếp Thuỷ customer" must overwrite their own phone to ask each question — a hidden but elegant disincentive.
- The frontend modal is correctly framed as a UX nudge, not a security gate. DOM-bypass is meaningless because the server (UNIQUE INDEX + `normalize_phone` trigger + RPC validation) is the gate.

Open items are in the MEDIUM-LOW band and can be addressed post-deploy without blocking ship:
- Calendar reminder for backup-table DROP (Concern #2 / Action #1)
- 7-day abuse monitoring on the RPC (Concern #1 / Action #2)
- One sentence of APPI transparency in outreach email (Concern #6 / Action #3 — optional)

No HIGH severity findings. Anh có thể ship ngay sau khi chạy SQL migration.

---

## Appendix A — Files reviewed

- `K:\bep-thuy-japan\supabase-phone-resolve-duplicates.sql` (full file, 151 lines)
- `K:\bep-thuy-japan\supabase-update-user-phone-rpc.sql` (full file, 136 lines)
- `K:\bep-thuy-japan\thanh-vien.html` lines 580-616 (modal markup), 1955-2075 (modal logic + RPC call), 2510-2535 (init hook calling `checkAndPromptPhoneUpdate`), 2548-2585 (`saveProfile` direct-UPDATE path)
- `K:\bep-thuy-japan\CUSTOMER-OUTREACH-DUPLICATE-PHONE.md` (full file, 201 lines)
- `K:\bep-thuy-japan\privacy.html` lines 99-260 (APPI clauses)
- `K:\bep-thuy-japan\supabase-phone-login.sql` lines 38-55 (UNIQUE INDEX + `normalize_phone` trigger that backstops `saveProfile` direct path)
- `K:\bep-thuy-japan\SECURITY-AUDIT-PHONE-LOGIN-V2.md` (companion prior audit)

## Appendix B — Method note

Audit performed by static review of source files. Auditor did NOT execute queries against the live Supabase database. Assumptions about runtime DB state (e.g., `idx_profiles_phone_unique` exists, `normalize_phone` trigger active) are based on reading the V1/V2 SQL files and trusting they were applied per the V7 handover doc. Anh nên chạy verification queries from Action #4 after Block 1 to confirm RLS state matches what the SQL file declares.

## Appendix C — Differences from V2 audit

| Item | V2 audit (backfill) | This audit (resolve-duplicates + RPC) |
|---|---|---|
| Backup table RLS | **HIGH** — missing in SQL, action required | OK — inline in SQL (lines 44-45) |
| Phone enumeration oracle | MEDIUM (anon RPC) | MEDIUM (auth RPC, but with self-overwrite mitigation) |
| RPC rate limit | MEDIUM | MEDIUM (auth gate raises bar, similar mitigation status) |
| SQL injection | OK | OK |
| SECURITY DEFINER hygiene | OK | OK |
| Frontend regex framing | OK | OK |
| Audit log of writes | LOW | LOW (acceptable per anh's spec) |
| Outreach privacy notice | not in scope | LOW (one suggested sentence) |
| Backup-table DROP schedule | LOW (30-day plan) | MEDIUM (60-day plan; needs reminder) |

Net: this change ships at a better security posture than V2. The single HIGH gap from V2 is closed; new MEDIUM concerns are scale-and-monitor rather than block-ship.
