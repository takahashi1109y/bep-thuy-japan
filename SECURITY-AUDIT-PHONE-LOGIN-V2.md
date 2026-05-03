# SECURITY AUDIT — Phone Login V2

- **Auditor**: Agent 7/10 (Security review for phone login changes)
- **Date**: 2026-05-03
- **Scope**: Phone login flow refactor (frontend strict validation + backend RPC strict 11 digits + backfill backup table)
- **Files in scope**:
  - `K:\bep-thuy-japan\thanh-vien.html` (frontend validation, 3 errors split, RPC call)
  - `K:\bep-thuy-japan\supabase-phone-login-v2.sql` (RPC `find_email_by_phone` + trigger `normalize_phone`, strict 11 digits)
  - `K:\bep-thuy-japan\supabase-phone-backfill.sql` (backup table `_phone_backfill_backup_2026_05_03` + UPDATE backfill)
- **Threat model**: Public-facing login on a consumer site (Vietnamese diaspora in Japan). Phone numbers = PII. Adversary class: opportunistic enumerator / scraper, not a targeted nation-state attacker.

---

## Summary at a glance

| Concern | Severity | Status |
|---|---|---|
| RLS on backup table `_phone_backfill_backup_2026_05_03` | **HIGH** | Action required before next deploy |
| Phone enumeration via "chưa đăng ký" message | **MEDIUM** | Trade-off; monitor 7 days post-deploy |
| Brute-force feasibility on 11-digit JP mobile | **LOW** | Mitigated by Supabase rate limit + hCaptcha |
| RPC `find_email_by_phone` strict regex (anti-enum) | OK | Verified in source |
| SQL injection in RPC | OK | Parameterized, builtin functions only |
| `SECURITY DEFINER` + `SET search_path` | OK | Defensive search_path set |
| Frontend regex (UX vs security) | OK | Backend is the gate |
| CORS / CSP | OK | Same-origin Supabase JS client |
| Supabase Auth logging | OK | Failed attempts logged |
| Backfill audit log | LOW | Backup table is the audit trail |

---

## Security Findings

### ✅ Secure

- **RPC anti-enumeration regex**: `find_email_by_phone` rejects everything that does not match `^0\d{10}$` after normalization. Attacker cannot fish with a 6-digit prefix or partial. Verified at `supabase-phone-login-v2.sql:93`.
- **Defensive `search_path` on SECURITY DEFINER**: RPC has `SET search_path = public, auth` (line 72), preventing search_path-hijack attacks where a malicious schema shadows `profiles` or `auth.users`. This is the correct pattern.
- **Parameterized queries**: RPC takes `p_phone text` and uses parameterized SELECT (`WHERE p.phone = v_normalized`). All transformations use `regexp_replace`, `substring`, `length` — Postgres builtins, not string concatenation. **No SQL injection vector.**
- **Output minimization**: RPC returns ONLY `email`, never the whole profile row. Cannot leak `display_name`, `address`, `customer_code`, `points`, etc. through this surface.
- **Frontend regex is UX, not security**: `PHONE_REGEX = /^0\d{10}$/` at `thanh-vien.html:1597` is correctly used as input validation only. Backend RPC is the actual gate. Even if attacker bypasses JS, RPC strict regex still blocks. Confirmed.
- **hCaptcha before login**: `captchaToken` checked before `signInWithPassword` (line 1611-1617) and passed via `options.captchaToken`. Blocks headless bots even if they try to brute-force the auth endpoint.
- **Same-origin Supabase calls**: RPC goes through Supabase JS client to `curcsvwvjkjewtonkhnr.supabase.co`. CORS is managed by Supabase platform. No CSP-bypass surface introduced by this change.
- **Failed login logging**: `auth.signInWithPassword` failures land in Supabase Auth Logs by default — so post-mortem of credential stuffing is possible.
- **GRANT scope is correct**: `GRANT EXECUTE ... TO anon, authenticated`. This MUST be granted to `anon` because login happens before authentication. Cannot tighten further without breaking the login flow itself.
- **Backup table is idempotent + uses `ON CONFLICT DO NOTHING`**: Re-running Block 3 of backfill won't duplicate rows. Reduces risk of operator mistakes during ops.
- **Trigger `normalize_phone` is a DB-level safety net**: Even if frontend validation is bypassed, the trigger sets phone to NULL when the format is invalid (line 49-55). Defense-in-depth.

