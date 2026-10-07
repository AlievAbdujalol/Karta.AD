-- Виджет для внешних сайтов + админ-действия над заказами.
--
-- 1) orders.payment_method — способ оплаты (шлюз подключается позже,
--    карта держится disabled в UI; шов — этот столбец + payment_requests);
-- 2) set_order_status: подтверждённый заказ можно отправить в доставку
--    (админ-конвейер pending → confirmed → in_transit → delivered);
-- 3) update_business_order / delete_business_order — редактирование и
--    удаление заказа из админ-панели с проверкой роли на сервере;
-- 4) get_public_business — публичный каталог для виджета на чужом хостинге
--    (anon не умеет читать products/businesses, а виджету нужен список товаров).
-- Применять по одному statement; после DDL: SELECT pg_notify('pgrst','reload schema');

-- ─── 1. Способ оплаты ────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash'
    CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('cash', 'card'));

-- ─── 2. Переход confirmed → in_transit ───────────────────────────────
CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.orders o
     SET status = p_status, updated_at = now()
   WHERE o.id = p_order_id
     AND (public.business_role(o.business_id) IS NOT NULL OR public.is_admin())
     AND (
          (o.status = 'pending'   AND p_status IN ('confirmed', 'cancelled'))
       OR (o.status = 'confirmed' AND p_status IN ('preparing', 'in_transit', 'cancelled'))
       OR (o.status = 'paid'      AND p_status IN ('preparing', 'cancelled'))
       OR (o.status = 'preparing' AND p_status IN ('ready', 'cancelled'))
       OR (o.status = 'ready'     AND p_status IN ('picked_up', 'completed', 'cancelled'))
       OR (o.status = 'picked_up' AND p_status IN ('in_transit', 'cancelled'))
       OR (o.status = 'in_transit' AND p_status IN ('delivered', 'cancelled'))
       OR (o.status = 'delivered' AND p_status IN ('completed'))
     )
  RETURNING o.status
$function$;

-- ─── 3а. get_business_orders + payment_method ────────────────────────
-- Возврат TABLE меняется → нужен DROP (CREATE OR REPLACE так не может).
DROP FUNCTION public.get_business_orders(uuid, text);

CREATE FUNCTION public.get_business_orders(p_business_id uuid, p_status text DEFAULT NULL)
RETURNS TABLE(
  id uuid, customer_name text, customer_phone text, status text,
  total numeric, currency text, delivery_type text, delivery_address text,
  delivery_lat numeric, delivery_lng numeric, payment_method text,
  notes text, created_at timestamptz, item_count bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT o.id, o.customer_name, o.customer_phone, o.status,
         o.total, o.currency, o.delivery_type, o.delivery_address,
         o.delivery_lat, o.delivery_lng, o.payment_method,
         o.notes, o.created_at,
         (SELECT COUNT(*) FROM public.order_items oi WHERE oi.order_id = o.id) AS item_count
  FROM public.orders o
  WHERE o.business_id = p_business_id
    AND (p_status IS NULL OR o.status = p_status)
    AND (public.business_role(o.business_id) IS NOT NULL OR public.is_admin())
  ORDER BY o.created_at DESC
  LIMIT 100
$function$;

-- ─── 3б. Редактирование заказа (владелец/менеджер) ───────────────────
-- Семантика NULL = «не менять», пустая строка = «очистить».
CREATE OR REPLACE FUNCTION public.update_business_order(
  p_order_id uuid,
  p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_delivery_address text DEFAULT NULL,
  p_delivery_lat numeric DEFAULT NULL,
  p_delivery_lng numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_total numeric DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT public.business_role(o.business_id) INTO v_role
    FROM public.orders o WHERE o.id = p_order_id;

  IF NOT (COALESCE(v_role, '') IN ('owner', 'manager') OR public.is_admin()) THEN
    RETURN false; -- не владелец/менеджер, заказа нет или нет доступа
  END IF;

  IF p_payment_method IS NOT NULL AND p_payment_method NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'unsupported payment_method: %', p_payment_method;
  END IF;
  IF p_total IS NOT NULL AND p_total < 0 THEN
    RAISE EXCEPTION 'total must be >= 0';
  END IF;

  UPDATE public.orders
     SET customer_name    = CASE WHEN p_customer_name IS NOT NULL    THEN NULLIF(trim(p_customer_name), '')    ELSE customer_name END,
         customer_phone   = CASE WHEN p_customer_phone IS NOT NULL   THEN NULLIF(trim(p_customer_phone), '')   ELSE customer_phone END,
         delivery_address = CASE WHEN p_delivery_address IS NOT NULL THEN NULLIF(trim(p_delivery_address), '') ELSE delivery_address END,
         delivery_lat     = COALESCE(p_delivery_lat, delivery_lat),
         delivery_lng     = COALESCE(p_delivery_lng, delivery_lng),
         notes            = CASE WHEN p_notes IS NOT NULL THEN NULLIF(trim(p_notes), '') ELSE notes END,
         payment_method   = COALESCE(p_payment_method, payment_method),
         total            = COALESCE(p_total, total),
         updated_at       = now()
   WHERE id = p_order_id;

  RETURN FOUND;
END
$function$;

-- ─── 3в. Удаление заказа (только владелец; order_items каскадом) ─────
CREATE OR REPLACE FUNCTION public.delete_business_order(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_business uuid;
BEGIN
  SELECT business_id INTO v_business FROM public.orders WHERE id = p_order_id;
  IF v_business IS NULL THEN
    RETURN false;
  END IF;
  IF NOT (COALESCE(public.business_role(v_business), '') = 'owner' OR public.is_admin()) THEN
    RETURN false;
  END IF;

  DELETE FROM public.orders WHERE id = p_order_id;
  RETURN FOUND;
END
$function$;

-- ─── 4. Публичный каталог для виджета ────────────────────────────────
-- Читает только активные бизнесы, отдаёт ровно нужные поля (нет утечки
-- чужих данных; анонимных SELECT-политик на products/businesses нет).
CREATE OR REPLACE FUNCTION public.get_public_business(p_business_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id',      b.id,
    'name',    b.name,
    'type',    b.type,
    'phone',   b.phone,
    'city',    b.city,
    'address', b.address,
    'logo_url', b.logo_url,
    'lat',     b.lat,
    'lng',     b.lng,
    'products', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.name, 'description', p.description,
               'price', p.price, 'currency', p.currency, 'stock', p.stock,
               'image_url', p.image_url, 'category_id', p.category_id,
               'category', c.name
             ) ORDER BY p.created_at DESC)
      FROM public.products p
      LEFT JOIN public.categories c ON c.id = p.category_id
      WHERE p.business_id = b.id AND p.is_active
    ), '[]'::jsonb)
  )
  FROM public.businesses b
  WHERE b.id = p_business_id AND b.status = 'active'
$function$;

SELECT pg_notify('pgrst', 'reload schema');
