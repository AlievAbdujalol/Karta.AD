# Karta-AD Supabase Integration

## Overview

Karta-AD uses Supabase as the primary backend for all data operations, authentication, and real-time features.

### Architecture
- **Frontend**: React + Vite
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Storage)
- **Mapping**: OpenStreetMap + Leaflet + OSRM
- **Deployment**: Vercel + GitHub CI/CD

## Environment Variables

### Required Variables

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `VITE_SUPABASE_URL` | Supabase project URL | Supabase Dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Public anonymous key | Supabase Dashboard → Settings → API → API Keys → `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only) | Supabase Dashboard → Settings → API → API Keys → `service_role` key |

### Setup Instructions

1. Open `.env.local` (create from `.env.example`)
2. Copy values from Supabase Dashboard → Settings → API
3. Never commit `.env.local` to version control

```bash
# .env.local
VITE_SUPABASE_URL=https://eotkmnwneivithfkweds.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Database Schema

### Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | User profiles | `id`, `email`, `role`, `balance`, `driver_status` |
| `vehicles` | Vehicle positions | `id`, `driver_id`, `route_id`, `lat`, `lng`, `is_active` |
| `routes` | Transport routes | `id`, `number`, `type`, `stops` (JSONB), `city_id` |
| `cities` | Geographic data | `id`, `name`, `country`, `lat`, `lng` |
| `reviews` | User feedback | `id`, `route_id`, `driver_id`, `rating`, `comment` |
| `schedules` | Route schedules | `id`, `route_id`, `day_of_week`, `departure_time` |
| `trip_logs` | Trip history | `id`, `user_id`, `route_id`, `start_time`, `end_time` |
| `favorite_routes` | User favorites | `id`, `user_id`, `route_id` |
| `notifications` | User alerts | `id`, `user_id`, `title`, `type`, `is_read` |
| `transactions` | Payments | `id`, `sender_id`, `recipient_id`, `amount`, `status` |
| `subscription_payments` | Subscription billing | `id`, `user_id`, `amount`, `role`, `status` |

### Entity Definitions

See `src/types/database.ts` for TypeScript interfaces matching the live schema.

## Taxi Module (Такси)

### Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `taxi_drivers` | Taxi driver profiles | `user_id` (unique), `status`, `is_verified`, `rating`, `total_earnings` |
| `taxi_vehicles` | Driver vehicles | `driver_id` (unique), `make`, `model`, `plate_number`, `category` (11 тарифов) |
| `taxi_driver_documents` | Driver docs (license/techpassport/insurance) | `driver_id` (unique), `status` (`pending`/`approved`/`rejected`), `reject_reason`, `is_verified` |
| `taxi_driver_locations` | Live GPS positions | `driver_id` (unique), `lat`, `lng`, `heading`, `speed`, `status` |
| `taxi_orders` | Ride orders | `passenger_id`, `driver_id`, `status`, `price`, `demand_coef`, `payment_method` |
| `taxi_ride_events` | Order lifecycle audit | `order_id`, `status` |
| `taxi_ride_payments` | Payments | `order_id`, `amount`, `commission` (20%), `driver_earnings`, `method` |
| `taxi_wallet_transactions` | Driver wallet ledger | `driver_id`, `amount`, `type` (`earnings`/`withdrawal`/…) |
| `taxi_ratings` | Driver/passenger ratings + tips | `order_id`, `from_id`, `to_id`, `rating`, `comment`, `tip` |
| `taxi_favorite_drivers` | Passenger favorite drivers | `passenger_id`, `driver_id` |
| `taxi_messages` | In-ride chat | `order_id`, `sender_id`, `message` |
| `taxi_emergencies` | SOS signals | `order_id`, `user_id`, `role`, `lat`, `lng`, `status` (`active`/`resolved`) |

### Order lifecycle

`searching` → `found` (атомарный claim по RLS-политике `taxi_orders_claim`: только `status=searching AND driver_id IS NULL` → `found`, `WITH CHECK auth.uid()=driver_id`) → `arrived` → `riding` → `completed` → оплата (`taxi_ride_payments` + кошелёк) → оценка. Или `cancelled` (`cancelled_by` = passenger/driver).

### RLS

- `taxi_orders`: passenger видит/создаёт свои; **realtime-подписка водителя на входящие заказы возможна только через политику `taxi_orders_select_searching`** (`status='searching' AND driver_id IS NULL`) — Realtime применяет RLS при чтении
- `taxi_messages`/`taxi_emergencies`: участники поездки (passenger/driver из `taxi_orders`) + admin (`is_admin()`)
- `taxi_drivers`, `taxi_driver_documents`, `taxi_ride_payments`, `taxi_ride_events`, `taxi_wallet_transactions`: владелец + admin UPDATE/политики модерации
- Admin-доступ: `public.is_admin()` (SECURITY DEFINER, `search_path` зафиксирован)

### RPC functions