---

### ⚠️ Concerns

#### Concern #1 — Backup table `_phone_backfill_backup_2026_05_03` may have no RLS  (severity **HIGH**)

- **Risk vector**: `CREATE TABLE IF NOT EXISTS public._phone_backfill_backup_2026_05_03 (...)` at `supabase-phone-backfill.sql:104-109` creates a new table in the `public` schema. By default in Supabase, **a new public-schema table has Row Level Security DISABLED** until explicitly enabled. Until anh enables RLS:
  - The table is reachable through PostgREST as endpoint `/rest/v1/_phone_backfill_backup_2026_05_03`.
  - The default `anon` and `authenticated` roles have SELECT privilege on public-schema tables unless DBA revokes.
  - If a single `authenticated` user (any logged-in customer) sends `GET /rest/v1/_phone_backfill_backup_2026_05_03?select=*`, they get every customer's `phone_original` and `phone_new` — a full PII dump.
- **Likelihood**: **Medium**. Anyone with a free customer account can try, and the table name is now in a JS-served HTML page repository (so any future leak of the SQL file = recipe). Not yet exploited, but trivial once known.
- **Impact**: **High**. This is a full PII leak — every customer phone number, including any phone that the trigger later set to NULL but whose original is preserved in `phone_original`.
- **Mitigation currently in place**: None in the SQL file. The auditor cannot confirm DB state without running queries against Supabase. **Assumption: RLS is OFF on this new table.**
- **Suggested action**:
  1. Run on Supabase NOW (idempotent, safe to re-run):
     ```sql
     ALTER TABLE public._phone_backfill_backup_2026_05_03 ENABLE ROW LEVEL SECURITY;
     REVOKE ALL ON public._phone_backfill_backup_2026_05_03 FROM anon, authenticated;
     -- only service_role retains access automatically
     ```
  2. Verify with: `SELECT relname, relrowsecurity FROM pg_class WHERE relname = '_phone_backfill_backup_2026_05_03';` — must show `relrowsecurity = true`.
  3. **Schedule a hard delete in 30 days**: After 30 days post-backfill (i.e. on 2026-06-02), DROP this table:
     ```sql
     DROP TABLE IF EXISTS public._phone_backfill_backup_2026_05_03;
     ```
     30 days is enough buffer to validate the backfill and roll back if needed; longer than that is unjustified PII retention.

#### Concern #2 — "Số điện thoại X chưa đăng ký tài khoản" reveals registration status  (severity **MEDIUM**)

- **Risk vector**: At `thanh-vien.html:1653`, the message
  > `Số điện thoại ' + identifier + ' chưa đăng ký tài khoản.`
  reveals that a phone is NOT in the database. By inversion, the **absence** of this message (and instead getting an "Email/password incorrect" message) tells the attacker the phone IS registered. This converts a feasibility-bounded brute-force (10^10 namespace) into an existence oracle that can map phone → "customer of Bếp Thuỷ Japan".
