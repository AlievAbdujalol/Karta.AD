# @karta-ad/delivery

Официальный SDK доставки Karta-AD. Подключение интернет-магазина к курьерской доставке за 5 минут.

## Установка

```bash
npm install @karta-ad/delivery
# или
pnpm add @karta-ad/delivery
# или
bun add @karta-ad/delivery
```

## Быстрый старт

```ts
import { Delivery } from "@karta-ad/delivery";

const delivery = new Delivery({
  apiKey: "dk_xxxxxxxxxxxxxxxxxxxxxxxxx",
});

// 1. Рассчитать цену
const quote = await delivery.calculatePrice(
  { lat: 38.545, lng: 68.779 },
  { lat: 38.555, lng: 68.789 },
);
console.log(quote); // { distance_km: 2.3, price: 8.2, currency: 'TJS', eta_min: 17 }

// 2. Создать заказ
const order = await delivery.createOrder({
  customer: { name: "Иван", phone: "+992900000000" },
  pickup: { lat: 38.545, lng: 68.779, address: "Магазин" },
  dropoff: { lat: 38.555, lng: 68.789, address: "Клиент" },
  items: [{ name: "Пицца", qty: 2, price: 90 }],
});
console.log(order.id, order.status); // 'pending'

// 3. Следить за статусом
const unsubscribe = delivery.subscribeOrder(order.id, (status) => {
  console.log("Новый статус:", status);
});

// 4. Отменить
await delivery.cancelOrder(order.id, "Клиент передумал");
```

## API

| Метод | Описание |
|-------|----------|
| `createOrder(params)` | Создать заказ доставки |
| `getOrder(id)` | Полный заказ (позиции + трекинг) |
| `getStatus(id)` | Текущий статус |
| `cancelOrder(id, reason?)` | Отменить заказ |
| `calculatePrice(pickup, dropoff, weightKg?)` | Расчёт цены и ETA |
| `listOrders()` | Последние 50 заказов магазина |
| `subscribeOrder(id, cb)` | Realtime-подписка на статус |
| `Delivery.verifyWebhookSignature(payload, sig, secret)` | Проверка подписи вебхука |

## Статусы заказа

`pending` → `searching` → `assigned` → `picked_up` → `delivered` | `cancelled`

## Вебхуки

Настройте URL в панели Karta-AD. События:

- `order.created`
- `order.accepted`
- `order.started`
- `order.completed`
- `order.cancelled`
- `courier.location`
- `payment.completed`

Каждый запрос подписан: `X-Karta-Signature: sha256=HMAC-SHA256(secret, body)`.

```ts
const valid = await Delivery.verifyWebhookSignature(
  rawBody,
  request.headers["x-karta-signature"],
  process.env.KARTA_WEBHOOK_SECRET,
);
```

## Ошибки

Все ошибки — `DeliveryError` с полями `code` и `status`:

- `INVALID_API_KEY` (401)
- `RATE_LIMITED` (429)
- `NOT_FOUND` (404)
- `FORBIDDEN` (403)
- `BAD_STATE` (400)

## Типы

Пакет поставляется с полной TypeScript-типизацией (`dist/index.d.ts`).
