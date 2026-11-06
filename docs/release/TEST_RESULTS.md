# Результаты тестирования

- **Дата:** 02.11.2026
- **Ветка:** `main` (baseline `6aeeccb` + незакоммиченные правки аудита)
- **Окружение:** Windows 10, Node 20, Vitest 3.2.7, jsdom
- **Связанные документы:** `BASELINE_AUDIT.md`, `RELEASE_CHECKLIST.md`, `KNOWN_ISSUES.md`

## 1. Метод

1. Снят baseline **до** любых изменений.
2. Для каждого исправления — регрессионный тест, который **падает на старом
   коде** (RED) и проходит после правки (GREEN).
3. Итоговый прогон всех гейтов после последней правки.
4. Прод-проверки — только чтение и транзакции с `ROLLBACK`; данные не менялись,
   миграции не применялись.

Все команды запускались с ограничением воркеров
(`--maxWorkers=2 --minWorkers=1`), чтобы прогон был стабилен на этой машине.

## 2. Baseline (до правок)

| Проверка | Команда | Результат |
|---|---|---|
| Линт | `npm run lint` | ✅ 0 ошибок |
| Типы | `npm run typecheck` | ✅ 0 ошибок |
| Тесты | `npm run test -- --run --maxWorkers=2 --minWorkers=1` | ✅ **844/844**, 83 файла |
| Сборка | `npm run build` | ✅ `dist/` + `dist/widget.js` |
| Lock-файл | `npm ci --dry-run --ignore-scripts` | ✅ `up to date` |

## 3. Новые и изменённые тесты

| Файл | Изменение | Тестов |
|---|---|---|
| `src/test/publicOrdersPolicy.test.js` | **новый**: миграции `orders`/`order_items`, индекс такси, нижняя граница цены | 5 |
| `src/test/navigationContext.test.jsx` | +2 сценария: GPS-разрыв, прибытие до подтверждения | 16 → 18 |
| `src/test/navigationLogic.test.js` | +4 unit-теста `isPlausibleGpsJump` | 31 → 35 |

### 3.1 RED → GREEN: RA-02 (навигация после GPS-разрыва)

**RED** — временно возвращён старый порог `jump > 150 → return`:

```
× NavigationContext — жизненный цикл маршрута > после GPS-разрыва навигация
  догоняет позицию, а невозможный выброс отклоняется
AssertionError: expected 69.2 to be close to 69.204595201612,
  received difference is 0.004595201611991229, but expected 5e-7
Test Files  1 failed (1)
     Tests  1 failed | 16 skipped (17)
```

Позиция осталась на старой точке — дефект воспроизведён.

**GREEN** — после фикса `isPlausibleGpsJump`:

```
✓ src/test/navigationLogic.test.js   (35 tests)
✓ src/test/navigationContext.test.jsx (18 tests)
Test Files  2 passed (2)
     Tests  53 passed (53)
```

### 3.2 RED → GREEN: RA-05 (ложное «Вы прибыли»)

Тест «карточка не объявляет прибытие до подтверждения, даже вплотную к цели»:
до фикса карточка отдавала `L.arrive` при расстоянии ≤ 30 м и одном замере
(`hasArrived = false`). После фикса:

```
expect(nav.hasArrived).toBe(false);
expect(nav.nextInstruction.text).not.toBe('Вы прибыли в пункт назначения');
expect(nav.nextInstruction.text).toMatch(/пункт назначения/);
```

Второй валидный замер → `hasArrived = true` и текст «Вы прибыли…».

### 3.3 Регресс миграций (статический тест)

`src/test/publicOrdersPolicy.test.js` проверяет последнюю миграцию, которая
упоминает объект:

| Проверка | Результат |
|---|---|
| `orders_insert_public` удаляется `DROP POLICY IF EXISTS` | ✅ |
| `order_items_insert_public` удаляется | ✅ |
| `create_store_order` не отозвана у `anon` | ✅ |
| `taxi_orders_one_active_per_passenger` — `CREATE UNIQUE INDEX ... WHERE status IN (...)` | ✅ |
| `protect_taxi_order_price` — `BEFORE INSERT OR UPDATE`, `RAISE EXCEPTION 'price below route minimum'` | ✅ |

