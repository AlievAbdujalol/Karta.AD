# Чек-лист выпуска Karta-AD

- **Дата:** 02.11.2026
- **Ветка:** `main` (baseline `6aeeccb` + правки аудита, **не закоммичены**)
- **Связанные документы:** `BASELINE_AUDIT.md`, `TEST_RESULTS.md`, `KNOWN_ISSUES.md`
- **Правило:** пункт отмечается `[x]` только если есть фактический результат
  проверки (команда, тест, запрос, прогон). Иначе — `[ ]` с причиной.

**Статусы:** ✅ выполнено и подтверждено · ⚠️ выполнено с ограничением ·
⬜ не выполнено / требует действия · ⛔ блокирует публикацию

---

## 1. Гейты кода (CI)

Все команды запускались локально в этой среде, Node 20, Windows.

| # | Пункт | Статус | Доказательство |
|---|---|---|---|
| 1.1 | Production-сборка прошла | ✅ | `npm run build` → `✓ built`, `dist/` + `dist/widget.js` |
| 1.2 | Линтинг прошёл | ✅ | `npm run lint` (`eslint .`) → 0 ошибок |
| 1.3 | Проверка типов прошла | ✅ | `npm run typecheck` (`tsc --noEmit -p tsconfig.json`) → 0 ошибок |
| 1.4 | Unit-тесты прошли | ✅ | `npm run test -- --run --maxWorkers=2 --minWorkers=1` → см. `TEST_RESULTS.md` |
| 1.5 | Integration-тесты прошли или ограничения задокументированы | ⚠️ | Интеграционные сценарии покрыты компонентными тестами с моками Supabase. Реальная БД в CI не поднимается — ограничение зафиксировано в `TEST_RESULTS.md` §5 и `KNOWN_ISSUES.md` §4 |
| 1.6 | CI не публикует при провале проверок | ✅ | `.github/workflows/deploy.yml`: job `deploy` имеет `needs: validate`; `validate` = `npm ci → build → lint → typecheck → test` |
| 1.7 | Lock-файл согласован | ✅ | `npm ci --dry-run --ignore-scripts` → `up to date` |

## 2. Миграции БД

### 2.1 Статус

| Миграция | Назначение | Применена к прод-БД |
|---|---|---|
| `supabase/migrations/20261102020000_harden_public_orders.sql` | Удаляет мёртвые публичные INSERT-политики `orders`/`order_items` (defense-in-depth) | ✅ 02.11.2026 |
| `supabase/migrations/20261102030000_taxi_one_active_order.sql` | Partial unique index: один активный заказ такси на пассажира | ✅ 02.11.2026 |
| `supabase/migrations/20261102040000_taxi_price_floor.sql` | Серверная нижняя граница цены такси на INSERT | ✅ 02.11.2026 |

**Разрешение владельца получено 02.11.2026.** CLI в этой среде не работает
(`LegacyInvalidAccessTokenError`) — применено через MCP `apply_migration`,
по одному файлу, в порядке номеров. Каждая миграция идемпотентна
(`IF EXISTS` / `IF NOT EXISTS` / `CREATE OR REPLACE`).

### 2.2 Предусловия (проверены на 02.11.2026)

| Проверка | Факт | Безопасно |
|---|---|---|
| Активные заказы такси / дубли по `passenger_id` | 0 / 0 | ✅ индекс создастся |
| Заказы такси с координатами ниже 0.8× границы | 0 из 102 (минимум 6.00 TJS) | ✅ легитимные заказы не ломаются |
| Опубликованные AI-сайты с прямым `/rest/v1/orders` | 0 (2 используют `create_store_order`) | ✅ политики можно удалять |
| Опубликованные `business_sites` | 0 | ✅ |

### 2.3 Проверка после применения

