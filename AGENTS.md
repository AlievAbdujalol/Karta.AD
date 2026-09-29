# Karta-AD — Agent Guide

React 18 + Vite 6 + Supabase. JS in `.jsx` (`allowJs`, `checkJs: false`, non-strict TS). Alias `@` → `./src` (vite/tsconfig/vitest).

## Commands (CI order: build → lint → typecheck → test)

```bash
npm run dev        # http://localhost:5173
npm run build
npm run lint       # eslint . ; fix: npm run lint:fix
npm run typecheck  # tsc --noEmit -p ./tsconfig.json (NOT jsconfig.json)
npm run test -- --run
npx vitest run <path>  # single test, e.g. src/test/utils.test.js
vercel --prod      # deploy; push to main auto-deploys
```

Node 20 (CI uses `npm ci`). Env: copy `.env.example` → `.env.local`, never commit it.

## Entrypoints

- `src/main.jsx` → `src/App.jsx`; map home: `src/pages/Home.jsx` (+ `BusMap.jsx`, `BottomSheet.jsx`, `SearchBar.jsx`, `RoutingPanel.jsx`).
- Taxi passenger form: `src/pages/TaxiPassenger.jsx` + `src/components/taxi/TaxiTariffPanel.jsx`; tariffs source: `src/lib/taxi.js` (`TARIFFS`).
- Driver vehicle settings: `src/pages/Profile.jsx` (car tab).
- Shared libs: `src/lib/{osrmClient,overpass,geo,searchUtils,gemini,aiAssistant}.js`.

## Supabase (ref `eotkmnwneivithfkweds`)

- Migrations live in `supabase/migrations/`. After DDL run `SELECT pg_notify('pgrst','reload schema');` or PostgREST serves stale schema.
- In this environment the Supabase CLI token is broken (`LegacyInvalidAccessTokenError`): use MCP Supabase tools or Dashboard SQL Editor for DB work, not `supabase db query`.
- Never disable RLS for convenience. Never put `SUPABASE_SERVICE_ROLE_KEY` in frontend (server-only).
- Keys: anon key is `sb_publishable_…`; service_role stays in server env.

## Taxi vs Delivery — do not mix

Two separate systems:
- In-app taxi/delivery: `taxi_orders` (`category: delivery|courier`), extras in `TaxiTariffPanel`, price via `calcPrice` + `priceSurcharge` in `src/lib/taxi.js` (mirror of DB RPC).
- Shop delivery: `delivery_orders` + Edge Function `supabase/functions/delivery-api/index.ts` + SDK `packages/delivery/`.
- Delivery statuses, GPS, webhooks, RLS rules, security: authoritative source is `KARTA_AD_DELIVERY_SPEC.md` — do not duplicate it here.

## Map / routing / search

- Real Leaflet map only (`BusMap.jsx`); never a static image or second map system.
- Routing: `src/lib/osrmClient.js`; POIs: `fetchOverpass` in `src/lib/overpass.js` (has fallback URLs); Nominatim needs `User-Agent: KartaAD/1.0` header.
- Search bias: pass `mapCenter` into `smartSearch`/`searchAll` (`src/lib/searchUtils.js`).

## Gemini AI

- Key format is `AQ.…` (not `AIza…`); model `gemini-3.6-flash`; endpoint `v1` (not `v1beta`).
- Always send `thinkingConfig: { thinkingBudget: 0 }` and filter `!p.thought` parts.
- `.env.example` model comment is stale — trust this file.

## Lint

`unused-imports/no-unused-imports` is error; prefix intentionally unused vars/args with `_`. `react/prop-types` off.

## Docs

- `SUPABASE.md` — schema/RLS/realtime details.
- `KARTA_AD_DELIVERY_SPEC.md` — delivery platform spec (single source; deleted duplicates are intentional — reference it, don't recreate).