> Первая версия теста ошибочно искала `TG_OP = 'INSERT'` — в миграции INSERT
> обрабатывается после блока UPDATE, такой строки нет. Тест падал; проверка
> заменена на фактический отказ по цене. Это была ошибка теста, не кода.

## 4. Итоговый прогон

```
npm run lint
npm run typecheck
npm run test -- --run --maxWorkers=2 --minWorkers=1
npm run build
```

| Гейт | Результат |
|---|---|
| `npm run lint` | ✅ 0 ошибок |
| `npm run typecheck` | ✅ 0 ошибок |
| Тесты | ✅ **863/863**, 85 файлов |
| `npm run build` | ✅ `✓ built in 18.38s` (приложение) + `✓ built in 1.15s` (виджет), `dist/widget.js` 24.86 kB (gzip 9.47 kB) |

> Финальный прогон выполнен после **всех** правок: сообщение об активном
> заказе и состояние кнопки «Заказать» в `TaxiPassenger.jsx`, затем
> `vercel.json` (заголовки и кэш) + `securityHeaders.test.js` (+8 тестов,
> 855 → 863, 84 → 85 файлов).
> В промежуточном прогоне было `854/855` из-за ошибки в самом новом тесте
> (см. §3.3) — исправлено.

## 5. Прод-проверки (Supabase, только чтение / `ROLLBACK`)

| # | Проба | Метод | Результат |
|---|---|---|---|
| 1 | Цена такси `0.01` при INSERT | `SET LOCAL ROLE authenticated`, JWT-claims реального пассажира, транзакция + `ROLLBACK` | ❌ **принята** (`id`, `price 0.01`) → RA-01 подтверждён |
| 2 | Прямой INSERT в `orders` от `anon` | `SET LOCAL ROLE anon`, транзакция + `ROLLBACK` | ✅ отклонён: `42501 new row violates row-level security policy` (нет SELECT-политики на `businesses`) → RA-04 = мёртвый код |
| 3 | Исторические заказы такси ниже границы 0.8× | `SELECT count(*) ... haversine + calculate_taxi_price` | ✅ 0 из 102 (минимум 6.00 TJS) — миграция безопасна |
| 4 | Активные/дублирующиеся заказы такси | `GROUP BY passenger_id HAVING count(*) > 1` | ✅ 0 дублей — индекс создастся |
| 5 | Опубликованные сайты с прямым `/rest/v1/orders` | `count(*) FILTER (html ILIKE ...)` | ✅ 0 прямых, 2 через `create_store_order` |
| 6 | RLS-политики `support_*`, `community_*`, `reviews` | `pg_policy` | ✅ соответствуют модели доступа |
| 7 | `SECURITY DEFINER`-функции | `pg_proc` + `pg_get_functiondef` | ✅ фиксированный `search_path`, проверки роли |

Пробы 1 и 2 выполнены в транзакциях с `ROLLBACK`: id заказа и цена в БД не
остались. На момент проб (до применения) миграции к прод-БД не применялись.

### 5.1 После применения миграций (02.11.2026)

| # | Проверка | Результат |
|---|---|---|
| 1 | `pg_policies` для `orders_insert_public` / `order_items_insert_public` | ✅ 0 строк (удалены) |
| 2 | `pg_indexes.taxi_orders_one_active_per_passenger` | ✅ `UNIQUE ... WHERE status = ANY('searching','found','en_route','arrived','riding')` |
| 3 | `pg_trigger.trg_protect_taxi_order_price` | ✅ `BEFORE INSERT OR UPDATE` |
| 4 | `has_function_privilege('anon','create_store_order(...)','EXECUTE')` | ✅ `true` |
| 5 | Проба A: INSERT `price = 0.01` от реального пассажира, `ROLLBACK` | ✅ `price below route minimum` |
| 6 | Проба B: два активных заказа подряд, `ROLLBACK` | ✅ первый принят, второй `SECOND_REJECTED` |
| 7 | Следы проб | ✅ `probe_rows = 0`, активных заказов 0, `probe_store_orders = 0` |
| 8 | Security advisor после DDL | ✅ новых замечаний нет (`spatial_ref_sys` — известный KI-04) |

Пробы выполнены в транзакциях с `ROLLBACK`; данные не изменились.

### 5.2 Прод после деплоя (02.11.2026)

