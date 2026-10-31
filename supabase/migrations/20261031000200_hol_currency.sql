-- «Хол» — бонусная валюта-приз:
--   * профили: колонка hol_balance (курс 1 Хол = 1 TJS, без пересчёта);
--   * защита: hol_balance нельзя править из браузера — тот же триггер
--     protect_profile_money (только админ или серверная функция);
--   * получение: только выдача из админки — admin_grant_hol (проверка is_admin,
--     запись в audit_logs);
--   * трата: только оплата подписки — renew_subscription(p_method) со способом
--     'money' (реальный кошелёк, прежнее поведение) или 'hol' (бонусный Хол).
-- Клиент: src/lib/hol.js + окно «Чем оплатить подписку?» в профиле.

-- 1) Колонка
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hol_balance NUMERIC(12,2) NOT NULL DEFAULT 0;

-- 2) Защита нового баланса тем же триггером
CREATE OR REPLACE FUNCTION public.protect_profile_money()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF (
       OLD.balance IS DISTINCT FROM NEW.balance
    OR OLD.hol_balance IS DISTINCT FROM NEW.hol_balance
    OR OLD.subscription_status IS DISTINCT FROM NEW.subscription_status
    OR OLD.subscription_paid_until IS DISTINCT FROM NEW.subscription_paid_until
    OR OLD.subscription_start_date IS DISTINCT FROM NEW.subscription_start_date
    OR OLD.subscription_next_billing IS DISTINCT FROM NEW.subscription_next_billing
    OR OLD.admin_activated IS DISTINCT FROM NEW.admin_activated
    OR OLD.driver_status IS DISTINCT FROM NEW.driver_status
  )
  AND NOT public.is_admin()
  AND current_setting('app.money_change_ok', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Баланс, подписку и статус водителя меняет только администратор';
  END IF;
  RETURN NEW;
END;
$fn$;

-- 3) Продление подписки со выбором способа оплаты
DROP FUNCTION IF EXISTS public.renew_subscription();

CREATE OR REPLACE FUNCTION public.renew_subscription(p_method text DEFAULT 'money')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  me UUID := auth.uid();
  v_role TEXT;
  v_balance NUMERIC;
  v_hol NUMERIC;
  v_fee NUMERIC;
  v_until TIMESTAMPTZ;
  v_activated BOOLEAN;
  v_method TEXT := coalesce(p_method, 'money');
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF v_method NOT IN ('money', 'hol') THEN
    RAISE EXCEPTION 'Некорректный способ оплаты';
  END IF;

  SELECT role, balance, hol_balance, subscription_paid_until, admin_activated
    INTO v_role, v_balance, v_hol, v_until, v_activated
  FROM public.profiles WHERE id = me;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile not found'; END IF;

  v_fee := CASE v_role
    WHEN 'driver' THEN 20
    WHEN 'taxi_driver' THEN 25
    WHEN 'business' THEN 1000
    WHEN 'admin' THEN CASE WHEN COALESCE(v_activated, false) THEN 25 ELSE 100 END
    ELSE NULL END;
  IF v_fee IS NULL THEN
    RAISE EXCEPTION 'У роли «Пассажир» нет платной подписки';
  END IF;

  IF v_method = 'hol' THEN
    IF COALESCE(v_hol, 0) < v_fee THEN
      RAISE EXCEPTION 'insufficient hol';
    END IF;
  ELSIF COALESCE(v_balance, 0) < v_fee THEN
    RAISE EXCEPTION 'insufficient balance';
  END IF;

  v_until := GREATEST(COALESCE(v_until, now()), now()) + interval '30 days';

  PERFORM set_config('app.money_change_ok', '1', true);
  PERFORM set_config('app.role_change_ok', '1', true);
  IF v_method = 'hol' THEN
    UPDATE public.profiles SET
      hol_balance = COALESCE(hol_balance, 0) - v_fee,
      subscription_status = 'active',
      subscription_paid_until = v_until
    WHERE id = me;
  ELSE
    UPDATE public.profiles SET
      balance = COALESCE(balance, 0) - v_fee,
      subscription_status = 'active',
      subscription_paid_until = v_until
    WHERE id = me;
  END IF;

  INSERT INTO public.audit_logs (event, entity_type, entity_id, actor_type, actor_id, metadata)
  VALUES (
    'admin_action', 'profile', me, 'user', me,
    jsonb_build_object(
      'action','renew_subscription',
      'role', v_role,
      'fee', v_fee,
      'method', v_method,
      'paid_until', v_until
    )
  );

  RETURN jsonb_build_object(
    'balance', v_balance - CASE WHEN v_method = 'money' THEN v_fee ELSE 0 END,
    'hol_balance', v_hol - CASE WHEN v_method = 'hol' THEN v_fee ELSE 0 END,
    'fee', v_fee,
    'method', v_method,
    'paid_until', v_until
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.renew_subscription(text) TO authenticated;

-- 4) Выдача «Хол» из админки (разработчик/владелец)
CREATE OR REPLACE FUNCTION public.admin_grant_hol(
  p_user_id uuid,
  p_amount numeric,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  me UUID := auth.uid();
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_after numeric;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Только администратор может выдать Хол';
  END IF;
  IF v_amount <= 0 OR v_amount > 100000 THEN
    RAISE EXCEPTION 'Некорректная сумма';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Пользователь не найден';
  END IF;

  UPDATE public.profiles
     SET hol_balance = COALESCE(hol_balance, 0) + v_amount
   WHERE id = p_user_id
  RETURNING hol_balance INTO v_after;

  INSERT INTO public.audit_logs (event, entity_type, entity_id, actor_type, actor_id, metadata)
  VALUES (
    'admin_action', 'profile', p_user_id, 'admin', me,
    jsonb_build_object(
      'action', 'grant_hol',
      'amount', v_amount,
      'hol_balance_after', v_after,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object('hol_balance', v_after, 'amount', v_amount);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_grant_hol(uuid, numeric, text) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
