-- Защита кошелька и подписки от правок с клиента + серверные операции с балансом.
--
-- Проблема: политика profiles_update разрешает пользователю менять СВОЮ строку
-- профиля целиком, а триггер защищал только role. Значит из браузера можно было
-- поставить balance = 999999 или продлить subscription_paid_until без оплаты.
--
-- Что меняется:
--   1) protect_profile_money() — баланс, подписку и статус водителя меняет только
--      админ или доверенная серверная функция (флаг app.money_change_ok)
--   2) renew_subscription()   — продление подписки со списанием на сервере
--   3) pay_bus_fare()         — оплата проезда со списанием на сервере

-- 1) Триггер: деньги, подписка и статус водителя — не из браузера
CREATE OR REPLACE FUNCTION public.protect_profile_money()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF (
       OLD.balance IS DISTINCT FROM NEW.balance
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

DROP TRIGGER IF EXISTS trg_protect_money ON public.profiles;
CREATE TRIGGER trg_protect_money BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_money();

-- is_admin() читает profiles, а триггер висит на profiles — нужен SECURITY DEFINER,
-- он уже есть; функция с пустым search_path зовёт public.is_admin() явно.

-- 2) Продление подписки: тариф списывается на сервере
CREATE OR REPLACE FUNCTION public.renew_subscription()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  me UUID := auth.uid();
  v_role TEXT;
  v_balance NUMERIC;
  v_fee NUMERIC;
  v_until TIMESTAMPTZ;
  v_activated BOOLEAN;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT role, balance, subscription_paid_until, admin_activated
    INTO v_role, v_balance, v_until, v_activated
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

  IF COALESCE(v_balance, 0) < v_fee THEN
    RAISE EXCEPTION 'insufficient balance';
  END IF;

  v_until := GREATEST(COALESCE(v_until, now()), now()) + interval '30 days';

  PERFORM set_config('app.money_change_ok', '1', true);
  PERFORM set_config('app.role_change_ok', '1', true);
  UPDATE public.profiles SET
    balance = COALESCE(balance, 0) - v_fee,
    subscription_status = 'active',
    subscription_paid_until = v_until
  WHERE id = me;

  INSERT INTO public.audit_logs (event, entity_type, entity_id, actor_type, actor_id, metadata)
  VALUES (
    'admin_action', 'profile', me, 'user', me,
    jsonb_build_object('action','renew_subscription','role', v_role,'fee', v_fee,'paid_until', v_until)
  );

  RETURN jsonb_build_object('balance', v_balance - v_fee, 'fee', v_fee, 'paid_until', v_until);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.renew_subscription() TO authenticated;

-- 3) Оплата проезда: списание на сервере, без возможности подделать баланс
CREATE OR REPLACE FUNCTION public.pay_bus_fare(
  p_route_id uuid,
  p_driver_id uuid,
  p_amount numeric,
  p_route_number text DEFAULT NULL,
  p_route_name text DEFAULT NULL,
  p_route_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  me UUID := auth.uid();
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_balance numeric;
  v_fare numeric;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF v_amount <= 0 OR v_amount > 10000 THEN
    RAISE EXCEPTION 'Некорректная сумма оплаты';
  END IF;

  -- тариф берём из маршрута, клиенту не доверяем
  SELECT COALESCE(NULLIF(fare_bus, 0), NULLIF(fare_minibus, 0), price)
    INTO v_fare
  FROM public.routes
  WHERE id = p_route_id;
  v_fare := COALESCE(v_fare, v_amount);

  SELECT balance INTO v_balance FROM public.profiles WHERE id = me FOR UPDATE;
  IF v_balance IS NULL OR v_balance < v_fare THEN
    RAISE EXCEPTION 'insufficient balance';
  END IF;

  PERFORM set_config('app.money_change_ok', '1', true);
  UPDATE public.profiles SET balance = v_balance - v_fare WHERE id = me;

  INSERT INTO public.transactions (sender_id, recipient_id, amount, status)
  VALUES (me, p_driver_id, v_fare, 'completed');

  INSERT INTO public.audit_logs (event, entity_type, entity_id, actor_type, actor_id, metadata)
  VALUES (
    'admin_action', 'profile', me, 'user', me,
    jsonb_build_object(
      'action', 'bus_fare',
      'route_id', p_route_id,
      'driver_id', p_driver_id,
      'amount', v_fare,
      'balance_after', v_balance - v_fare
    )
  );

  RETURN jsonb_build_object('balance', v_balance - v_fare, 'amount', v_fare);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.pay_bus_fare(uuid, uuid, numeric, text, text, text) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