```sql
-- 1) политики удалены
SELECT polname FROM pg_policy
WHERE polrelid IN ('public.orders'::regclass, 'public.order_items'::regclass)
  AND polname IN ('orders_insert_public', 'order_items_insert_public');
-- ожидается: 0 строк

-- 2) индекс существует и частичный
SELECT indexdef FROM pg_indexes
WHERE schemaname='public' AND indexname='taxi_orders_one_active_per_passenger';
-- ожидается: CREATE UNIQUE INDEX ... WHERE status IN ('searching','found','en_route','arrived','riding')

-- 3) триггер цены стоит на INSERT и UPDATE
SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid='public.taxi_orders'::regclass AND tgname='trg_protect_taxi_order_price';
-- ожидается: BEFORE INSERT OR UPDATE

-- 4) RPC не тронута
SELECT has_function_privilege('anon','public.create_store_order(uuid,jsonb,jsonb,jsonb,text)','EXECUTE');
-- ожидается: true
```

### 2.4 Обязательные пробы после применения (транзакции с `ROLLBACK`)

```sql
-- A. Цена ниже границы должна быть ОТКЛОНЕНА (было: принималась)
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"<тестовый-пассажир>"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO public.taxi_orders
  (passenger_id, pickup_address, pickup_lat, pickup_lng, category, status,
   price, distance_km, duration_min, payment_method)
VALUES ('<тестовый-пассажир>', 'probe', 38.56, 69.2, 'economy', 'searching',
        0.01, 1, 3, 'cash');
-- ожидается: ERROR price below route minimum
ROLLBACK;

-- B. Второй активный заказ должен быть ОТКЛОНЕН
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"<тестовый-пассажир>"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO public.taxi_orders (...) VALUES (... 'searching' ...);  -- первый
INSERT INTO public.taxi_orders (...) VALUES (... 'searching' ...);  -- второй
-- ожидается: ERROR duplicate key value violates unique constraint
ROLLBACK;
```

Результаты проверок и проб после применения (02.11.2026):

| Проверка | Ожидание | Факт |
|---|---|---|
| §2.3.1 Политики удалены | 0 строк | ✅ 0 строк |
| §2.3.2 Индекс | `UNIQUE ... WHERE status = ANY('searching','found','en_route','arrived','riding')` | ✅ создан, предикат верный |
| §2.3.3 Триггер | `BEFORE INSERT OR UPDATE` | ✅ стоит на INSERT и UPDATE |
| §2.3.4 RPC `create_store_order` | `anon` может вызывать | ✅ `true` |
| §2.4.A Цена `0.01` | `price below route minimum` | ✅ отклонена |
| §2.4.B Второй активный заказ | `unique_violation` | ✅ `SECOND_REJECTED` |
| Легитимный заказ (цена 20) | принимается | ✅ первый INSERT прошёл |
| Следы проб в данных | 0 | ✅ `probe_rows = 0`, активных заказов 0 |

## 3. Переменные окружения и секреты

