-- Роль «Бизнес»: платная подписка 1000 TJS/мес, открывает все бизнес-функции
-- (создание бизнеса, товары, заказы, доставка, AI-конструктор сайта, аналитика).
--
-- Что меняется:
--   1) profiles.role_check — добавляем 'business'
--   2) request_role_change   — разрешаем 'business' со списанием 1000 TJS
--   3) create_business       — требует активную бизнес-подписку (проверка на сервере)

-- 1) CHECK на роль
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['passenger'::text, 'user'::text, 'driver'::text,
                           'taxi_driver'::text, 'admin'::text, 'business'::text]));

-- 2) Платная смена роли: + бизнес 1000 TJS/мес
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
  IF db_role NOT IN ('user', 'driver', 'taxi_driver', 'admin', 'business') THEN
    RAISE EXCEPTION 'bad role';
  END IF;

  SELECT role, balance, subscription_status, subscription_paid_until, admin_activated, driver_status
    INTO cur_role, cur_balance, cur_sub, cur_paid_until, cur_activated, cur_driver_status
  FROM public.profiles WHERE id = me;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF cur_role = db_role THEN RETURN; END IF;

  -- Даунгрейд до user всегда бесплатен; апгрейд бесплатен при активной подписке.
  -- Исключение — 'business': тариф 1000 TJS/мес списывается ВСЕГДА, иначе активная
  -- подписка другой роли дарила бы бизнес бесплатно.
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

-- 3) Создание бизнеса — только по активной бизнес-подписке
CREATE OR REPLACE FUNCTION public.create_business(
  p_name text,
  p_type text DEFAULT NULL::text,
  p_description text DEFAULT NULL::text,
  p_city text DEFAULT NULL::text,
  p_address text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_id UUID;
  v_role TEXT;
  v_sub TEXT;
  v_paid_until TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT role, subscription_status, subscription_paid_until
    INTO v_role, v_sub, v_paid_until
  FROM public.profiles WHERE id = auth.uid();

  IF v_role IS DISTINCT FROM 'business' THEN
    RAISE EXCEPTION 'Требуется роль Бизнес (1000 TJS/мес). Активируйте её в профиле.';
  END IF;
  IF v_sub IS DISTINCT FROM 'active' OR v_paid_until IS NULL OR v_paid_until <= now() THEN
    RAISE EXCEPTION 'Подписка Бизнес истекла. Продлите её в профиле.';
  END IF;

  INSERT INTO public.businesses (owner_id, name, type, description, city, address, phone)
  VALUES (auth.uid(), p_name, p_type, p_description, p_city, p_address, p_phone)
  RETURNING id INTO v_id;

  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (v_id, auth.uid(), 'owner');

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_business(text, text, text, text, text, text) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