| Function | Purpose |
|----------|---------|
| `calculate_taxi_price(dist, dur, category, night)` | Цена по тарифу (зеркало `src/lib/taxi.js`) |
| `taxi_demand_coefficient(lat, lng, radius)` | Коэффициент спроса 1.0–2.5 |
| `taxi_nearby_summary(lat, lng, radius)` | Машины по тарифам рядом (кол-во + ближайшая) |
| `find_nearby_taxi_drivers(...)` | **service_role only** (закрыт от anon/authenticated) |
| `get_admin_driver_requests()` | Заявки на верификацию (только admin, проверка внутри) |

### Realtime

`taxi_orders`, `taxi_driver_locations`, `taxi_messages`, `taxi_emergencies` — в `supabase_realtime`. RLS применяется к realtime-подпискам (Postgres Changes).

### UI-источник тарифов

`src/lib/taxi.js` — единый источник: `TARIFFS` (11), `PASSENGER_TARIFFS` (8), `TAXI_COMMISSION` (0.2), `calcPrice`, `haversineKm`, `estimateRide`. Цены дублируются в RPC `calculate_taxi_price` — при изменении менять оба.

## Row Level Security (RLS)

All tables have RLS enabled. Policies:

| Table | Read | Insert | Update | Delete |
|-------|------|--------|--------|--------|
| `profiles` | Own + admin | Auth trigger | Own (no admin self-promotion) | - |
| `vehicles` | Public | Own driver_id | Own driver_id | Admin only |
| `routes` | Public | Admin only | Admin only | Admin only |
| `cities` | Public | Admin only | Admin only | Admin only |
| `reviews` | Public | Auth required | Own created_by_id | Own + admin |
| `favorite_routes` | Own + admin | Own user_id | - | Own user_id |
| `notifications` | Own user_id | Driver/admin | Own user_id | - |
| `transactions` | Sender/recipient | Own sender_id | - | - |
| `trip_logs` | Own + admin | Own user_id | Own user_id | Own + admin |

## Real-time Subscriptions

### Vehicle Positions
```javascript
const channel = supabase
  .channel('vehicles-changes')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'vehicles',
    filter: 'is_active=eq.true'
  }, handleUpdate)
  .subscribe();
```

### Notifications
```javascript
const channel = supabase
  .channel(`user-notifications:${userId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${userId}`
  }, handleNotification)
  .subscribe();
```

## RPC Functions

| Function | Purpose |
|----------|---------|
| `create_payment(driver_id, amount)` | Create payment and deduct from passenger balance |
| `confirm_payment(transaction_id)` | Confirm a pending payment |
| `reject_payment(transaction_id)` | Reject a pending payment |
| `mock_top_up(amount)` | Simulate balance top-up (demo) |
| `activate_subscription(role)` | Activate user subscription |
| `renew_subscription()` | Renew existing subscription |
| `handle_new_user()` | Auto-create profile on signup |
| `protect_balance_update()` | Prevent negative balance |
| `is_admin()` | Admin check (used by taxi RLS/RPC) |

## Client Configuration

### Supabase Client (`src/api/supabase.js`)
```javascript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
```

### Entity Layer (`src/api/entities.js`)
Compatible Base44-style API: `.list()`, `.get()`, `.filter()`, `.create()`, `.update()`, `.delete()`

## Migrations

All migrations are in `supabase/migrations/`:

1. `20260624_vehicles_table.sql`
2. `20260624_routes_table.sql`
3. `20260624_cities_table.sql`
4. `20260624_reviews_table.sql`
5. `20260624_schedules_table.sql`
6. `20260624_trip_logs_table.sql`
7. `20260624_favorite_routes_table.sql`
8. `20260624_notifications_table.sql`
9. `20260624_transactions_table.sql`
10. `20260624_realtime_vehicles.sql`

### Applying Migrations

```bash
# Via Supabase Dashboard
# Copy contents of migration file → SQL Editor → Run

# Via Supabase CLI
supabase db push supabase/migrations/
```

## Authentication

- **Provider**: Google OAuth (via Supabase Auth)
- **Session**: Persisted in localStorage
- **Auto-login**: Enabled via `detectSessionInUrl`
- **Profile creation**: Automatic via database trigger

## File Storage

Supabase Storage is configured for:
- User avatars (`photo_url` in profiles)

## Troubleshooting

### "Could not find the 'X' column of 'profiles' in the schema cache"
The PostgREST schema cache hasn't refreshed after a DDL change. Wait 60 seconds or trigger refresh:
```sql
SELECT pg_notify('pgrst', 'reload schema');
```

### RLS Policy Errors
Check current policies:
```sql
SELECT * FROM pg_policies WHERE tablename = 'table_name';
```

### Realtime Not Working
1. Verify Realtime is enabled in Supabase Dashboard → Settings → API
2. Check publication includes the table
3. No corporate firewall blocking `wss://<project>.supabase.co/realtime/v1/websocket`
