-- Публичный чекаут: закрыть прямой INSERT в orders / order_items.
--
-- Причина. Политики orders_insert_public и order_items_insert_public разрешали
-- роли anon писать в таблицы напрямую, в обход RPC create_store_order, где
-- считаются цены, стоимость доставки и rate-limit (5 заказов с телефона на
-- бизнес за 10 минут).
--
-- Проверка на production (транзакция с ROLLBACK, SET LOCAL ROLE anon):
-- фактический INSERT сейчас отклоняется RLS, потому что подзапрос политики
-- читает businesses, а у anon нет SELECT-политики на businesses. То есть
-- политики — мёртвый код, а не активная дыра. Удаляем их как defense-in-depth:
-- если когда-нибудь появится публичное чтение businesses, политика оживёт и
-- откроет обход rate-limit и произвольный delivery_price.
--
-- Почему удаление безопасно. Витрина, виджет и AI-сайты вызывают RPC
-- create_store_order (SECURITY DEFINER — RLS не применяется). Проверено по
-- production: среди опубликованных ai_project_versions 2 используют
-- create_store_order и 0 — прямой /rest/v1/orders; опубликованных
-- business_sites нет. Сама RPC и её грант anon не затрагиваются.
--
-- Ручное создание заказа продавцом (src/lib/business.js createOrder) идёт
-- под authenticated и использует политику orders_insert (роль бизнеса) —
-- она остаётся.

DROP POLICY IF EXISTS orders_insert_public ON public.orders;
DROP POLICY IF EXISTS order_items_insert_public ON public.order_items;

SELECT pg_notify('pgrst', 'reload schema');
