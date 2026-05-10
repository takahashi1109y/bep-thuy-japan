-- ============================================================
-- P1.B — DISPOSABLE EMAIL BLACKLIST (2026-05-11)
-- ============================================================
-- Block khach dung temporary/disposable email tu nhan welcome 100d.
-- KHONG block signup → khach van tao acc duoc nhung khong claim 100d.
--
-- Strategy:
--   1. Table blocked_email_domains (50+ disposable providers)
--   2. Function is_email_blocked(email) helper
--   3. Update claim_welcome_bonus_by_token check disposable
--   4. Optional: frontend show warning luc dang ky
--
-- Idempotent — chay nhieu lan OK.
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 1: Create table blocked_email_domains            ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.blocked_email_domains (
  domain     text PRIMARY KEY,
  reason     text DEFAULT 'disposable',
  added_at   timestamptz DEFAULT now()
);

-- RLS: chi service_role + admin doc duoc, khach KHONG can xem
ALTER TABLE public.blocked_email_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin reads blocked domains" ON public.blocked_email_domains;
CREATE POLICY "Admin reads blocked domains" ON public.blocked_email_domains
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role full access blocked" ON public.blocked_email_domains;
CREATE POLICY "Service role full access blocked" ON public.blocked_email_domains
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 2: Seed list — 70+ disposable domains             ║
-- ╚══════════════════════════════════════════════════════════╝
-- Source: community-maintained disposable-email-domains lists
-- (github.com/disposable-email-domains/disposable-email-domains)

INSERT INTO public.blocked_email_domains (domain) VALUES
  -- Most popular disposable services
  ('tempmail.com'),
  ('temp-mail.org'),
  ('temp-mail.io'),
  ('10minutemail.com'),
  ('10minutemail.net'),
  ('20minutemail.com'),
  ('30minutemail.com'),
  ('guerrillamail.com'),
  ('guerrillamail.net'),
  ('guerrillamail.org'),
  ('sharklasers.com'),
  ('mailinator.com'),
  ('mailinator.net'),
  ('mailinator2.com'),
  ('mailtrap.io'),
  ('throwaway.email'),
  ('throwawaymail.com'),
  ('yopmail.com'),
  ('yopmail.fr'),
  ('yopmail.net'),
  ('fakeinbox.com'),
  ('fakemail.net'),
  ('dispostable.com'),
  ('getnada.com'),
  ('mailsac.com'),
  ('emailondeck.com'),
  ('maildrop.cc'),
  ('mintemail.com'),
  ('moakt.com'),
  ('mailtemp.uk'),
  ('mohmal.com'),
  ('inboxbear.com'),
  ('inboxkitten.com'),
  -- Variants / mirrors
  ('emailtemporanea.net'),
  ('emailtemporaneo.es'),
  ('mytemp.email'),
  ('disposable.com'),
  ('trashmail.com'),
  ('trashmail.net'),
  ('trash-mail.com'),
  ('mailcatch.com'),
  ('spamgourmet.com'),
  ('spambox.us'),
  ('binkmail.com'),
  ('discard.email'),
  ('discardmail.com'),
  ('disbox.net'),
  ('dropmail.me'),
  ('etranquil.com'),
  ('fakemailgenerator.com'),
  ('grr.la'),
  ('letthemeatspam.com'),
  ('mailbox52.ga'),
  ('mailcuk.com'),
  ('mailexpire.com'),
  ('mail-fake.com'),
  ('mailforspam.com'),
  ('mailimate.com'),
  ('mailsucker.net'),
  ('mvrht.net'),
  ('myothermail.com'),
  ('nomail.xl.cx'),
  ('noplay.email'),
  ('noteonly.com'),
  ('opayq.com'),
  ('owlpic.com'),
  ('rcpt.at'),
  ('shitmail.me'),
  ('skiff.com'),
  ('smashmail.de'),
  ('spamavert.com'),
  ('spamfree24.org'),
  ('spamgourmet.net'),
  ('spamhole.com'),
  ('spammotel.com'),
  ('superrito.com'),
  ('tempemail.net'),
  ('tempinbox.com'),
  ('tempmailer.com'),
  ('thankyou2010.com'),
  ('zetmail.com')
