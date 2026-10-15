-- Push-уведомления (Web Push): подписки, конфиг, серверные триггеры.
--
-- Модель:
--   1) Единый воронок: AFTER INSERT на notifications → pg_net → Edge Function
--      push-send → Web Push. Любая будущая вставка в notifications автоматически
--      уходит push'ем (доставка, платежи, документы и т.д.).
--   2) Доменные триггеры вставляют строки в notifications для событий, которых
--      раньше на сервере не было (новый заказ такси, смена статуса, чат) —
--      чтобы push уходил даже при закрытом приложении.
--
-- Безопасность:
--   - VAPID-ключи генерирует сама Edge Function при первом запросе и хранит в
--     push_config (RLS без политик → читает только service_role). Приватный
--     ключ отсутствует в репозитории и в env.
--   - webhook_secret генерируется в БД (gen_random_bytes), не в файле.
--   - Триггеры SECURITY DEFINER (обход RLS как владелец), но обёрнуты в
--     exception: сбой push НИКОГДА не откатывает основную операцию.

-- ─── 1. Подписки браузеров ────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  endpoint    text not null unique,       -- endpoint push-сервиса (FCM/Mozilla)
  p256dh      text not null,              -- ключ шифрования payload
  auth        text not null,              -- ключ аутентификации подписки
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Пользователь видит/правит только свои подписки. service_role обходит RLS.
drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- ─── 2. Конфиг пушей (VAPID + секрет) ────────────────────────────────────
-- RLS включён, политики НЕ создаются → читает/пишет только service_role
-- (Edge Function) и владелец (триггеры SECURITY DEFINER). Приватный ключ
-- VAPID сюда положит Edge Function при первом GET /vapid-public-key.
create table if not exists public.push_config (
  id                 boolean primary key default true check (id),
  send_url           text not null,                      -- URL Edge Function push-send
  webhook_secret     text not null,                      -- общий секрет trigger→function
  vapid_public_key   text,                               -- заполняет Edge Function
  vapid_private_key  text,                               -- заполняет Edge Function
  vapid_subject      text not null default 'mailto:admin@karta.tj',
  updated_at         timestamptz not null default now()
);

alter table public.push_config enable row level security;

-- Секрет генерируется в БД — не попадает в репозиторий.
insert into public.push_config (id, send_url, webhook_secret)
values (
  true,
  'https://eotkmnwneivithfkweds.supabase.co/functions/v1/push-send',
  encode(gen_random_bytes(32), 'hex')
)
on conflict (id) do nothing;

-- ─── 3. Воронок: notifications → push ────────────────────────────────────
create or replace function public.dispatch_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_url    text;
begin
  if NEW.user_id is null then
    return NEW;
  end if;

  select webhook_secret, send_url
    into v_secret, v_url
  from push_config
  where id = true;

  if v_url is null or v_secret is null then
    return NEW;
  end if;

  -- pg_net асинхронен: не блокирует и не откатывает основную транзакцию.
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'user_ids', array[NEW.user_id],
      'title',    NEW.title,
      'body',     NEW.body,
      'tag',      NEW.type,
      'url',      coalesce(NEW.data ->> 'url', '/'),
      'data',     coalesce(NEW.data, '{}'::jsonb)
    ),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 5000
  );

  return NEW;
exception when others then
  -- Push — побочный эффект. Его сбой не должен ломать основную операцию.
  raise warning 'dispatch_push failed: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists notifications_dispatch_push on public.notifications;
create trigger notifications_dispatch_push
  after insert on public.notifications
  for each row execute function public.dispatch_push();

