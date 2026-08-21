# Karta-AD Database Schema Reference

Complete schema documentation for all Supabase tables.

## profiles

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | References auth.users |
| email | TEXT | User email |
| full_name | TEXT | Display name |
| photo_url | TEXT | Avatar URL |
| phone | TEXT | Phone number |
| role | user_role | passenger/driver/admin |
| language | TEXT | UI language |
| vehicle_number | TEXT | Driver's vehicle number |

## vehicles

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Vehicle ID |
| driver_id | UUID (FK) | References profiles |
| route_id | UUID (FK) | References routes |
| lat | DOUBLE PRECISION | Current latitude |
| lng | DOUBLE PRECISION | Current longitude |
| speed | DOUBLE PRECISION | Current speed (km/h) |
| is_active | BOOLEAN | Vehicle active status |

## routes

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Route ID |
| number | TEXT | Route number (e.g., "1A") |
| name | TEXT | Route name |
| type | route_type | bus/minibus |
| stops | JSONB | Array of stop coordinates |
| color | TEXT | Display color |
| fare_bus | NUMERIC | Bus fare (TJS) |
| fare_minibus | NUMERIC | Minibus fare (TJS) |

## cities

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | City ID |
| name | TEXT | City name |
| lat | DOUBLE PRECISION | Center latitude |
| lng | DOUBLE PRECISION | Center longitude |
| boundary | JSONB | Polygon coordinates |

## payments

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Payment ID |
| passenger_id | UUID (FK) | References profiles |
| driver_id | UUID (FK) | References profiles |
| amount | NUMERIC | Payment amount (TJS) |
| status | TEXT | pending/confirmed/rejected |

## reviews

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Review ID |
| user_id | UUID (FK) | References profiles |
| driver_id | UUID (FK) | References profiles |
| rating | INTEGER (1-5) | Star rating |
| comment | TEXT | Review text |

## schedules

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Schedule ID |
| route_id | UUID (FK) | References routes |
| day_of_week | INTEGER (0-6) | Sunday=0 |
| departure_time | TIME | Departure time |

## trip_logs

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Trip ID |
| driver_id | UUID (FK) | References profiles |
| start_time | TIMESTAMPTZ | Trip start |
| end_time | TIMESTAMPTZ | Trip end |
| distance_km | DOUBLE PRECISION | Distance traveled |

## favorite_routes

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Favorite ID |
| user_id | UUID (FK) | References profiles |
| route_id | UUID (FK) | References routes |

## notifications

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Notification ID |
| user_id | UUID (FK) | References profiles |
| title | TEXT | Notification title |
| type | TEXT | payment/system/alert |
| is_read | BOOLEAN | Read status |

## transactions

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Transaction ID |
| user_id | UUID (FK) | References profiles |
| type | TEXT | payment/topup/refund |
| amount | NUMERIC | Amount (TJS) |
| status | TEXT | pending/completed/failed |