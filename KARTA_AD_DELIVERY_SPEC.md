# KARTA-AD DELIVERY PLATFORM
## Technical Specification v1.0

> Универсальная Delivery Platform внутри Karta-AD для Magazin-AD и любых будущих магазинов.

---

# 1. ЦЕЛЬ

Создать единую систему доставки, в которой:

- магазин создаёт заказ;
- магазин передаёт заказ в Karta-AD Delivery API;
- Karta-AD создаёт delivery;
- система автоматически ищет курьера;
- курьер принимает доставку;
- курьер получает маршрут;
- приложение курьера отправляет GPS;
- покупатель видит курьера на карте в реальном времени;
- магазин видит статус доставки;
- покупатель получает уведомления;
- после доставки заказ автоматически закрывается.

Karta-AD Delivery должен быть независимым сервисом, к которому можно подключать:

- Magazin-AD;
- другие интернет-магазины;
- локальные магазины;
- рестораны;
- аптеки;
- маркетплейсы;
- сторонние сервисы.

---

# 2. АРХИТЕКТУРА

```text
                    KARTA-AD
                       |
              DELIVERY PLATFORM
                       |
       +---------------+---------------+
       |               |               |
       v               v               v
   CUSTOMER         COURIER          ADMIN
       |               |               |
       +---------------+---------------+
                       |
                       v
                  SUPABASE
                       |
        +--------------+--------------+
        |              |              |
        v              v              v
    PostgreSQL      Realtime       Edge Functions
        |              |              |
        +--------------+--------------+
                       |
                       v
                DELIVERY API
                       |
        +--------------+--------------+
        |                             |
        v                             v
   MAGAZIN-AD                    OTHER SHOPS
```

---

# 3. ПРИНЦИП РАБОТЫ

Magazin-AD создаёт заказ и отправляет:

```http
POST /v1/deliveries
```

Karta-AD:

1. проверяет API credentials;
2. проверяет данные;
3. создаёт delivery;
4. создаёт tracking session;
5. ищет курьера;
6. возвращает `delivery_id`;
7. отправляет webhook магазину.

---

# 4. DELIVERY API

Base URL:

```text
https://api.karta-ad.com/v1
```

Все запросы выполняются через HTTPS.

```http
Content-Type: application/json
Authorization: Bearer <API_KEY>
```

---

# 5. СОЗДАНИЕ ДОСТАВКИ

```http
POST /v1/deliveries
```

Request:

```json
{
  "external_order_id": "MAG-10452",

  "pickup": {
    "name": "Magazin-AD",
    "address": "Хистеварз",
    "latitude": 40.280000,
    "longitude": 69.630000
  },

  "dropoff": {
    "name": "Customer",
    "address": "Хистеварз, улица ...",
    "latitude": 40.285000,
    "longitude": 69.640000
  },

  "customer": {
    "name": "Customer",
    "phone": "+992..."
  },

  "items": [
    {
      "name": "Product",
      "quantity": 1
    }
  ],

  "payment": {
    "method": "cash",
    "amount": 150
  }
}
```

Response:

```json
{
  "success": true,
  "delivery": {
    "id": "del_01...",
    "external_order_id": "MAG-10452",
    "status": "searching_courier",
    "tracking": {
      "enabled": true
    }
  }
}
```

---

# 6. DELIVERY ID

Каждая доставка должна иметь уникальный внутренний ID:

```text
del_xxxxxxxxx
```

Не использовать только `external_order_id`.

Использовать:

```text
merchant_id + external_order_id
```

для уникальности заказа магазина и отдельный внутренний:

```text
delivery_id
```

---

# 7. СТАТУСЫ ДОСТАВКИ

Использовать:

```text
pending
confirmed
searching_courier
courier_assigned
courier_to_pickup
arrived_pickup
picked_up
courier_to_customer
arrived_customer
delivered

cancelled
failed
```

State machine:

```text
pending
   |
   v
confirmed
   |
   v
searching_courier
   |
   v
courier_assigned
   |
   v
courier_to_pickup
   |
   v
arrived_pickup
   |
   v
picked_up
   |
   v
courier_to_customer
   |
   v
arrived_customer
   |
   v
delivered
```

---

# 8. КУРЬЕР

Курьер должен иметь:

```text
courier_id
user_id
status
online
vehicle_type
vehicle_number
rating
last_location
created_at
```

Статусы:

