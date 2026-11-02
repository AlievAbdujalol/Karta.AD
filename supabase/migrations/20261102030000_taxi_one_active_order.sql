-- Такси: один активный заказ на пассажира.
--
-- Причина. Кнопка «Заказать» не блокировалась на время INSERT: два быстрых
-- тапа (или медленная сеть) создавали два заказа. Серверного ограничения не
-- было — в таблице нет idempotency-key, а RLS проверяет только
-- passenger_id = auth.uid(). Дубли висят в общем поиске и путают водителей.
--
-- Частичный уникальный индекс закрывает гонку на уровне БД независимо от UI.
-- В предикат входят ВСЕ активные статусы, включая arrived: пассажир уже в
-- машине, но заказ ещё не завершён, и второй заказ в этот момент недопустим.
-- Проверено на production: активных заказов (searching/found/en_route/arrived/
-- riding) сейчас нет, дублей по passenger_id нет — индекс создаётся без
-- конфликтов. Клиент дополнительно блокирует повторный клик (placingOrderRef).

CREATE UNIQUE INDEX IF NOT EXISTS taxi_orders_one_active_per_passenger
  ON public.taxi_orders (passenger_id)
  WHERE status IN ('searching', 'found', 'en_route', 'arrived', 'riding');

SELECT pg_notify('pgrst', 'reload schema');
