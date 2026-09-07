# Karta-AD — Платформаи Навигатсионӣ ва Транспортӣ барои Тоҷикистон

> **Karta-AD** — замимаи мобилӣ ва веб барои харита, ҷустуҷӯи масирҳо, такси, доставка, офлайн-харитаҳо ва мониторинг дар вақти воқеӣ. Сохтшуда бо React + Supabase + OpenStreetMap.

![Версия](https://img.shields.io/badge/версия-0.0.0-blue) ![React](https://img.shields.io/badge/React-18-61dafb) ![Supabase](https://img.shields.io/badge/Supabase-2.108-3ecf8e) ![Лицензия](https://img.shields.io/badge/лицензия-MIT-green)

---

## 1. Мундариҷа

- [Тавсифи лоиҳа](#тавсифи-лоиҳа)
- [Имкониятҳои асосӣ](#имкониятҳои-асосӣ)
- [Меъмории лоиҳа](#меъмории-лоиҳа)
- [Стек технологияҳо](#стек-технологияҳо)
- [Сохтори файлҳо](#сохтори-файлҳо)
- [Насб ва роҳандозӣ](#насб-ва-роҳандозӣ)
- [Танзими Supabase](#танзими-supabase)
- [Фармонҳои асосӣ](#фармонҳои-асосӣ)
- [Меъмории пойгоҳи додаҳо](#меъмории-пойгоҳи-додаҳо)
- [Ҳамгироии харита](#ҳамгироии-харита)
- [Ҷойгиркунӣ](#ҷойгиркунӣ)
- [Саҳмгузорӣ](#саҳмгузорӣ)

---

## 2. Тавсифи лоиҳа

**Karta-AD** барои шаҳрҳои Тоҷикистон (Душанбе, Хуҷанд, Бохтар, Кӯлоб ва ғ.) тарҳрезӣ шудааст ва се вазифаи калидиро муттаҳид мекунад:

1.  **Харита ва навигатсия** — Leaflet + OSRM + Overpass, масирҳо барои мошин / такси / пиёда / велосипед / самокат / боркаш / нақлиёти ҷамъиятӣ.
2.  **Такси** — 11 тариф, нархгузории динамикӣ, ҷустуҷӯи ронандагони наздик, чати дохили сафар, ҳамёни ронанда.
3.  **Доставка (Delivery Platform)** — API алоҳида барои мағозаҳо (`delivery-api` Edge Function), курьерҳо, webhook-ҳо ва SDK-и `@karta-ad/delivery`.

Ҳамаи маълумот дар **Supabase** (PostgreSQL + Auth + Realtime + Storage) нигоҳ дошта мешавад.

---

## 3. Имкониятҳои асосӣ

| Блок | Тавсиф |
|------|--------|
| **Харита** | `BusMap.jsx` — zoom, compass, 2D/3D tilt, авто-марказ, лабтопи қабатҳо (`MapControls`), кластерҳои истгоҳҳо ва мошинҳо |
| **Ҷустуҷӯ** | `SearchBar.jsx` — интегратсияи 4 провайдер (Nominatim, Google Places, Yandex Geocoder, Photon) + ҷустуҷӯи дохилии `routes/stops/vehicles` |
| **Масирсозӣ** | `RoutingPanel.jsx` — 8 режим (Авто, Такси, Пиёда, Вело, Самокат, Боркаш, Автобус, Маршрутка) + `transitRouter.js` (walk→bus→walk, 1 пересадка) + OSRM alternatives |
| **Навигатсия** | `NavigationContext.jsx` — GPS `watchPosition`, `bearing`, `speak` (ru-RU TTS), `reroute` ҳангоми дуршавӣ >30м, сабти `route_history` |
| **Офлайн** | `OfflineMaps.jsx` — боргирии `tile.openstreetmap.org/{z}/{x}/{y}` ба `CacheStorage 'karta-tiles'` (60 тайл), ҳолати `ready/failed` |
| **Ҳодисаҳо дар харита** | `MapEventsSheet.jsx` — таъини нуқта тавассути тап, `start/end` ихтиёрӣ, `map_events` |
| **Такси** | `TaxiPassenger.jsx` — 11 тариф (`src/lib/taxi.js`), `taxi_orders` lifecycle `searching→found→arrived→riding→completed`, `taxi_messages`, SOS |
| **Доставка** | `delivery-api` Edge Function — `POST /api/v1/orders`, `GET /status/:id`, webhooks `X-Karta-Signature: HMAC-SHA256` |

---

## 4. Меъмории лоиҳа

### 4.1 Диаграммаи умумӣ

```
┌─────────────────────────────────────────────────────────────────┐
│                        КЛИЕНТ (React 18 + Vite)                 │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────┐  │
│  │ Home.jsx │→ │ BusMap.jsx   │→ │RoutingPanel │→ │Navigation│  │
│  │ (оркестр)│  │ (Leaflet)    │  │(8 режим)    │  │Context   │  │
│  └──────────┘  └──────────────┘  └─────────────┘  └──────────┘  │
│        ↓              ↓                 ↓                ↓       │
│  BottomSheet  MapControls  SearchBar  PlaceCard  OfflineMaps     │
│  HomeHeader   HUD/BottomBar TripSummary  MapEventsSheet          │
│  Navigator/Vehicle/TruckSettings                                  │
│─────────────────────────────────────────────────────────────────│
│  lib/: RouteEngine | osrmClient | transitRouter | geo | taxi     │
│        cache (LRU 200) | overpass | useGeolocation               │
│  hooks/: useOfflineCache, useLocationSharing, useGroupRoute     │
│  api/: supabase.js | entities.js (makeEntity)                   │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTPS / WSS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE (eotkmnwneivithfkweds)              │
│  PostgreSQL (RLS)  ── 14 ҷадвали асосӣ + 12 такси + 7 доставка  │
│  + 8 ҷадвали модули харита (saved_places, route_history, ...)   │
│  Auth (Google OAuth)  Storage (avatars/reports/route-images)    │
│  Realtime (vehicles, taxi_orders, map_events, user_locations)   │
│  RPC: calculate_taxi_price, find_nearby, get_shared_locations   │
│  Edge Function: delivery-api (Deno)                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Хизматрасониҳои беруна                                          │
│  OSRM (router.project-osrm.org / routing.openstreetmap.de)      │
│  Nominatim + Photon + Overpass (kumi.systems / overpass-api.de)  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Ҷараёни масирсозӣ

`Тап Откуда/Куда → buildOsrmRoute()/findTransitRoutes() → onRouteBuilt({geometry, distance, duration, steps}) → BusMap Polyline (сафед ҳошия + ранга) → "В путь" → NavigationContext.startNavigation() → watchPosition → processPosition (smooth 3-нуқта, jump>150м филтр, bearing) → HUD/BottomBar → reroute`

### 4.3 Ҷараёни такси

`TaxiPassenger: demand_coef + nearby_summary → calcPrice → insert taxi_orders (searching) → Realtime channel taxi-passenger (водитель claim via taxi_orders_claim RLS) → arrived → riding → completed → taxi_pay_wallet RPC`

---

## 5. Стек технологияҳо

| Қабат | Технология | Версия |
|-------|------------|--------|
| Frontend | React, React Router, Vite, TypeScript | 18 / 6 / 6.1 / 5.8 |
| UI | Tailwind 3.4, Radix UI, Lucide, Sonner, Framer Motion, Vaul |  |
| Харита | Leaflet 1.9, React-Leaflet 4.2, react-leaflet-cluster, OSRM |  |
| Маълумот | TanStack Query 5, Supabase JS 2.108 |  |
| Backend | Supabase (Postgres + Auth + Realtime + Storage), pg_net, pgcrypto |  |
| Тест | Vitest 3 + Testing Library + jsdom + fast-check |  |
| Ҷойгиркунӣ | Vercel + GitHub CI |  |

---

## 6. Сохтори файлҳо

```
Karta-AD/
├── src/
│   ├── api/            # supabase.js, entities.js, base44Client.js
│   ├── components/     # BusMap.jsx, MapControls.jsx, RoutingPanel.jsx,
│   │   │               # NavigationHUD/BottomBar.jsx, PlaceCard, ShareRouteSheet,
│   │   │               # MapEventsSheet, MiniMap, BottomSheet, HomeHeader …
│   │   └── ui/         # shadcn (button, card, dialog …)
│   ├── hooks/          # useGeolocation, useOfflineCache, useLocationSharing,
│   │                   # useGroupRoute, useOverpassStops, useEntityList …
│   ├── lib/            # RouteEngine.js, osrmClient.js, transitRouter.js,
│   │                   # geo.js, cache.js, overpass.js, taxi.js, utils.js,
│   │                   # AuthContext, NavigationContext, NotificationContext
│   ├── pages/          # Home.jsx, MapView.jsx, Profile.jsx, AdminPanel.jsx,
│   │                   # TaxiPassenger/DriverDashboard, OfflineMaps,
│   │                   # Navigator/Vehicle/TruckSettings, Login …
│   ├── types/          # database.ts (Tables union)
│   └── App.jsx + main.jsx
├── supabase/
│   └── migrations/     # 20260725_complete_schema.sql … 20260805_public_transport_bluetooth.sql
├── packages/delivery/  # @karta-ad/delivery SDK
├── public/             # delivery docs, vite.svg
└── index.html + vite.config.js + tailwind.config.js
```

---

## 7. Насб ва роҳандозӣ

**Талабот:** Node 18+, npm 9+

```bash
# 1. Нусхабардорӣ
git clone <project-url>
cd Karta-AD

# 2. Вобастагиҳо
npm install

# 3. Муҳити зист (аз намуна нусха кунед)
cp .env.example .env.local
# дар .env.local пур кунед:
# VITE_SUPABASE_URL=https://eotkmnwneivithfkweds.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJ...
# SUPABASE_SERVICE_ROLE_KEY=eyJ... (танҳо сервер)
# VITE_GOOGLE_MAPS_KEY=AIza... (ихтиёрӣ)
# VITE_YANDEX_GEOCODER_KEY=0917... (ихтиёрӣ)

# 4. Роҳандозӣ
npm run dev        # http://localhost:5173
npm run build      # production ба /dist
npm run preview
npm run lint       # eslint . --quiet
npm run typecheck  # tsc -p ./jsconfig.json
npm run test       # vitest
```

---

## 8. Танзими Supabase

1. Дар [Supabase Dashboard → Settings → API] `URL` ва `anon/service_role` -ро гиред.
2. Мигратсияҳо дар `supabase/migrations/` — тавассути Dashboard SQL Editor ё `supabase db push` татбиқ кунед.
3. **Муҳим:** пас аз DDL кэши PostgREST-ро нав кунед: `SELECT pg_notify('pgrst','reload schema');`
4. Storage buckets: `avatars` (public), `reports` (public, барои аксҳои ҳодисаҳо), `route-images`, `documents`, `taxi_docs` — тавассути `storage.buckets` ё `create_storage_buckets()`.

Ҳуҷҷати муфассал: [SUPABASE.md](./SUPABASE.md), [CONFIGURATION_REPORT.md](./CONFIGURATION_REPORT.md)

---

## 9. Фармонҳои асосӣ

| Фармон | Тавсиф |
|--------|--------|
| `npm run dev` | Сервери рушд |
| `npm run build` | Сохтмони production |
| `npm run lint` / `lint:fix` | Санҷиши ESLint |
| `npm run typecheck` | Санҷиши TypeScript |
| `npm run test` | Vitest + Coverage |
| `supabase db push` | Фиристодани мигратсияҳо |
| `vercel --prod` | Ҷойгиркунӣ дар Vercel |

---

## 10. Меъмории пойгоҳи додаҳо (мухтасар)

**Асосӣ:** `profiles(id→auth.users), routes(city_id, created_by_id, stops JSONB), cities, vehicles(route_id, lat/lng/is_active), stops, schedules, reviews, favorite_routes, notifications, trip_logs, transactions, subscription_payments`

**Модули харита (20260804):** `saved_places, route_history, offline_maps(region_name, bbox, size_mb), navigation_settings(voice, night_mode, pip, auto_scale), vehicle_settings, truck_settings, map_events(lat/lng/type), location_shares + user_locations (Realtime)`

**Такси:** `taxi_drivers, taxi_vehicles, taxi_driver_locations(is_active), taxi_orders(searching→completed), taxi_messages, taxi_emergencies` — RLS `is_admin() SECURITY DEFINER`.

**Доставка:** `delivery_api_keys, delivery_orders, delivery_tracking, delivery_couriers, delivery_webhook_*` — HMAC `X-Karta-Signature`.

Навъҳо: `src/types/database.ts` `Tables` — манбаи ҳақиқат.

---

## 11. Ҳамгироии харита

* **Тайлҳо:** `voyager` (пешфарз `Osm` индекс 2), `dark_all`, `World_Imagery (hybrid)`, Google `m/s/y`, Esri — `MapControls.jsx:7 TILE_LAYERS`.
* **Маршрут:** `osrmClient.buildOsrmRoute` (`overview=full&geometries=geojson&steps=true&alternatives`) + `transitRouter.buildTransitOption` (walk 1.5км + bus OSRM + walk).
* **Ҷустуҷӯ:** `SearchBar` — Nominatim `viewbox ±2°`, Google `components=country:tj + locationbias`, Yandex `ll/spn 2.0`, Photon `bias`.
* **POI:** `PoiOverlay.jsx` Overpass `CATEGORIES` 43 адад.

---

## 12. Ҷойгиркунӣ

`vercel.json` + `VITE_SUPABASE_*` дар Vercel Env. Ҳар push ба `main` — авто-deploy тавассути GitHub.

---

## 13. Саҳмгузорӣ ва дастгирӣ

* Дархостҳои нав: `https://github.com/anomalyco/opencode` (ишора кунед ки `Meta Muse Spark` истифода мешавад)
* Мушкилоти Supabase: `supabase db advisors` — мунтазам иҷро кунед.

---

> **Эзоҳ:** Ин README ба забони тоҷикӣ навсозӣ шудааст. Нусхаи англисӣ дар `README.en.md` (дар сурати зарурат) ва ҳуҷҷати аслӣ `SUPABASE.md`-ро нигоҳ доред.