```text
offline
online
busy
paused
blocked
```

---

# 9. ПРИЁМ ДОСТАВКИ

Курьер получает:

```text
Новая доставка

Заказ #MAG-10452

Товар: ...
Забрать: Magazin-AD
Доставить: ...
Оплата: ...

[ПРИНЯТЬ]
[ОТКАЗАТЬ]
```

При принятии:

```http
POST /v1/deliveries/{delivery_id}/accept
```

Backend должен:

1. проверить courier_id;
2. проверить статус delivery;
3. исключить повторное назначение;
4. назначить courier;
5. изменить статус;
6. создать delivery event;
7. отправить webhook;
8. отправить notification.

---

# 10. REAL-TIME GPS

Во время активной доставки:

```text
Courier App
     |
     | GPS
     v
Karta-AD Backend
     |
     v
Supabase Realtime
     |
     +----------+
     |          |
     v          v
 Customer     Merchant
```

GPS обновлять ориентировочно каждые 5–10 секунд или при существенном перемещении.

---

# 11. GPS DATA

Пример:

```json
{
  "delivery_id": "del_123",
  "courier_id": "courier_123",

  "latitude": 40.285123,
  "longitude": 69.640123,

  "accuracy": 8,
  "speed": 32,
  "heading": 120,

  "timestamp": "2026-09-23T10:30:00Z"
}
```

---

# 12. REAL-TIME DELIVERY MAP

Покупатель должен видеть:

- магазин;
- покупателя;
- курьера;
- маршрут;
- расстояние;
- ETA;
- статус доставки.

Пример:

```text
             🏪
              |
              |
            🚚
              |
              |
              📍
          Покупатель
```

---

# 13. ПЛАВНОЕ ДВИЖЕНИЕ КУРЬЕРА

Frontend должен интерполировать движение маркера.

Не делать:

```text
🚚
       🚚
              🚚
```

Делать плавное:

```text
🚚 → → → → →
```

---

# 14. ДОСТУП К REAL-TIME КАРТЕ

Покупатель видит только свою доставку.

Магазин видит только доставки своего `merchant_id`.

Курьер видит только назначенные ему доставки.

Администратор видит данные согласно своей роли.

---

# 15. TRACKING TOKEN

Не использовать только:

```text
?delivery_id=123
```

Использовать временный `tracking_token`.

Например:

```http
GET /v1/deliveries/{id}/tracking
```

Backend проверяет:

```text
user
+
delivery
+
permission
```

---

# 16. MAGAZIN-AD INTEGRATION

Magazin-AD подключается через Merchant API.

Merchant получает:

```text
merchant_id
client_id
client_secret
api_key
webhook_secret
```

Секреты нельзя хранить в:

```text
frontend
localStorage
public JavaScript
GitHub
```

Хранить только server-side:

```text
Supabase Secrets
Vercel Environment Variables
Backend Secret Storage
```

---

# 17. UNIVERSAL MERCHANT SYSTEM

Таблица:

```text
merchants
```

Поля:

```text
merchant_id
name
status
api_key_hash
webhook_url
webhook_secret
created_at
```

Например:

```text
Magazin-AD → merchant_001
Shop-X     → merchant_002
```

Оба используют один Delivery API.

---

# 18. WEBHOOKS

Karta-AD отправляет магазину события:

```text
delivery.created
courier.assigned
courier.arrived_pickup
delivery.picked_up
courier.arrived_customer
delivery.delivered
delivery.cancelled
delivery.failed
```

Пример:

```http
POST https://magazin-ad.com/api/karta-webhook
```

```json
{
  "event": "delivery.picked_up",
  "delivery_id": "del_123",
  "external_order_id": "MAG-10452",
  "status": "picked_up",
  "timestamp": "..."
}
```

---

# 19. WEBHOOK SECURITY

Каждый webhook подписывать HMAC:

```text
X-Karta-Signature
```

Использовать:

```text
HMAC-SHA256(payload, webhook_secret)
```

Merchant должен проверять подпись.

Добавить защиту от replay attack:

```text
timestamp
nonce
event_id
```

---

# 20. IDEMPOTENCY

Повторный запрос не должен создавать две доставки.

Использовать:

```http
Idempotency-Key: MAG-10452-DELIVERY
```

Если запрос пришёл повторно, вернуть существующую delivery.

---

# 21. SUPABASE DATABASE

Основные таблицы:

