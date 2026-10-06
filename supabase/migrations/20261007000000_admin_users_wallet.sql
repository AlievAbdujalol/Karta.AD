-- Админские операции с кошельком:
--   1) admin_create_user   — создать пользователя (auth + профиль) и завести стартовый баланс
--   2) admin_topup_balance — пополнить баланс пользователя
--
-- Обе функции доступны ТОЛЬКО роли admin (проверка внутри, не на клиенте) и пишут запись в
-- audit_logs. Это позволяет оплачивать подписку (в т.ч. «Бизнес» за 1000 TJS) из кошелька:
-- админ добавляет пользователя с балансом → пользователь сам активирует роль в профиле.

-- 1) Создание пользователя админом
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email text,
  p_password text,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_role text DEFAULT 'user',
  p_initial_balance numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  me UUID := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_domain text := split_part(lower(trim(coalesce(p_email, ''))), '@', 2);
  v_id UUID := gen_random_uuid();
  v_balance numeric := coalesce(p_initial_balance, 0);
BEGIN
  IF me IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: только администратор';
  END IF;

  -- e-mail проверяем без регулярных выражений: есть ровно один @, домен с точкой, без пробелов
  IF v_email = '' OR position(' ' in v_email) > 0
     OR position('@' in v_email) = 0
     OR length(v_email) <> length(replace(v_email, '@', '')) + 1
     OR v_domain = '' OR position('.' in v_domain) = 0
     OR left(v_domain, 1) = '.' OR right(v_domain, 1) = '.' THEN
    RAISE EXCEPTION 'Некорректный e-mail';
  END IF;
  IF length(coalesce(p_password, '')) < 6 THEN
    RAISE EXCEPTION 'Пароль должен быть не короче 6 символов';
  END IF;
  IF p_role NOT IN ('user', 'passenger', 'driver', 'taxi_driver', 'business', 'admin') THEN
    RAISE EXCEPTION 'Недопустимая роль';
  END IF;
  IF v_balance < 0 OR v_balance > 1000000 THEN
    RAISE EXCEPTION 'Стартовый баланс должен быть от 0 до 1000000';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'Пользователь с таким e-mail уже существует';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, aud
  ) VALUES (
    NULL, v_id, v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', coalesce(p_full_name, ''), 'phone', coalesce(p_phone, '')),
    now(), now(), 'authenticated'
  );

  -- email в auth.identities — generated-колонка, заполняется сама
  INSERT INTO auth.identities (
    id, user_id, provider, provider_id, identity_data, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_id, 'email', v_email,
    jsonb_build_object('email', v_email, 'email_verified', true, 'phone_verified', false),
    now(), now()
  );

  -- триггер on_auth_user_created уже создал профиль и строку settings
  -- флаг снимает ограничение trg_protect_role на смену роли (роль выдаёт админ)
  PERFORM set_config('app.role_change_ok', '1', true);
  UPDATE public.profiles SET
    email = v_email,
    full_name = coalesce(nullif(trim(coalesce(p_full_name, '')), ''), full_name),
    phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone),
    role = case when p_role = 'passenger' then 'user' else p_role end,
    admin_activated = case when p_role = 'admin' then true else admin_activated end,
    balance = coalesce(balance, 0) + v_balance
  WHERE id = v_id;

  INSERT INTO public.audit_logs (event, entity_type, entity_id, actor_type, actor_id, metadata)
  VALUES (
    'admin_action', 'profile', v_id, 'user', me,
    jsonb_build_object(
      'action', 'create_user',
      'email', v_email,
      'role', p_role,
      'initial_balance', v_balance
    )
  );

  RETURN v_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text, numeric) TO authenticated;

-- 2) Пополнение баланса кошелька пользователя
CREATE OR REPLACE FUNCTION public.admin_topup_balance(
  p_user_id uuid,
  p_amount numeric,
  p_reason text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  me UUID := auth.uid();
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_balance numeric;
BEGIN
  IF me IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: только администратор';
  END IF;
  IF v_amount <= 0 OR v_amount > 1000000 THEN
    RAISE EXCEPTION 'Сумма должна быть от 0.01 до 1000000 TJS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Пользователь не найден';
  END IF;

  UPDATE public.profiles
    SET balance = coalesce(balance, 0) + v_amount
  WHERE id = p_user_id
  RETURNING balance INTO v_balance;

  INSERT INTO public.audit_logs (event, entity_type, entity_id, actor_type, actor_id, metadata)
  VALUES (
    'admin_action', 'profile', p_user_id, 'user', me,
    jsonb_build_object(
      'action', 'topup_balance',
      'amount', v_amount,
      'reason', coalesce(p_reason, ''),
      'balance_after', v_balance
    )
  );

  RETURN v_balance;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_topup_balance(uuid, numeric, text) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