-- ─── 4. Новый заказ такси → ближайшим свободным водителям ────────────────
-- Раньше строку в notifications создавал только открытый клиент водителя
-- (TaxiDriverDashboard). Теперь сервер вставляет её независимо от того,
-- открыто ли приложение, — push доставит уведомление закрытому водителю.
-- Радиус и категория зеркалят клиентские DRIVER_MATCH_RADIUS_KM / category.
create or replace function public.taxi_notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  if NEW.status <> 'searching' or NEW.driver_id is not null then
    return NEW;
  end if;
  if NEW.pickup_lat is null or NEW.pickup_lng is null then
    return NEW;
  end if;

  for d in
    select distinct l.driver_id
    from taxi_driver_locations l
    join taxi_vehicles v on v.driver_id = l.driver_id
    where l.status = 'free'
      and l.lat is not null
      and l.lng is not null
      and l.updated_at > now() - interval '10 minutes'
      and v.category = NEW.category
      and (6371 * acos(least(1.0, greatest(-1.0,
            cos(radians(NEW.pickup_lat)) * cos(radians(l.lat)) *
            cos(radians(l.lng) - radians(NEW.pickup_lng)) +
            sin(radians(NEW.pickup_lat)) * sin(radians(l.lat))
          )))) <= 12  -- DRIVER_MATCH_RADIUS_KM
  loop
    insert into notifications (user_id, title, body, type, data)
    values (
      d.driver_id,
      'Новый заказ · ' || coalesce(NEW.price::text, '?') || ' ' || coalesce(NEW.currency, 'TJS'),
      coalesce(NEW.pickup_address, 'Забор') ||
        case when NEW.dropoff_address is not null and NEW.dropoff_address <> ''
             then ' → ' || NEW.dropoff_address else '' end,
      'taxi_new_order',
      jsonb_build_object('order_id', NEW.id, 'url', '/taxi/driver')
    );
  end loop;

  return NEW;
exception when others then
  raise warning 'taxi_notify_new_order failed: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists taxi_orders_new_order_notify on public.taxi_orders;
create trigger taxi_orders_new_order_notify
  after insert on public.taxi_orders
  for each row execute function public.taxi_notify_new_order();

-- ─── 5. Смена статуса заказа → пассажиру ──────────────────────────────────
create or replace function public.taxi_notify_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if NEW.status is distinct from OLD.status then
    v_title := case NEW.status
      when 'found'     then 'Водитель принял заказ'
      when 'en_route'  then 'Водитель в пути'
      when 'arrived'   then 'Водитель на месте'
      when 'completed' then 'Поездка завершена'
      when 'cancelled' then 'Заказ отменён'
    end;

    if v_title is not null and NEW.passenger_id is not null then
      insert into notifications (user_id, title, body, type, data)
      values (
        NEW.passenger_id,
        v_title,
        coalesce(NEW.pickup_address, 'Ваш заказ'),
        'taxi_status',
        jsonb_build_object('order_id', NEW.id, 'status', NEW.status, 'url', '/taxi')
      );
    end if;
  end if;

  return NEW;
exception when others then
  raise warning 'taxi_notify_status_change failed: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists taxi_orders_status_notify on public.taxi_orders;
create trigger taxi_orders_status_notify
  after update on public.taxi_orders
  for each row execute function public.taxi_notify_status_change();

-- ─── 6. Сообщение в чате заказа → второму участнику ───────────────────────
create or replace function public.taxi_notify_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  v_recipient uuid;
begin
  select passenger_id, driver_id into o
  from taxi_orders
  where id = NEW.order_id;

  if not found or o.driver_id is null then
    return NEW;
  end if;

  v_recipient := case when NEW.sender_id = o.passenger_id
                      then o.driver_id else o.passenger_id end;

  insert into notifications (user_id, title, body, type, data)
  values (
    v_recipient,
    'Новое сообщение',
    left(coalesce(NEW.message, ''), 120),
    'taxi_chat',
    jsonb_build_object('order_id', NEW.order_id, 'url', '/taxi')
  );

  return NEW;
exception when others then
  raise warning 'taxi_notify_chat failed: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists taxi_messages_chat_notify on public.taxi_messages;
create trigger taxi_messages_chat_notify
  after insert on public.taxi_messages
  for each row execute function public.taxi_notify_chat();

-- ─── 7. Перезагрузка схемы для PostgREST ──────────────────────────────────
select pg_notify('pgrst', 'reload schema');