```text
profiles
merchants
merchant_api_keys
customers
couriers
courier_locations
orders
order_items
deliveries
delivery_events
delivery_tracking_tokens
webhook_endpoints
webhook_logs
notifications
audit_logs
```

---

# 22. ORDERS

```sql
orders
```

Поля:

```text
id
merchant_id
external_order_id
customer_id
status
total_amount
currency
created_at
updated_at
```

---

# 23. DELIVERIES

```sql
deliveries
```

Поля:

```text
id
merchant_id
order_id
external_order_id
courier_id

status

pickup_address
pickup_lat
pickup_lng

dropoff_address
dropoff_lat
dropoff_lng

distance_meters
estimated_duration_seconds

created_at
accepted_at
picked_up_at
delivered_at
cancelled_at
updated_at
```

---

# 24. COURIER LOCATIONS

```sql
courier_locations
```

Поля:

```text
id
courier_id
delivery_id

latitude
longitude

accuracy
speed
heading

created_at
```

Для быстрой работы последнюю позицию также можно хранить в `couriers`.

---

# 25. POSTGIS

Использовать PostGIS для географических запросов:

```text
ST_DWithin
ST_Distance
```

Например:

```text
найти online-курьеров в радиусе 5 км.
```

---

# 26. AUTOMATIC COURIER DISPATCHER

После создания delivery:

```text
delivery
   |
   v
searching_courier
   |
   v
найти online couriers
   |
   v
фильтр по зоне
   |
   v
расстояние
   |
   v
текущая нагрузка
   |
   v
назначение
```

Факторы:

```text
distance
current_load
availability
vehicle_type
delivery_zone
```

---

# 27. AI DISPATCHER

AI не должен иметь неконтролируемый полный доступ к базе.

AI получает необходимые данные:

```json
{
  "delivery": {},
  "available_couriers": []
}
```

AI может:

- предложить подходящего курьера;
- прогнозировать ETA;
- анализировать задержки;
- обнаруживать аномалии;
- помогать оператору;
- отвечать на вопросы.

Критические изменения выполняет backend.

---

# 28. AI CUSTOMER SUPPORT

Покупатель:

```text
Где мой заказ?
```

Backend передаёт AI:

```json
{
  "status": "courier_to_customer",
  "eta_minutes": 7,
  "distance_meters": 2100
}
```

AI отвечает только на основании актуальных данных.

AI запрещено придумывать:

- местоположение;
- ETA;
- статус;
- данные курьера;
- данные заказа.

---

# 29. ROUTING

Создать abstraction:

```text
RoutingService
```

Поддержать:

```text
OSRM
Yandex
Google
другой routing provider
```

Frontend не должен зависеть от конкретного routing API.

---

# 30. MAP SERVICE

Создать:

```text
MapService
```

Чтобы можно было использовать:

```text
Yandex MapKit
Google Maps
OpenStreetMap
```

без переписывания Delivery System.

---

# 31. CUSTOMER INTERFACE

Экран:

```text
Моя доставка
```

Показывает:

```text
Заказ #10452

Статус:
🚚 Курьер едет к вам

ETA:
7 минут

Расстояние:
2.1 км
```

Карта:

```text
🏪 ───── 🚚 ───── 📍
```

Кнопки:

```text
[Позвонить]
[Написать курьеру]
```

---

# 32. COURIER INTERFACE

Экран:

```text
Моя доставка
```

Показывает:

```text
📦 Заказ #10452

ЗАБРАТЬ:
Magazin-AD

ДОСТАВИТЬ:
Адрес покупателя

Расстояние:
3.2 км

ETA:
10 мин
```

Кнопки:

```text
[Принять]
[Начать маршрут]
[Забрал заказ]
[Прибыл]
[Доставлено]
```

---

# 33. ПОДТВЕРЖДЕНИЕ ДОСТАВКИ

Использовать delivery proof:

```text
PIN-код
QR-код
подтверждение клиента
фото
```

Рекомендуемый основной вариант:

```text
4–6 digit delivery PIN
```

После правильного PIN:

```text
status = delivered
```

---

# 34. SECURITY

Безопасность обязательна.

Использовать:

```text
HTTPS
JWT
Supabase Auth
RLS
RBAC
API key rotation
HMAC webhooks
rate limiting
audit logs
input validation
idempotency
secret management
```

---

# 35. ROLES