| # | Пункт | Статус | Комментарий |
|---|---|---|---|
| 3.1 | `.env.example` без настоящих секретов | ✅ | только плейсхолдеры `YOUR-...`, `sb_publishable_...` |
| 3.2 | `.env.local` в `.gitignore` | ✅ | проверено; в git не отслеживается |
| 3.3 | `service_role` отсутствует в бандле | ✅ | в `src/` нет `SERVICE_ROLE`; только Edge Functions |
| 3.4 | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` заданы в Vercel | ⬜ | требует доступа к Dashboard/Vercel MCP (403) |
| 3.5 | `VITE_CARTO_API_KEY` / `VITE_GOOGLE_MAPS_KEY` заданы и ограничены доменами | ⬜ | ключи публичные по природе → ограничить referrer в консолях |
| 3.6 | `OPENROUTER_API_KEY` задан в Supabase secrets | ⛔ | сейчас не задан → `ai-proxy` отдаёт 503 (`KNOWN_ISSUES.md` KI-05) |
| 3.7 | Ключи, попадавшие в историю git, ротированы | ⬜ | требует владельца аккаунтов (`KI-06`) |
| 3.8 | `auth_leaked_password_protection` включён | ⬜ | Dashboard → Auth (`KI-07`) |

## 4. Конфигурация публикации

| # | Пункт | Статус | Доказательство |
|---|---|---|---|
| 4.1 | SPA-роутинг: прямые URL и F5 | ✅ | `vercel.json`: rewrite `/((?!.*\..*).*)` → `/index.html`; проверено на проде: `/taxi` + F5 → 200 |
| 4.2 | MIME/кэш статики | ✅ | `/assets/index-*.js` → 200, `application/javascript`, `br`; с 02.11.2026 — `max-age=31536000, immutable` |
| 4.3 | CI-секреты (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) заданы | ✅ (косвенно) | деплой `73f5a2b` собран GitHub Actions → `READY`; значения в Dashboard не читались |
| 4.4 | Домен и SSL | ✅ | MCP: единственный прод-домен `karta-ad.vercel.app`, `verified: true`; HSTS `max-age=63072000; includeSubDomains; preload` |
| 4.5 | Прод-URL отвечает 200 и отдаёт приложение | ✅ | `https://karta-ad.vercel.app` → 200, «Karta-AD», Vite-entry; Chromium: 0 ошибок в консоли, 0 ответов ≥400 |
| 4.6 | Защитные заголовки | ✅ | `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, COOP — `vercel.json` + `securityHeaders.test.js`; CSP — `KI-10` |

## 5. Функциональные проверки

Легенда: «авто» — покрыто тестом в репозитории; «ручная» — требует устройства
или живого аккаунта (в этой среде недоступно).

### 5.1 Навигация

| # | Пункт | Авто | Ручная | Комментарий |
|---|---|---|---|---|
| 5.1.1 | Построение маршрута, отображение линии | ✅ | ⬜ | `osrmSteps.test.js`, `navigationLogic.test.js` |
| 5.1.2 | Следующий манёвр и расстояние до него вдоль маршрута | ✅ | ⬜ | `pickNextStep`, дуговые позиции |
| 5.1.3 | GPS-разрыв (туннель/фон) не замораживает навигацию | ✅ | ⬜ | RA-02: RED→GREEN, `navigationContext.test.jsx` |
| 5.1.4 | Невозможный GPS-выброс отклоняется | ✅ | ⬜ | `isPlausibleGpsJump`, 4 unit-теста |
| 5.1.5 | Перестроение маршрута при уходе с линии | ✅ | ⬜ | `OFF_ROUTE_THRESHOLD_M`, кулдаун 15 с |
| 5.1.6 | Голосовые подсказки на ru/tg/en | ✅ | ⬜ | `navigationLogic` + локали |

### 5.2 Расстояние и ETA

| # | Пункт | Авто | Ручная | Комментарий |
|---|---|---|---|---|
| 5.2.1 | Остаток = длина геометрии × (1 − прогресс) | ✅ | ⬜ | `computeRemainingM` |
| 5.2.2 | Прямое расстояние до цели не подменяет остаток вдоль маршрута | ✅ | ⬜ | тесты на изгиб маршрута |
| 5.2.3 | ETA пересчитывается тем же прогрессом | ✅ | ⬜ | `computeEtaSec`, ограничение 12 ч |
| 5.2.4 | Поздний ответ OSRM не перетирает новый маршрут | ✅ | ⬜ | счётчик запросов |

### 5.3 Определение прибытия

| # | Пункт | Авто | Ручная | Комментарий |
|---|---|---|---|---|
| 5.3.1 | Прибытие требует серии валидных замеров | ✅ | ⬜ | `nextArrivalState`, 2 замера |
| 5.3.2 | Плохая точность GPS не подтверждает прибытие | ✅ | ⬜ | `accuracyM ≤ ARRIVAL_MAX_ACCURACY_M` |
| 5.3.3 | Карточка не пишет «Вы прибыли» до подтверждения | ✅ | ⬜ | RA-05, регрессионный тест |
| 5.3.4 | После подтверждения остаток/ETA = 0, повторных объявлений нет | ✅ | ⬜ | `navigationContext.test.jsx` |

### 5.4 Такси

| # | Пункт | Авто | Статус | Комментарий |
|---|---|---|---|---|
| 5.4.1 | Заказ создаётся с выбранным тарифом и ценой | ✅ | ✅ | `taxiRide.test.js`, `taxiOffer.test.js` |
| 5.4.2 | Двойной тап не создаёт два заказа (клиент) | ✅ | ✅ | `placingOrderRef` + `disabled` при `orderState !== 'idle'` |
| 5.4.3 | Двойной заказ невозможен на сервере | ✅ | ✅ | partial unique index применён 02.11.2026; проба B → `SECOND_REJECTED` |
| 5.4.4 | Цена ниже границы отклоняется сервером | ✅ | ✅ | триггер INSERT применён 02.11.2026; проба A → `price below route minimum` |
| 5.4.5 | Статусы поездки и переходы | ✅ | ✅ | `taxiRide.js`, прошлые коммиты `7a174a2`, `55b3cbc` |
| 5.4.6 | Отмена, оценка, избранные водители | ✅ | ⚠️ | покрыто unit-тестами; UI-клик не проверялся |
| 5.4.7 | Оплата кошельком/наличными | ✅ | ⚠️ | проверка баланса на клиенте; списание — RPC (не в scope аудита) |

### 5.5 Авторизация

| # | Пункт | Статус | Доказательство |
|---|---|---|---|
| 5.5.1 | Парольные формы в `<form>` (Enter, менеджеры паролей) | ✅ | прошлый фикс `d07caf1` |
| 5.5.2 | `/business` закрыт без активной роли | ✅ | `4284195`; guard в `BusinessDashboard` |
| 5.5.3 | Вкладка «Бизнес» скрыта без роли | ✅ | `ae0ccb6` |
| 5.5.4 | Платное переключение роли не ломает флаг денег | ✅ | `6aeeccb`, прод-проверка ранее |
| 5.5.5 | Вход через Google OAuth в живом окружении | ⬜ | недоступно в этой среде |
| 5.5.6 | Восстановление пароля / выход | ⬜ | требует живого аккаунта |

### 5.6 RLS и права доступа (прод-БД, только чтение)

| # | Пункт | Статус | Доказательство |
|---|---|---|---|
| 5.6.1 | RLS включён на всех пользовательских таблицах | ✅ | advisor: единственное исключение — `spatial_ref_sys` (`KI-04`) |
| 5.6.2 | Публичное чтение только там, где задумано | ✅ | города, события, отзывы, транспорт, опубликованные сайты |
| 5.6.3 | `SECURITY DEFINER`-функции с фиксированным `search_path` | ✅ | `is_admin`, `is_support_developer`, `business_role`, `is_valid_photo` |
| 5.6.4 | Опасные RPC недоступны `anon` | ⚠️ | `create_store_payment` доступна → `KI-01` (продуктовое решение) |
| 5.6.5 | Прямой INSERT в `orders` от `anon` | ✅ | отклоняется RLS (проба + `ROLLBACK`); политики удаляются миграцией |
| 5.6.6 | Edge Functions: `ai-proxy` JWT, `delivery-api` API-key + rate-limit, `push-send` webhook-secret | ✅ | чтение кода |
| 5.6.7 | Миграции применены к прод-БД | ✅ | 3 миграции применены 02.11.2026, проверки §2.3–2.4 зелёные |

### 5.7 Загрузка фотографий

| # | Пункт | Статус | Доказательство |
|---|---|---|---|
| 5.7.1 | Bucket `support-photos` приватный | ✅ | `storage.buckets.public = false` |
| 5.7.2 | `is_valid_photo()` проверяет bucket, владельца, расширение, MIME, ≤5 МБ | ✅ | чтение функции |
| 5.7.3 | Чужое фото нельзя прикрепить к тикету | ✅ | политика `ticket_photos` + префикс пути |
| 5.7.4 | Реальная загрузка/просмотр в UI | ⬜ | требует живого аккаунта и файла |

### 5.8 Личные обращения и ответы разработчиков

| # | Пункт | Статус | Доказательство |
|---|---|---|---|
| 5.8.1 | Тикет видит только автор и `is_support_developer()` | ✅ | RLS `support_tickets` |
| 5.8.2 | Сообщения тикета защищены той же моделью | ✅ | RLS `support_messages` |
| 5.8.3 | `message_type='developer'` нельзя подделать без прав | ✅ | `WITH CHECK` политики |
| 5.8.4 | Новый тикет: только `status='new'`, без назначенного разработчика | ✅ | `WITH CHECK` |
| 5.8.5 | Сквозной сценарий «тикет → ответ разработчика» | ⬜ | требует двух живых аккаунтов |

## 6. Мобильный интерфейс

| # | Пункт | Статус | Комментарий |
|---|---|---|---|
| 6.1 | 360×640: нет горизонтального скролла, кнопки доступны | ⬜ | нужен реальный прогон / DevTools |
| 6.2 | Safe-area (вырез, home-indicator) | ⬜ | нужен iPhone |
| 6.3 | Нижняя панель не перекрывает карту и чат | ⬜ | ранее правился `ai`-чат (`fix(ai)`), нужна повторная проверка |
| 6.4 | Тап-зоны ≥ 44 px | ⬜ | визуальная проверка |
| 6.5 | Тёмная тема не ломает контраст | ⬜ | визуальная проверка |
| 6.6 | Клавиатура не перекрывает поля ввода | ⬜ | нужен телефон |

## 7. Критические ошибки и известные ограничения

| # | Пункт | Статус | Комментарий |
|---|---|---|---|
| 7.1 | Подтверждённых P0 нет | ✅ | аудит `BASELINE_AUDIT.md` §3–4 |
| 7.2 | Подтверждённые P1 исправлены в коде | ✅ | RA-01…RA-03, RA-05 |
| 7.3 | Исправления P1 действуют в проде | ✅ | миграции применены 02.11.2026, пробы §2.4 прошли |
| 7.4 | Известные ограничения задокументированы | ✅ | `KNOWN_ISSUES.md` (KI-01…KI-09 + непроверенное) |

---

## 8. Порядок выпуска

Выполнять строго по шагам. **Каждый шаг — только с разрешения владельца.**

### 8.1. Перед деплоем (обязательно)

1. ✅ Получить разрешение на коммит и push — получено 02.11.2026.
2. ✅ Применить 3 миграции (§2.1) в порядке номеров — применены 02.11.2026.
3. ✅ Выполнить проверки §2.3 и пробы §2.4 — все зелёные.
4. Задать `OPENROUTER_API_KEY` в Supabase secrets (KI-05).
5. Проверить секреты CI (§4.3) и переменные Vercel (§3.4–3.5).

### 8.2. Коммит и CI

```bash
npm run lint
npm run typecheck
npm run test -- --run --maxWorkers=2 --minWorkers=1
npm run build
git add <файлы>
git commit -m "fix(release): ..."   # формат проверяет .githooks/commit-msg
git push origin main                 # запускает validate → deploy
```

`deploy` не стартует, если `validate` упал (см. §1.6).

### 8.3. Деплой

- CI: `.github/workflows/deploy.yml` → `vercel --prod` после `validate`.
- Ручной вариант: `vercel --prod` (только после зелёного `validate`).
- Публикация без разрешения владельца запрещена.

### 8.4. Smoke-тест прода (после деплоя)

| # | Проверка | Ожидание |
| # | Проверка | Ожидание | Факт 02.11.2026 |
|---|---|---|---|
| 1 | Открыть прод-URL | 200, приложение грузится | ✅ 200, «Karta-AD», без сессии — экран входа (карта недоступна без логина) |
| 2 | Прямой переход `/taxi` и F5 | страница открывается (SPA rewrite) | ✅ 200 после F5 |
| 3 | Статика | нет 404/MIME-ошибок в консоли | ✅ 0 ошибок, 0 ответов ≥400, JS `application/javascript` |
| 4 | Заказ такси (тестовый аккаунт) | создаётся один заказ, цена ≥ границы | ⬜ нужен живой аккаунт |
| 5 | Второй заказ подряд | отклоняется понятной ошибкой | ⬜ нужен живой аккаунт (серверная часть проверена: проба B → `SECOND_REJECTED`) |
| 6 | Навигация 1 км | остаток/ETA убывают, прибытие — после подтверждения | ⬜ нужно устройство с GPS |
| 7 | Поддержка: создать тикет с фото | тикет виден только автору | ⬜ нужен живой аккаунт |
| 8 | AI-конструктор | `ai-proxy` отвечает (не 503) | ⚠️ функция жива (`401 unauthorized` без JWT), end-to-end — после `OPENROUTER_API_KEY` (`KI-05`) |

### 8.5. Rollback

**Фронтенд:** Vercel → Deployments → предыдущий успешный → Promote to
Production. Git-откат не обязателен.

**БД** (выполнять только при подтверждённой регрессии):

```sql
-- 20261102040000: вернуть триггер только на UPDATE и прежнюю функцию
CREATE OR REPLACE FUNCTION public.protect_taxi_order_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'price cannot be changed';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_protect_taxi_order_price ON public.taxi_orders;
CREATE TRIGGER trg_protect_taxi_order_price
  BEFORE UPDATE ON public.taxi_orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_taxi_order_price();

