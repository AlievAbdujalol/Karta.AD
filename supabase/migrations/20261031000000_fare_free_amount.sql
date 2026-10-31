-- Свободная сумма проезда: пассажир сам задаёт сумму (кнопки ±0.50 TJS
-- или ввод в попапе транспорта). Тариф маршрута больше НЕ переопределяет
-- сумму на сервере — он был лишь защитой от подделки, но лишал функцию
-- смысла: клиентские 3.00/2.50 уже были хардкодом. Теперь сервер принимает
-- сумму в согласованных границах (0.50 … 10000 TJS, см. src/lib/fareInput.js)
-- и списывает ровно её. Аутентификация, FOR UPDATE баланса, транзакция
-- и аудит сохранены.

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
  -- границы согласованы с клиентом (src/lib/fareInput.js)
  IF v_amount < 0.50 OR v_amount > 10000 THEN
    RAISE EXCEPTION 'Некорректная сумма оплаты';
  END IF;

  v_fare := v_amount;

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