```text
customer
courier
merchant
merchant_admin
support
admin
super_admin
```

Каждая роль получает минимально необходимый доступ.

---

# 36. RLS

RLS должен быть включён на всех чувствительных таблицах.

Правила:

```text
Customer
→ только свои orders/deliveries

Courier
→ только назначенные deliveries

Merchant
→ только deliveries своего merchant_id

Admin
→ согласно административной роли
```

Никогда не отключать RLS ради удобства разработки.

---

# 37. API SECURITY

Использовать:

```text
authentication
authorization
rate limiting
schema validation
request size limits
logging
```

Не доверять `merchant_id`, `courier_id` и `customer_id`, которые пришли с frontend, без серверной проверки.

---

# 38. API KEY

API key должен быть:

- длинным;
- случайным;
- уникальным;
- отзывным;
- ротируемым.

В базе хранить hash, если архитектура позволяет.

---

# 39. RATE LIMITING

Ограничить:

```text
POST /deliveries
GPS endpoint
webhook endpoint
authentication endpoints
```

Защита от:

```text
brute force
spam
GPS flooding
API abuse
```

---

# 40. GPS SECURITY

GPS — чувствительные данные.

Правила:

```text
Customer → только координаты своего courier
Merchant → только координаты courier своих deliveries
Courier → собственная координата и разрешённые данные доставки
Admin → согласно permission
```

Не показывать публично полную историю перемещения курьера.

---

# 41. LOCATION RETENTION

Не хранить GPS историю бесконечно.

Разделить:

```text
active tracking
historical GPS
aggregated analytics
```

Настроить автоматическое удаление старых данных согласно политике хранения и применимым требованиям законодательства.

---

# 42. AUDIT LOG

Создать:

```text
audit_logs
```

События:

```text
delivery_created
courier_assigned
courier_accepted
status_changed
location_accessed
delivery_cancelled
delivery_completed
api_key_created
api_key_revoked
admin_action
```

---

# 43. ERROR HANDLING

Стандартизировать ошибки:

```json
{
  "success": false,
  "error": {
    "code": "DELIVERY_NOT_FOUND",
    "message": "Delivery not found",
    "request_id": "req_123"
  }
}
```

Использовать `request_id` для debugging.

---

# 44. OBSERVABILITY

Добавить:

```text
application logs
API logs
webhook logs
delivery events
audit logs
error monitoring
```

Никогда не логировать:

```text
API secrets
passwords
JWT
полные платёжные данные
```

---

# 45. NOTIFICATIONS

Поддержать:

```text
Push
SMS
Email
Telegram
```

События:

```text
order_confirmed
courier_assigned
courier_arriving
picked_up
courier_near_customer
delivered
cancelled
```

---

# 46. MERCHANT DASHBOARD

Magazin-AD должен иметь:

```text
Заказы
Доставки
Карта
Курьеры
Статистика
API
Webhooks
Настройки
```

На карте:

```text
🟢 online courier
🟡 busy courier
🔴 offline
```

Магазин видит только разрешённые ему данные.

---

# 47. DELIVERY TRACKING PAGE

Можно создать:

```text
https://karta-ad.com/track/{tracking_token}
```

Страница показывает:

```text
статус
карта
курьер
ETA
маршрут
```

Не показывать без необходимости:

```text
телефон курьера
лишние персональные данные
полную историю перемещения
```

---

# 48. AUTOMATIC CONNECTION

Магазин должен подключаться максимально просто.

Например:

```text
Magazin-AD
      |
      v
Connect Karta-AD
      |
      v
Authorization
      |
      v
Delivery enabled
```

После подключения магазин получает:

```text
Merchant ID
API credentials
Webhook configuration
```

---

# 49. DEEP LINK

Поддержать:

```text
kartaad://delivery/{delivery_id}
```

и:

```text
https://karta-ad.com/delivery/{delivery_id}
```

Deep link не должен самостоятельно давать права доступа.

Авторизация обязательна.

---

# 50. QR CONNECTION

Для магазина:

```text
Connect Karta-AD Delivery
```

Показывается QR.

Merchant сканирует QR.

После авторизации:

```text
магазин подключён
```

Не помещать постоянный API key непосредственно в QR.

Использовать:

```text
one-time connection token
```

---

# 51. ONE-TIME CONNECTION TOKEN

Свойства:

```text
одноразовый
короткоживущий
привязанный к merchant
```

После использования:

```text
token invalid
```

---

# 52. FRONTEND SECURITY

Frontend не должен выполнять:

```text
service_role
admin SQL
секретные API
```

Архитектура:

```text
Frontend
   |
   v
Secure API
   |
   v
Supabase
```

---

# 53. SUPABASE SERVICE ROLE

`SUPABASE_SERVICE_ROLE_KEY` никогда не помещать в:

```text
frontend
mobile app
public repository
client bundle
```

Использовать только server-side.

---

# 54. ENVIRONMENT VARIABLES

Пример:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=

SUPABASE_SERVICE_ROLE_KEY=

DELIVERY_API_SECRET=
WEBHOOK_SECRET=

ROUTING_API_KEY=
MAP_API_KEY=
AI_API_KEY=
```

Секретные и публичные переменные должны быть разделены.

---

# 55. PROJECT STRUCTURE

Рекомендуемая структура:

```text
karta-ad/
│
├── apps/
│   ├── customer/
│   ├── courier/
│   └── merchant/
│
├── packages/
│   ├── delivery-api/
│   ├── maps/
│   ├── routing/
│   ├── tracking/
│   ├── notifications/
│   └── auth/
│
├── supabase/
│   ├── migrations/
│   ├── functions/
│   │   ├── create-delivery/
│   │   ├── assign-courier/
│   │   ├── update-location/
│   │   ├── delivery-status/
│   │   └── webhooks/
│   └── seed/
│
├── docs/
│
└── KARTA_AD_DELIVERY_SPEC.md
```

---

# 56. EDGE FUNCTIONS

Создать:

```text
create-delivery
accept-delivery
assign-courier
update-courier-location
update-delivery-status
get-delivery
get-tracking
send-webhook
process-webhook
```

---

# 57. REALTIME CHANNELS

Не использовать один глобальный канал.

Использовать приватные каналы:

```text
delivery:{delivery_id}
```

Доступ проверять через authorization.

---

# 58. REALTIME EVENT

Пример:

```json
{
  "event": "courier_location_updated",

  "delivery_id": "del_123",

  "location": {
    "lat": 40.285,
    "lng": 69.640
  },

  "eta_seconds": 420
}
```

---

# 59. ETA

ETA должен рассчитываться через RoutingService.

AI не должен самостоятельно придумывать ETA.

AI может анализировать:

```text
traffic
historical data
current GPS
route
```

но фактическое ETA предоставляет backend/routing provider.

---

# 60. OFFLINE MODE

Если у курьера временно нет интернета:

```text
GPS сохраняется локально
```

После восстановления:

```text
очередь GPS → сервер
```

Соблюдать допустимый срок хранения.

---

# 61. ANTI-SPOOFING

Backend должен обнаруживать:

```text
невозможную скорость
резкий teleport
слишком частые координаты
аномальную точность
```

Пример:

```text
40 км/ч
→ через 5 секунд
→ координата на 30 км дальше
```

Пометить как:

```text
GPS anomaly
```

---

# 62. FRAUD PROTECTION

Проверять:

```text
delivery duplication
fake GPS
fake courier status
replay attacks
webhook replay
API abuse
```

Использовать:

```text
timestamps
nonce
idempotency
signature
rate limits
```

---

# 63. TESTING

Обязательно:

```text
unit tests
integration tests
API tests
RLS tests
security tests
GPS tests
realtime tests
webhook tests
```

---

# 64. SECURITY TESTS

Проверить:

```text
Customer A не видит Delivery B.

Merchant A не видит Merchant B.

Courier A не видит Courier B.

Обычный user не может стать admin.

API key нельзя использовать после revoke.

Webhook нельзя повторно воспроизвести.

Tracking token нельзя использовать после expiration.

Service role отсутствует frontend bundle.
```

---

# 65. MVP

Первая версия:

```text
[1] Supabase
[2] Authentication
[3] Merchant
[4] Order
[5] Delivery
[6] Courier
[7] Courier GPS
[8] Realtime
[9] Map
[10] Courier assignment
[11] Customer tracking
[12] Merchant tracking
[13] Webhooks
[14] RLS
[15] API security
```

---

# 66. PHASE 2

```text
AI Dispatcher
AI Support
ETA prediction
Telegram notifications
SMS
QR connection
Merchant SDK
automatic zones
delivery pricing
analytics
```

---

# 67. PHASE 3

```text
multi-city delivery
courier fleet management
warehouse integration
restaurant delivery
marketplace integration
subscription plans
automatic billing
advanced dispatch
route optimization
```

---

# 68. ВАЖНОЕ ПРАВИЛО АРХИТЕКТУРЫ

Karta-AD Delivery должен быть независим от Magazin-AD.

НЕЛЬЗЯ:

```text
Delivery → напрямую зависит от Magazin-AD database
```

Нужно:

```text
Magazin-AD
      |
      | REST API
      v