Деплой коммита `73f5a2b`: Vercel → `READY`, `target: production`,
алиас `https://karta-ad.vercel.app`.

| # | Проверка | Метод | Результат |
|---|---|---|---|
| 1 | `/` | HTTP + Chromium | ✅ 200, `text/html`, заголовок «Karta-AD» |
| 2 | `/taxi` + F5 | HTTP + Chromium | ✅ 200, SPA-rewrite, ошибок нет |
| 3 | Ассеты | HTTP | ✅ `/assets/index-*.js` → 200, `application/javascript`, `br` |
| 4 | Консоль и сеть | Chromium (11 запросов) | ✅ 0 ошибок, 0 ответов ≥400 |
| 5 | Экранирование входа | Chromium | ✅ без сессии показывается экран входа (не белый экран, не падение) |
| 6 | Заголовки | HTTP | ❌ до фикса: не было `x-content-type-options`, `x-frame-options`, `referrer-policy`, `permissions-policy` → RA-10 |
| 7 | Кэш ассетов | HTTP | ❌ до фикса: `max-age=0, must-revalidate` → RA-10 |
| 8 | `ai-proxy` | HTTP POST без JWT | ✅ функция жива, отвечает `401 unauthorized` (не 503); end-to-end с ключом — KI-05 |

После деплоя `b16cc92` (`security(headers)`, `READY`) проверено повторно:

| # | Проверка | Факт |
|---|---|---|
| 9 | Заголовки HTML | ✅ `nosniff`, `SAMEORIGIN`, `strict-origin-when-cross-origin`, `geolocation=(self), camera=(self), microphone=(self)`, `same-origin-allow-popups`, HSTS |
| 10 | Кэш ассетов | ✅ `/assets/index-CMJc75zU.js` → `public, max-age=31536000, immutable` |
| 11 | Приложение после смены конфига | ✅ 200, «Karta-AD», 0 ошибок в консоли, 0 ответов ≥400 |

Пункты 4–8 чек-листа §8.4 (заказ такси, второй заказ, навигация, поддержка,
AI-конструктор) требуют живого аккаунта — остаются в §6.

## 6. Что не проверялось (и почему)

| Область | Причина | Как закрыть |
|---|---|---|
| UI-клики под живым аккаунтом | Google OAuth, автоматического доступа нет | ручной проход §5 чек-листа |
| Реальный GPS (туннель, фон) | нет устройства с GPS | пройти маршрут с приложением в фоне |
| 360 px / safe-area / клавиатура | нет устройств и эмулятора | DevTools + телефон |
| Push-уведомления | нужны VAPID и разрешение браузера | включить и проверить доставку |
| Реальная оплата | провайдеры `available: false` | после решения KI-01 |
| Деплой и прод-URL | — | ✅ проверено 02.11.2026: деплой READY, `/` и `/taxi` — 200 |
| `ai-proxy` end-to-end | нет `OPENROUTER_API_KEY` | задать секрет в Dashboard |

Эти ограничения не маскируются: они перечислены и в `KNOWN_ISSUES.md` §4.

## 7. Как воспроизвести

```bash
npm ci
npm run lint
npm run typecheck
npm run test -- --run --maxWorkers=2 --minWorkers=1
npm run build

# точечно
npx vitest run src/test/navigationLogic.test.js
npx vitest run src/test/navigationContext.test.jsx
npx vitest run src/test/publicOrdersPolicy.test.js
npx vitest run src/test/securityHeaders.test.js
```

Ожидаемо: 863 теста, 85 файлов, 0 падений.

## 8. Вывод

- Все автоматические гейты зелёные: lint, typecheck, 863 теста, build.
- Подтверждённые дефекты RA-01…RA-05 закрыты кодом и/или миграцией, каждый —
  с воспроизведением или регрессионным тестом. RA-10 (заголовки и кэш)
  закрыт конфигом и статическим тестом.
- Три миграции применены к прод-БД 02.11.2026; schema-checks и боевые пробы
  (цена `0.01`, второй активный заказ) дали ожидаемый отказ, следов в данных нет.
- Прод задеплоен и отвечает: `/` и `/taxi` — 200, консоль чистая.
- Ручные сценарии на устройстве остаются непроверенными — это ограничение
  среды, а не результат тестов.
