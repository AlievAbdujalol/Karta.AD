-- Починка смены роли: триггер trg_protect_role резал ВСЕ смены роли не-админам,
-- включая платные апгрейды из Profile (driver 20 / taxi_driver 25 / admin 25-100).
-- Решение: апгрейд идёт через SECURITY DEFINER RPC с серверной проверкой баланса
-- и списанием, триггер пропускает такие апдейты по сессионному флагу.

-- 1) Триггер уважает флаг, который выставляет только request_role_change
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role
     AND NOT public.is_admin()
     AND current_setting('app.role_change_ok', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Нельзя менять роль без прав администратора';
  END IF;
  RETURN NEW;
END; $$;

-- 2) Платная смена роли: проверка баланса и списание — на сервере, атомарно
CREATE OR REPLACE FUNCTION public.request_role_change(new_role TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF db_role NOT IN ('user', 'driver', 'taxi_driver', 'admin') THEN
    RAISE EXCEPTION 'bad role';
  END IF;

  SELECT role, balance, subscription_status, subscription_paid_until, admin_activated, driver_status
    INTO cur_role, cur_balance, cur_sub, cur_paid_until, cur_activated, cur_driver_status
  FROM public.profiles WHERE id = me;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF cur_role = db_role THEN RETURN; END IF;

  -- даунгрейд до user всегда бесплатен; апгрейд бесплатен при активной подписке
  IF db_role <> 'user' AND NOT (cur_sub = 'active' AND cur_paid_until > now()) THEN
    fee := CASE db_role
      WHEN 'driver' THEN 20
      WHEN 'taxi_driver' THEN 25
      WHEN 'admin' THEN CASE WHEN COALESCE(cur_activated, false) THEN 25 ELSE 100 END
      ELSE 0 END;
  END IF;
  IF fee > 0 AND COALESCE(cur_balance, 0) < fee THEN
    RAISE EXCEPTION 'insufficient balance';
  END IF;

  PERFORM set_config('app.role_change_ok', '1', true);
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
$$;

GRANT EXECUTE ON FUNCTION public.request_role_change(TEXT) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