Karta-AD Delivery
      |
      v
Supabase
```

Так можно подключить:

```text
Magazin-AD
Shop-A
Shop-B
Restaurant-A
Marketplace-A
```

без переписывания Delivery Platform.

---

# 69. DEFINITION OF DONE

Функция считается готовой, если:

- [ ] магазин может подключиться;
- [ ] магазин может создать delivery;
- [ ] delivery получает уникальный ID;
- [ ] автоматически ищется курьер;
- [ ] курьер может принять delivery;
- [ ] курьер видит маршрут;
- [ ] курьер отправляет GPS;
- [ ] GPS появляется у покупателя;
- [ ] GPS появляется у магазина;
- [ ] карта обновляется realtime;
- [ ] ETA обновляется;
- [ ] статусы синхронизируются;
- [ ] webhook работает;
- [ ] RLS проверен;
- [ ] API защищён;
- [ ] API keys защищены;
- [ ] tracking token защищён;
- [ ] повторный запрос не создаёт duplicate delivery;
- [ ] audit logs работают;
- [ ] security tests пройдены;
- [ ] service role отсутствует на frontend.

---

# 70. ИНСТРУКЦИЯ ДЛЯ AI CODING AGENT

AI coding agent должен:

1. Сначала изучить существующий Karta-AD.
2. Не удалять существующие функции.
3. Не менять существующую архитектуру без необходимости.
4. Определить текущий frontend/backend stack.
5. Определить текущую Supabase configuration.
6. Создать Delivery module.
7. Создать database migrations.
8. Включить RLS.
9. Создать API.
10. Создать Edge Functions.
11. Создать realtime tracking.
12. Создать courier interface.
13. Создать customer tracking interface.
14. Создать merchant integration.
15. Создать webhook system.
16. Добавить tests.
17. Проверить security.
18. Только после успешных тестов интегрировать Magazin-AD.

НЕ использовать mock backend в production.

НЕ хранить secrets во frontend.

НЕ отключать RLS.

НЕ использовать service role key в client-side коде.

НЕ давать AI прямой неконтролируемый доступ к базе.

---

# 71. ПРИОРИТЕТ

```text
P0 — Security
P0 — Database
P0 — Authentication
P0 — Delivery API

P1 — Courier
P1 — GPS
P1 — Realtime Map

P1 — Customer Tracking
P1 — Merchant Tracking

P2 — Webhooks
P2 — Notifications

P2 — Automatic Dispatcher

P3 — AI Dispatcher
P3 — AI Support
P3 — ETA Prediction
```

---

# 72. ФИНАЛЬНЫЙ WORKFLOW

```text
                    MAGAZIN-AD
                         |
                    Create Order
                         |
                         v
                  KARTA-AD API
                         |
                         v
                  CREATE DELIVERY
                         |
                         v
                SEARCH COURIER
                         |
                         v
                  COURIER ACCEPT
                         |
                         v
                  START DELIVERY
                         |
                         v
                       GPS
                         |
             +-----------+-----------+
             |                       |
             v                       v
          CUSTOMER               MERCHANT
             |                       |
             +-----------+-----------+
                         |
                         v
                   REALTIME MAP
                         |
                         v
                    DELIVERED
                         |
                         v
                   CLOSE DELIVERY
```

---

# 73. ГЛАВНАЯ ЦЕЛЬ

Karta-AD должен выступать как независимая Delivery Platform.

Magazin-AD — первый merchant-клиент.

Другие магазины подключаются через тот же Delivery API.

Финальная цепочка:

```text
Store
  ↓
Delivery API
  ↓
Karta-AD
  ↓
Dispatcher
  ↓
Courier
  ↓
GPS
  ↓
Realtime
  ↓
Customer + Merchant Map
```

Все критические операции выполняются сервером.

AI используется как интеллектуальный слой, но не получает неконтролируемое право изменять заказы, GPS, платежи или права доступа.