- **Likelihood**: **Low–Medium**. JP mobile namespace is 10^10 ≈ 10 billion combinations — pure brute-force is infeasible. But targeted enumeration (e.g. attacker has a list of phone numbers from another breach and wants to know which are Bếp Thuỷ customers) IS feasible.
- **Impact**: Membership disclosure. An attacker can build a list of "users of this Vietnamese-food site in Japan" — modest privacy harm, not credentialed access.
- **Mitigation currently in place**:
  - Supabase Auth default rate limit on the Auth API (`/token?grant_type=password`) is approximately 30 req/min per IP. RPC calls go through PostgREST which has a separate, more permissive limit — **needs verification.**
  - hCaptcha gates login but does NOT gate the RPC (RPC fires before captcha doesn't matter — RPC is called before signInWithPassword too, but it is in the same form submission so captcha is solved first).
  - Strict regex on RPC blocks fishing with prefixes.
- **Suggested action** (anh can choose based on UX preference):
  - **Option A — keep current message, monitor abuse** (recommended for soft launch): Watch Supabase Logs for any single IP making >30 RPC calls/minute over a sustained window. If abuse appears, switch to Option B.
  - **Option B — generic message**: Change line 1653 to something like:
    > `Số điện thoại hoặc mật khẩu không đúng. Anh/chị kiểm tra lại hoặc dùng email để đăng nhập.`
    Loses the helpful "phone not registered" UX cue but eliminates the oracle.
  - **Option C — add per-IP rate limit on RPC** (best of both): If supabase-edge-rate-limit or a Cloudflare WAF rule is feasible, throttle `/rest/v1/rpc/find_email_by_phone` to ~10 req/min per IP. This makes enumeration cost-prohibitive while keeping the UX message.

#### Concern #3 — RPC `find_email_by_phone` is not rate-limited at application level  (severity **MEDIUM**)

- **Risk vector**: The RPC is `GRANT`ed to `anon`. An attacker with no account, no captcha, can call it repeatedly until Supabase platform rate-limit kicks in. There is no application-level throttle in `find_email_by_phone` itself (no last-call timestamp table, no per-IP counter).
- **Likelihood**: **Medium**. Default Supabase platform limits exist but are generous (PostgREST default ~200 req/sec global, scaled by plan). Not abuse-proof on free/pro tier.
- **Impact**: Combined with Concern #2 above — accelerates the enumeration oracle.
- **Mitigation currently in place**: Supabase platform-level limits (uncertain exact values, depends on plan).
- **Suggested action**:
  - Confirm current rate-limit configuration: Supabase Dashboard → Settings → API → Rate limiting.
  - If on Pro/Free plan, consider adding hCaptcha **before the RPC call** as well, not just before `signInWithPassword`. This is a minor UX cost (1 captcha per login attempt regardless of method) but kills the headless-bot enum vector entirely.

#### Concern #4 — Backfill produces no separate audit log; backup table is the only trace  (severity **LOW**)

- **Risk vector**: If a malicious actor with `service_role` (or compromised Supabase API key) drops `_phone_backfill_backup_2026_05_03` after tampering with `profiles.phone`, there is no other record of the original phone values. Only the backup table itself is the audit trail.
- **Likelihood**: **Very Low**. Requires `service_role` key compromise — bigger problems than backfill at that point.
- **Impact**: Loss of rollback capability + difficulty proving compliance if questioned about phone changes.
- **Mitigation currently in place**: Backup table preserves the snapshot.
- **Suggested action**: Optional. If anh wants compliance-grade audit:
  - Export the backup table to CSV after backfill, store offline (Google Drive personal, encrypted).
  - Or set up Supabase logs export to a separate analytics workspace.
  - Acceptable to skip — risk is low for a small consumer site.

#### Concern #5 — `display_name` and `customer_code` exposed in Block 6 export query  (severity **LOW** — operational, not deployed)

- **Risk vector**: `supabase-phone-backfill.sql:193-205` is an admin-only SELECT for CSV export. If anh runs it and the result is screenshotted/shared, names + customer codes + phones leak together.
- **Likelihood**: **Low**. Anh runs this once, locally, from the Supabase dashboard.
- **Impact**: Operational hygiene — not a deployed surface.
- **Mitigation currently in place**: Block 6 is plain SQL anh runs manually; Supabase dashboard is auth-gated.
- **Suggested action**: When anh exports the CSV, treat it like payroll data — store encrypted, delete after the contact-customer task is done.

---

## RECOMMENDED ACTIONS (anh nên làm)

Ordered by priority:

1. **[HIGH — do BEFORE next user logs in]** Enable RLS + revoke grants on backup table:
   ```sql
   ALTER TABLE public._phone_backfill_backup_2026_05_03 ENABLE ROW LEVEL SECURITY;
   REVOKE ALL ON public._phone_backfill_backup_2026_05_03 FROM anon, authenticated;
   ```
   Verify with:
   ```sql
   SELECT relname, relrowsecurity FROM pg_class WHERE relname = '_phone_backfill_backup_2026_05_03';
   -- expect relrowsecurity = t
   SELECT grantee, privilege_type FROM information_schema.role_table_grants
    WHERE table_name = '_phone_backfill_backup_2026_05_03';
   -- should NOT contain anon or authenticated
   ```

2. **[HIGH — calendar reminder for 2026-06-02]** Drop backup table after 30 days:
   ```sql
   DROP TABLE IF EXISTS public._phone_backfill_backup_2026_05_03;
   ```
   Anh viết note vào reminder hoặc trong handover doc V8.

3. **[MEDIUM — within 7 days]** Monitor Supabase Logs for RPC abuse:
   - Dashboard → Logs → API → filter by `/rpc/find_email_by_phone`.
   - Flag any single IP with >30 calls/min sustained over 5+ minutes.
   - If abuse appears: implement Concern #2 Option B (generic error message) or Option C (rate-limit at WAF level).

4. **[MEDIUM — within 7 days]** Verify Supabase Auth + PostgREST rate limit settings:
   - Dashboard → Settings → API → Rate Limiting.
   - Document exact limits in handover V7/V8.
   - If RPC limit > 30 req/min per IP, consider tightening or adding captcha-before-RPC.

5. **[LOW — operational hygiene]** When exporting Block 6 CSV (customers needing phone re-entry):
   - Save to encrypted location (KeePass attachment, encrypted USB, or BitLocker drive).
   - Delete after the "contact customer" task is finished.

6. **[LOW — optional]** Add a "phone re-validation" health-check query to the V8 handover doc:
   ```sql
   -- run weekly to catch any malformed phone that bypassed trigger
   SELECT count(*) FROM profiles
    WHERE phone IS NOT NULL AND phone !~ '^0\d{10}$';
   -- expect 0
   ```

---

## Overall Security Verdict

**[X] SECURE WITH MITIGATIONS — fix HIGH concerns before next user logs in**

The phone login V2 design is fundamentally sound:
- Backend RPC has correct anti-enumeration regex.
- SQL injection vector is closed.
- `SECURITY DEFINER` is used responsibly with `search_path` set.
- Frontend validation is correctly framed as UX layer, not security gate.
- hCaptcha + Supabase Auth rate-limit + parameterized RPC = defense in depth.

**However, the backfill backup table (`_phone_backfill_backup_2026_05_03`) is the single blocker to a clean SECURE verdict.** Without RLS enabled and `anon`/`authenticated` grants revoked, any logged-in customer can query every other customer's phone number through the auto-generated PostgREST endpoint. This is a high-severity PII leak and must be remediated immediately (Action #1 above), but takes ~30 seconds in the SQL editor.

Once Action #1 is applied, this audit upgrades to **SECURE — ship as-is**. Concerns #2–#5 are acceptable trade-offs for a soft-launch consumer site of this scale, with the monitoring plan in Action #3.

---

## Appendix — Files reviewed

- `K:\bep-thuy-japan\thanh-vien.html` (lines 1590-1689 — login flow, regex, RPC call, error handling)
- `K:\bep-thuy-japan\supabase-phone-login-v2.sql` (full file, 146 lines)
- `K:\bep-thuy-japan\supabase-phone-backfill.sql` (full file, 246 lines)

## Appendix — Method note

Audit performed by static review of source files. The auditor did NOT execute any queries against the live Supabase database; assumptions about runtime DB state (e.g. RLS status of the new backup table) are flagged as such in the findings. Anh should run the verification queries in Action #1 to confirm.