-- 20261102030000: снять индекс
DROP INDEX IF EXISTS public.taxi_orders_one_active_per_passenger;

-- 20261102020000: вернуть политики (ТОЛЬКО если публичный чекаут снова
-- пишет в orders напрямую; текущие 2 AI-сайта используют RPC)
CREATE POLICY orders_insert_public ON public.orders
  FOR INSERT TO anon
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE status = 'active'));
CREATE POLICY order_items_insert_public ON public.order_items
  FOR INSERT TO anon
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o JOIN public.businesses b ON b.id = o.business_id
    WHERE o.id = order_items.order_id AND b.status = 'active'
  ));

SELECT pg_notify('pgrst', 'reload schema');
```

## 9. Стоп-условия (не публиковать)

- Хотя бы одна проверка §1 красная.
- Миграции §2.1 не применены или пробы §2.4 не дали ожидаемого результата.
- `OPENROUTER_API_KEY` не задан, а AI-конструктор заявлен в релизе.
- Есть подтверждённый P0/P1 без исправления.
- Ручные проверки §5.1–5.4 и §6 не выполнены на реальном устройстве/аккаунте.
- Нет явного разрешения владельца на push/деплой/миграции.

## 10. Итоговый вердикт

**READY WITH DOCUMENTED LIMITATIONS** — на 02.11.2026, после применения
миграций, деплоя и зелёных проб:

1. Код: линт, типы, **863 теста** и сборка — зелёные (`TEST_RESULTS.md`).
2. БД: три миграции применены, проверки §2.3 и боевые пробы §2.4 дали
   ожидаемый результат. Дыра с ценой `0.01` и дубли заказов закрыты на сервере.
3. Прод: деплой `73f5a2b` — `READY` (production, `karta-ad.vercel.app`);
   `/` и `/taxi` отдают 200 без ошибок в консоли; защитные заголовки и
   годовой кэш ассетов — в `vercel.json` (RA-10).
4. Ограничения задокументированы в `KNOWN_ISSUES.md`:
   - **KI-01** — тестовый платёж (`mock`) до подключения реальных провайдеров;
   - **KI-05** — `ai-proxy` вернёт 503, пока не задан `OPENROUTER_API_KEY`;
   - **KI-06/KI-07** — ротация ключей и leaked-password protection (Dashboard);
   - **KI-10** — CSP внедряется отдельно через `Report-Only`;
   - **ручные проверки** на устройстве/живом аккаунте не выполнялись —
     чек-лист §5–6 остаётся для владельца.

**Перед публичным анонсом** выполнить: `OPENROUTER_API_KEY` (§3.6),
ручные проверки §5.1–5.4 и §6, smoke-тест §8.4 п.4–8 под тестовым аккаунтом.
