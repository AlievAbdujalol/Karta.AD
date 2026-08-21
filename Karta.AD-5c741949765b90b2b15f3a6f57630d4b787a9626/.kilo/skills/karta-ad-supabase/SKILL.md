---
name: karta-ad-supabase
description: >-
  This skill should be used when working with Karta-AD's Supabase database schema,
  authentication, RLS policies, and RPC functions.
metadata:
  category: backend
  version: "1.0.0"
---

# Karta-AD Supabase

Supabase database schema and integration patterns for Karta-AD.

## Database Tables

### profiles
User profiles with role-based access (passenger/driver/admin)
- `id` UUID - references auth.users
- `role` - user_role enum
- `balance` - for payments

### vehicles
Real-time vehicle positions
- `id` UUID - primary key
- `driver_id` UUID - references profiles
- `route_id` UUID - references routes
- `lat`, `lng` DOUBLE PRECISION - current position
- `speed`, `heading` - movement data

### routes
Transport route definitions
- `id` UUID - primary key
- `number` - route identifier
- `stops` JSONB - array of stop coordinates
- `type` - bus/minibus

### cities
Geographic organization
- `id` UUID - primary key
- `boundary` JSONB - polygon coordinates

### payments
Passenger transactions
- `passenger_id`, `driver_id` UUID
- `amount` NUMERIC - fare
- `status` - pending/confirmed/rejected

### reviews
User feedback
- `user_id`, `driver_id` UUID
- `rating` INTEGER (1-5)
- `comment` TEXT

## RPC Functions

### create_payment(driver_id UUID, amount NUMERIC)
Creates payment and deducts from passenger balance.

### update_vehicle_position(vehicle_id, lat, lng, speed, heading)
Updates vehicle position with automatic timestamp.

## RLS Policies

All tables have RLS enabled. Policies follow ownership model:
- Passengers: own profile, own payments, read vehicles/routes
- Drivers: own vehicles, receive payments
- Admins: full access to all tables

## Realtime

Subscribe to vehicle updates:
```javascript
const channel = supabase
  .channel('vehicles-live')
  .on('postgres_changes', { 
    event: 'UPDATE', 
    schema: 'public', 
    table: 'vehicles' 
  }, handleVehicleUpdate)
  .subscribe();
```