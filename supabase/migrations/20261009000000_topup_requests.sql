-- Пополнение кошелька через заявку: пользователь оставляет заявку, админ зачисляет
-- деньги после фактической оплаты. Когда подключится платёжный шлюз, его вебхук
-- будет вызывать ту же complete_topup_request — логика клиента не меняется.
--
-- Что добавляется:
--   1) таблица payment_requests + RLS (свои заявки видит пользователь, все — админ)
--   2) create_topup_request      — заявка от пользователя
--   3) complete_topup_request    — зачисление админом (или вебхуком шлюза)
--   4) cancel_topup_request      — отмена своей заявки

CREATE TABLE IF NOT EXISTS public.payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount >= 10 AND amount <= 1000000),
  method TEXT NOT NULL DEFAULT 'manual' CHECK (method IN ('manual', 'card', 'alif', 'somon')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'rejected')),
  note TEXT,
  external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS payment_requests_user_idx ON public.payment_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_requests_status_idx ON public.payment_requests (status) WHERE status = 'pending';

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Заявки: чтение" ON public.payment_requests;
CREATE POLICY "Заявки: чтение" ON public.payment_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- Записи идут только через RPC (create_topup_request), прямой INSERT запрещён

-- 1) Заявка от пользователя
CREATE OR REPLACE FUNCTION public.create_topup_request(p_amount numeric, p_method text DEFAULT 'manual')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  me UUID := auth.uid();
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_id UUID;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF v_amount < 10 OR v_amount > 1000000 THEN
    RAISE EXCEPTION 'Сумма должна быть от 10 до 1000000 TJS';
  END IF;
  IF p_method NOT IN ('manual', 'card', 'alif', 'somon') THEN
    RAISE EXCEPTION 'Неизвестный способ оплаты';
  END IF;
  -- не плодим дубли: одна незакрытая заявка на пользователя
  IF EXISTS (
    SELECT 1 FROM public.payment_requests
    WHERE user_id = me AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'У вас уже есть заявка в ожидании';
  END IF;

  INSERT INTO public.payment_requests (user_id, amount, method)
  VALUES (me, v_amount, p_method)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.create_topup_request(numeric, text) TO authenticated;

-- 2) Зачисление: админ (или вебхук шлюза через сервисный ключ)
CREATE OR REPLACE FUNCTION public.complete_topup_request(p_request_id uuid, p_external_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_actor UUID := auth.uid();
  v_user UUID;
  v_amount NUMERIC;
  v_status TEXT;
  v_balance NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: только администратор';
  END IF;

  SELECT user_id, amount, status INTO v_user, v_amount, v_status
  FROM public.payment_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_user IS NULL THEN RAISE EXCEPTION 'Заявка не найдена'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'Заявка уже обработана'; END IF;

  PERFORM set_config('app.money_change_ok', '1', true);
  UPDATE public.profiles
  SET balance = coalesce(balance, 0) + v_amount
  WHERE id = v_user
  RETURNING balance INTO v_balance;

  UPDATE public.payment_requests
  SET status = 'paid', external_id = p_external_id, resolved_at = now(), resolved_by = v_actor
  WHERE id = p_request_id;

  INSERT INTO public.transactions (sender_id, recipient_id, amount, status)
  VALUES (NULL, v_user, v_amount, 'completed');

  INSERT INTO public.audit_logs (event, entity_type, entity_id, actor_type, actor_id, metadata)
  VALUES (
    'admin_action', 'profile', v_user, 'user', v_actor,
    jsonb_build_object(
      'action', 'complete_topup',
      'request_id', p_request_id,
      'amount', v_amount,
      'external_id', p_external_id,
      'balance_after', v_balance
    )
  );

  RETURN jsonb_build_object('user_id', v_user, 'amount', v_amount, 'balance', v_balance);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.complete_topup_request(uuid, text) TO authenticated;

-- 3) Отмена своей заявки
CREATE OR REPLACE FUNCTION public.cancel_topup_request(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  me UUID := auth.uid();
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM public.payment_requests WHERE id = p_request_id AND user_id = me FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Заявка не найдена'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'Заявка уже обработана'; END IF;

  UPDATE public.payment_requests SET status = 'cancelled', resolved_at = now() WHERE id = p_request_id;
  RETURN TRUE;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.cancel_topup_request(uuid) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
