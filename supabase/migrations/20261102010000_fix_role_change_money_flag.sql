-- Смена роли: платные роли не переключались.
--
-- Симптом (прод): в профиле выбираешь «Бизнес» (1000 TJS) — красный тост
-- «Баланс, подписку и статус водителя меняет только администратор».
--
-- Причина: триггер protect_profile_money запрещает менять balance /
-- subscription_* / driver_status без флага app.money_change_ok, а
-- request_role_change выставлял только app.role_change_ok. Флаг живёт
-- до конца транзакции (set_config(..., true)), поэтому прямой UPDATE из
-- клиента по-прежнему блокируется — поднимаем его только внутри
-- SECURITY DEFINER функции.
--
-- Проверено: остальные функции, меняющие деньги (complete_topup_request,
-- pay_bus_fare, renew_subscription), флаг выставляют.

CREATE OR REPLACE FUNCTION public.request_role_change(new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  me UUID := auth.uid();
  cur_role TEXT;
  cur_balance NUMERIC;
  cur_sub TEXT;
  cur_paid_until TIMESTAMPTZ;
  cur_activated BOOLEAN;
  cur_driver_status TEXT;
  db_role TEXT;
  fee NUMERIC := 0;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  db_role := CASE WHEN new_role = 'passenger' THEN 'user' ELSE new_role END;
  IF db_role NOT IN ('user', 'driver', 'taxi_driver', 'admin', 'business') THEN
    RAISE EXCEPTION 'bad role';
  END IF;

  SELECT role, balance, subscription_status, subscription_paid_until, admin_activated, driver_status
    INTO cur_role, cur_balance, cur_sub, cur_paid_until, cur_activated, cur_driver_status
  FROM public.profiles WHERE id = me;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF cur_role = db_role THEN RETURN; END IF;

  IF db_role = 'business' THEN
    fee := 1000;
  ELSIF db_role <> 'user' AND NOT (cur_sub = 'active' AND cur_paid_until > now()) THEN
    fee := CASE db_role
      WHEN 'driver' THEN 20
      WHEN 'taxi_driver' THEN 25
      WHEN 'admin' THEN CASE WHEN COALESCE(cur_activated, false) THEN 25 ELSE 100 END
      ELSE 0 END;
  END IF;
  IF fee > 0 AND COALESCE(cur_balance, 0) < fee THEN
    RAISE EXCEPTION 'insufficient balance';
  END IF;

  -- Разрешения для триггеров: роль — protect_profile_role, деньги/подписка/
  -- статус водителя — protect_profile_money. Оба флага transaction-local.
  PERFORM set_config('app.role_change_ok', '1', true);
  PERFORM set_config('app.money_change_ok', '1', true);
  UPDATE public.profiles SET
    role = db_role,
    balance = COALESCE(balance, 0) - fee,
    subscription_status = CASE WHEN fee > 0 THEN 'active' ELSE subscription_status END,
    subscription_paid_until = CASE WHEN fee > 0 THEN now() + interval '30 days' ELSE subscription_paid_until END,
    admin_activated = CASE WHEN db_role = 'admin' THEN true ELSE admin_activated END,
    driver_status = CASE
      WHEN db_role = 'driver' AND COALESCE(driver_status, '') IN ('', 'blocked', 'documents_required') THEN 'pending'
      WHEN db_role = 'taxi_driver' THEN 'approved'
      ELSE driver_status END
  WHERE id = me;
END;
$function$;