ON CONFLICT (domain) DO NOTHING;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 3: Helper function is_email_blocked              ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.is_email_blocked(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_email_domains
     WHERE domain = lower(split_part(p_email, '@', 2))
  );
$$;

-- Cho authenticated + service_role goi (frontend warning + backend enforce)
GRANT EXECUTE ON FUNCTION public.is_email_blocked(text) TO authenticated, service_role;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 4: Update claim_welcome_bonus_by_token RPC       ║
-- ╚══════════════════════════════════════════════════════════╝
-- Them check disposable email TRUOC khi check duplicate canonical

CREATE OR REPLACE FUNCTION public.claim_welcome_bonus_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id        uuid;
  v_user_email     text;
  v_owner          uuid;
  v_already        boolean;
  v_points         int := 100;
  v_email_verified timestamptz;
  v_canonical      text;
  v_dup_claimed    boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Get user email + verified status
  SELECT email, email_confirmed_at INTO v_user_email, v_email_verified
    FROM auth.users WHERE id = v_user_id;

  -- D1: Check email verified
  IF v_email_verified IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_not_verified',
      'message', 'Vui long xac nhan email truoc khi nhan diem thuong');
  END IF;

  -- P1.B: Check disposable email
  IF public.is_email_blocked(v_user_email) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'disposable_email',
      'message', 'Email tam thoi/disposable khong duoc nhan diem thuong. Vui long su dung email chinh thuc (Gmail, Yahoo, iCloud, etc.)');
  END IF;

  -- D2: Check canonical email duplicate
  SELECT canonical_email INTO v_canonical
    FROM public.profiles WHERE id = v_user_id;

  IF v_canonical IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
       WHERE canonical_email = v_canonical
         AND id != v_user_id
         AND bonus_claimed = true
    ) INTO v_dup_claimed;

    IF v_dup_claimed THEN
      RETURN jsonb_build_object('ok', false, 'error', 'duplicate_email',
        'message', 'Email nay da duoc su dung de nhan thuong. Moi tai khoan chi duoc nhan 1 lan.');
    END IF;
  END IF;

  -- Lookup token owner
  SELECT id, bonus_claimed
    INTO v_owner, v_already
    FROM public.profiles
   WHERE bonus_token = p_token
   LIMIT 1;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  IF v_owner != v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_your_token');
  END IF;

  IF v_already THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed');
  END IF;

  -- Atomic test-and-set
  UPDATE public.profiles
     SET bonus_claimed        = true,
         welcome_claimed_at   = COALESCE(welcome_claimed_at, now())
   WHERE id           = v_user_id
     AND bonus_token  = p_token
     AND bonus_claimed = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed');
  END IF;

  -- Award 100 diem
  INSERT INTO public.points_transactions
    (user_id, order_no, order_total, points, type, description)
  VALUES
    (v_user_id, NULL, NULL, v_points, 'welcome',
     'Thuong chao mung dang ky thanh vien');

  RETURN jsonb_build_object('ok', true, 'points', v_points);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_welcome_bonus_by_token(text) TO authenticated;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 5: VERIFY                                        ║
-- ╚══════════════════════════════════════════════════════════╝

-- 5.1: Table tao thanh cong, co bao nhieu domains
SELECT 'blocked_count' AS test, COUNT(*) AS num_domains
  FROM public.blocked_email_domains;

-- 5.2: Function works?
SELECT 'is_blocked_test' AS test,
       public.is_email_blocked('test@gmail.com') AS gmail_legit,
       public.is_email_blocked('user@tempmail.com') AS tempmail_blocked,
       public.is_email_blocked('user@10minutemail.com') AS tenmin_blocked,
       public.is_email_blocked('user@yahoo.co.jp') AS yahoo_legit;
-- Expected: false, true, true, false

-- 5.3: Existing users dung disposable email?
SELECT 'existing_users_with_disposable' AS test,
       u.email,
       split_part(u.email, '@', 2) AS domain
FROM auth.users u
WHERE public.is_email_blocked(u.email)
ORDER BY u.created_at DESC
LIMIT 10;

-- 5.4: RPC has new check?
SELECT 'rpc_check' AS test,
       CASE WHEN routine_definition ILIKE '%disposable_email%'
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'claim_welcome_bonus_by_token';
