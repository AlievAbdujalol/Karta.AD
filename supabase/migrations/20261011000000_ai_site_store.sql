-- AI-сайт: настройки сайта, slug для /store/:slug, платежи и серверный
-- расчёт заказа (спецификация §3, §8, §10, §12, §14).
--
-- Маппинг таблиц спецификации на СУЩЕСТВУЮЩИЕ (дубли не создаём):
--   business_websites    -> ai_projects
--   website_generations  -> ai_project_versions
--   website_deployments  -> ai_project_versions.is_published + ai_projects.slug
--   website_themes       -> фронтовые пресеты (src/lib/siteThemes.js)
--   website_settings     -> новая таблица ниже
--   payments             -> новая таблица ниже
--
-- Делаются 4 шага; применять по одному statement:
--   1) таблицы website_settings / payments + slug на ai_projects;
--   2) триггер slug;
--   3) RPC create_store_order / create_store_payment / get_public_store;
--   4) RLS + гранты + reload schema.

-- ─── 1. Таблицы ──────────────────────────────────────────────────────

-- Настройки визарда AI-сайта: один конфиг на бизнес.
CREATE TABLE IF NOT EXISTS public.website_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE
    REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- STEP 1: тип сайта
  site_type text NOT NULL DEFAULT 'shop'
    CONSTRAINT website_settings_site_type_check CHECK (site_type IN (
      'shop', 'restaurant', 'clothing', 'electronics',
      'cosmetics', 'grocery', 'services', 'other'
    )),
  -- STEP 2: визуальный стиль
  style text NOT NULL DEFAULT 'modern'
    CONSTRAINT website_settings_style_check CHECK (style IN (
      'minimal', 'modern', 'luxury', 'dark', 'street', 'fashion', 'glass', 'ai'
    )),
  -- STEP 3: информация о бизнесе
  hero_title text NOT NULL DEFAULT '',
  hero_description text NOT NULL DEFAULT '',
  logo_url text,
  font text NOT NULL DEFAULT 'Inter',
  socials jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- включённые секции
  show_delivery boolean NOT NULL DEFAULT true,
  show_payment boolean NOT NULL DEFAULT true,
  -- STEP 5: доставка (mode: free | fixed | distance | karta)
  delivery jsonb NOT NULL DEFAULT '{
    "enabled": true, "mode": "fixed", "radius_km": 10,
    "price": 15, "min_order": 100
  }'::jsonb,
  -- STEP 6: оплата (providers: cash | card | alif | eskhata | dushanbe_city)
  payment jsonb NOT NULL DEFAULT '{
    "online": false, "cod": true, "providers": ["cash"]
  }'::jsonb,
  -- STEP 7: последний AI-промпт
  prompt text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Платежи заказов (секция 12: PaymentProvider; mock-режим пишет сюда же).
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL
    REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_id uuid
    REFERENCES public.orders(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'mock'
    CONSTRAINT payments_provider_check CHECK (provider IN (
      'mock', 'alif', 'eskhata', 'dushanbe_city'
    )),
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT payments_status_check CHECK (status IN (
      'pending', 'succeeded', 'failed', 'refunded'
    )),
  -- amount всегда = orders.total, вычисленному сервером
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'TJS',
  external_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_business ON public.payments (business_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments (status);

CREATE TRIGGER trg_website_settings_updated_at
  BEFORE UPDATE ON public.website_settings
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Публичный адрес сайта: /store/:slug
ALTER TABLE public.ai_projects ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_projects_slug
  ON public.ai_projects (slug);

-- ─── 2. Автосlug из названия проекта ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.ensure_project_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_base text;
  v_slug text;
BEGIN
  -- Валидный ручной slug не трогаем
  IF NEW.slug IS NOT NULL AND NEW.slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' THEN
    RETURN NEW;
  END IF;
  -- Транслитерация не нужна: кириллица вырезается, остаётся латиница/цифры
  v_base := trim(both '-' from regexp_replace(lower(coalesce(NEW.name, 'store')), '[^a-z0-9]+', '-', 'g'));
  IF length(v_base) < 2 THEN
    v_base := 'store-' || substr(md5(NEW.id::text || now()::text), 1, 6);
  END IF;
  v_base := left(v_base, 56);
  v_slug := v_base;
  WHILE EXISTS (
    SELECT 1 FROM public.ai_projects p
    WHERE p.slug = v_slug AND p.id IS DISTINCT FROM NEW.id
  ) LOOP
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
  END LOOP;
  NEW.slug := v_slug;
  RETURN NEW;
END
$function$;

CREATE TRIGGER trg_ai_projects_slug
  BEFORE INSERT OR UPDATE OF name, slug ON public.ai_projects
  FOR EACH ROW EXECUTE FUNCTION ensure_project_slug();

-- ─── 3. RPC ──────────────────────────────────────────────────────────

-- 3а. Публичный заказ: цены и доставка считаются ТОЛЬКО на сервере
-- (frontend присылает лишь id товаров и количества — §10/§14).
CREATE OR REPLACE FUNCTION public.create_store_order(
  p_business_id uuid,
  p_items jsonb,
  p_customer jsonb DEFAULT '{}'::jsonb,
  p_delivery jsonb DEFAULT '{}'::jsonb,
  p_payment_method text DEFAULT 'cash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_business record;
  v_settings record;
  v_item jsonb;
  v_product record;
  v_qty int;
  v_subtotal numeric := 0;
  v_delivery_cost numeric := 0;
  v_total numeric;
  v_order_id uuid;
  v_name text;
  v_phone text;
  v_recent int;
  v_free_from numeric;
BEGIN
  -- Входные данные
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'bad_items';
  END IF;
  v_name  := nullif(trim(coalesce(p_customer->>'name', '')), '');
  v_phone := nullif(trim(coalesce(p_customer->>'phone', '')), '');
  IF v_phone IS NULL OR v_phone !~ '^[0-9+() -]{7,20}$' THEN
    RAISE EXCEPTION 'bad_phone';
  END IF;
  IF p_payment_method NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'bad_payment_method';
  END IF;

  SELECT b.id, b.status INTO v_business
    FROM public.businesses b WHERE b.id = p_business_id;
  IF NOT FOUND OR v_business.status <> 'active' THEN
    RAISE EXCEPTION 'business_unavailable';
  END IF;

  -- Rate limit: не чаще 5 заказов с одного телефона на бизнес за 10 минут
  SELECT count(*) INTO v_recent
    FROM public.orders o
   WHERE o.business_id = p_business_id
     AND o.customer_phone = v_phone
     AND o.created_at > now() - interval '10 minutes';
  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'too_many_orders';
  END IF;

  -- Сумма по АКТУАЛЬНЫМ ценам из products (цена клиента игнорируется)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty < 1 OR v_qty > 99 THEN
      RAISE EXCEPTION 'bad_quantity';
    END IF;
    SELECT p.id, p.name, p.price, p.stock INTO v_product
      FROM public.products p
     WHERE p.id = (v_item->>'product_id')::uuid
       AND p.business_id = p_business_id
       AND p.is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'unknown_product';
    END IF;
    IF v_product.stock IS NOT NULL AND v_product.stock < v_qty THEN
      RAISE EXCEPTION 'out_of_stock';
    END IF;
    v_subtotal := v_subtotal + round(v_product.price * v_qty, 2);
  END LOOP;

  -- Доставка из website_settings (настройки валидируем сервером)
  SELECT * INTO v_settings
    FROM public.website_settings w WHERE w.business_id = p_business_id;

  IF coalesce(p_delivery->>'type', 'delivery') <> 'pickup' THEN
    IF v_settings.id IS NOT NULL
       AND coalesce(v_settings.delivery->>'enabled', 'true') = 'true' THEN
      v_free_from := NULLIF(v_settings.delivery->>'free_from', '')::numeric;
      IF v_free_from IS NOT NULL AND v_subtotal >= v_free_from THEN
        v_delivery_cost := 0; -- бесплатная доставка от суммы
      ELSE
        v_delivery_cost := CASE coalesce(v_settings.delivery->>'mode', 'fixed')
          WHEN 'free' THEN 0
          ELSE coalesce(NULLIF(v_settings.delivery->>'price', '')::numeric, 0)
        END;
      END IF;
      -- Минимальная сумма заказа
      IF NULLIF(v_settings.delivery->>'min_order', '')::numeric IS NOT NULL
         AND v_subtotal < NULLIF(v_settings.delivery->>'min_order', '')::numeric THEN
        RAISE EXCEPTION 'min_order_not_met';
      END IF;
    END IF;
  END IF;

  v_total := round(v_subtotal + v_delivery_cost, 2);

  INSERT INTO public.orders (
    business_id, customer_name, customer_phone, status, total, currency,
    delivery_type, delivery_address, delivery_lat, delivery_lng,
    payment_method, notes
  ) VALUES (
    p_business_id, v_name, v_phone, 'pending', v_total, 'TJS',
    coalesce(p_delivery->>'type', 'delivery'),
    nullif(trim(coalesce(p_delivery->>'address', '')), ''),
    CASE WHEN coalesce(p_delivery->>'lat', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (p_delivery->>'lat')::numeric END,
    CASE WHEN coalesce(p_delivery->>'lng', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (p_delivery->>'lng')::numeric END,
    p_payment_method,
    nullif(trim(coalesce(p_customer->>'notes', '')), '')
  )
  RETURNING id INTO v_order_id;

  -- Позиции: имя/цена/итог — из products, не из запроса
  INSERT INTO public.order_items
    (order_id, product_id, product_name, quantity, price, total)
  SELECT v_order_id, p.id, p.name, s.qty, p.price, round(p.price * s.qty, 2)
  FROM (
    SELECT (elem->>'product_id')::uuid AS pid,
           SUM(COALESCE((elem->>'quantity')::int, 1))::int AS qty
      FROM jsonb_array_elements(p_items) elem
     GROUP BY 1
  ) s
  JOIN public.products p
    ON p.id = s.pid AND p.business_id = p_business_id AND p.is_active;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'total', v_total,
    'delivery_cost', v_delivery_cost
  );
END
$function$;

-- 3б. Создание платежа (mock-режим сразу succeeded; провайдеры — pending
-- до серверного webhook, §12). amount берётся из orders.total.
CREATE OR REPLACE FUNCTION public.create_store_payment(
  p_order_id uuid,
  p_provider text DEFAULT 'mock'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order record;
  v_payment_id uuid;
  v_status text;
BEGIN
  IF p_provider NOT IN ('mock', 'alif', 'eskhata', 'dushanbe_city') THEN
    RAISE EXCEPTION 'unknown_provider';
  END IF;

  SELECT o.id, o.business_id, o.total, o.currency, b.status AS business_status
    INTO v_order
    FROM public.orders o
    JOIN public.businesses b ON b.id = o.business_id
   WHERE o.id = p_order_id;
  IF NOT FOUND OR v_order.business_status <> 'active' THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  -- mock = тестовый шлюз: успех сразу. Реальные провайдеры ждут webhook.
  v_status := CASE WHEN p_provider = 'mock' THEN 'succeeded' ELSE 'pending' END;

  INSERT INTO public.payments
    (business_id, order_id, provider, status, amount, currency)
  VALUES
    (v_order.business_id, p_order_id, p_provider, v_status,
     v_order.total, v_order.currency)
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'provider', p_provider,
    'status', v_status,
    'amount', v_order.total,
    'currency', v_order.currency
  );
END
$function$;

-- 3в. Публичная загрузка опубликованного сайта по slug (/store/:slug)
CREATE OR REPLACE FUNCTION public.get_public_store(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'project_id', p.id,
    'name', p.name,
    'business_id', p.business_id,
    'html', v.html,
    'files', v.files
  )
  FROM public.ai_projects p
  JOIN public.businesses b ON b.id = p.business_id
  JOIN LATERAL (
    SELECT v1.html, v1.files
      FROM public.ai_project_versions v1
     WHERE v1.project_id = p.id AND v1.is_published
     ORDER BY v1.version DESC
     LIMIT 1
  ) v ON true
  WHERE p.slug = p_slug AND b.status = 'active'
$function$;

-- ─── 4. RLS + гранты ─────────────────────────────────────────────────

ALTER TABLE public.website_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS website_settings_select ON public.website_settings;
DROP POLICY IF EXISTS website_settings_insert ON public.website_settings;
DROP POLICY IF EXISTS website_settings_update ON public.website_settings;
DROP POLICY IF EXISTS website_settings_delete ON public.website_settings;

-- Владелец/менеджер читает и правит настройки своего бизнеса.
CREATE POLICY website_settings_select ON public.website_settings
  FOR SELECT USING (
    public.business_role(business_id) IS NOT NULL OR public.is_admin()
  );
CREATE POLICY website_settings_insert ON public.website_settings
  FOR INSERT WITH CHECK (
    public.business_role(business_id) IN ('owner', 'manager')
      OR public.is_admin()
  );
CREATE POLICY website_settings_update ON public.website_settings
  FOR UPDATE USING (
    public.business_role(business_id) IN ('owner', 'manager')
      OR public.is_admin()
  )
  WITH CHECK (
    public.business_role(business_id) IN ('owner', 'manager')
      OR public.is_admin()
  );
CREATE POLICY website_settings_delete ON public.website_settings
  FOR DELETE USING (
    public.business_role(business_id) = 'owner' OR public.is_admin()
  );

-- Платежи: читают владелец/менеджер/админ; INSERT только через RPC
-- SECURITY DEFINER (политик INSERT для анона нет — баланс вычисляет сервер).
DROP POLICY IF EXISTS payments_select ON public.payments;
DROP POLICY IF EXISTS payments_update ON public.payments;
DROP POLICY IF EXISTS payments_delete ON public.payments;

CREATE POLICY payments_select ON public.payments
  FOR SELECT USING (
    public.business_role(business_id) IS NOT NULL OR public.is_admin()
  );
CREATE POLICY payments_update ON public.payments
  FOR UPDATE USING (
    public.business_role(business_id) IN ('owner', 'manager')
      OR public.is_admin()
  )
  WITH CHECK (
    public.business_role(business_id) IN ('owner', 'manager')
      OR public.is_admin()
  );
CREATE POLICY payments_delete ON public.payments
  FOR DELETE USING (
    public.business_role(business_id) = 'owner' OR public.is_admin()
  );

GRANT EXECUTE ON FUNCTION
  public.create_store_order(uuid, jsonb, jsonb, jsonb, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.create_store_payment(uuid, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.get_public_store(text)
  TO anon, authenticated;

SELECT pg_notify('pgrst', 'reload schema');
