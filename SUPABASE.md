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
