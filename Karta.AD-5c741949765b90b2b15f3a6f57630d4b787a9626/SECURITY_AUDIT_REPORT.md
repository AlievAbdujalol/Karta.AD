# Security Audit Report — Karta-AD

**Date:** 2026-08-02
**Scope:** Supabase (DB/RLS/RPC), Storage, Edge Functions, Client code, .env hygiene
**Status:** 0 CRITICAL errors — all critical vulnerabilities fixed and verified.

---

## Critical Issues Found & Fixed

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | `cities` had **RLS disabled** with 4 open policies (`public ALL`, `anon SELECT true`, `USING/CHECK true`) | 🔴 CRITICAL | RLS enabled; `cities_read` (SELECT for anon/authenticated), `cities_admin_write` (ALL via `is_admin()`) |
| 2 | `profiles` — **PII leak**: anyone could SELECT all profiles (email, balance, phone) | 🔴 CRITICAL | `profiles_select`: self / admin / driver-role / order participants only |
| 3 | `profiles` — **privilege escalation**: user could UPDATE own `role` to `admin` and set `admin_activated=true` | 🔴 CRITICAL | `profiles_update` WITH CHECK: `balance` and `admin_activated` immutable; `role` restricted to `passenger/driver/taxi_driver/courier` |
| 4 | `taxi_wallet_transactions` — anyone could INSERT/read arbitrary wallet transactions | 🔴 CRITICAL | Open `wallet_tx_insert`, `wallet_tx_select`, `taxi_wallet_select_own` policies dropped |
| 5 | `taxi_orders` — INSERT allowed arbitrary `passenger_id`; UPDATE by anyone; **price forgeable** | 🔴 CRITICAL | INSERT check `passenger_id = auth.uid()`; UPDATE for participants/admin; trigger `protect_taxi_order_price` (SECURITY DEFINER) blocks price change unless admin |
| 6 | `taxi_pay_wallet` / `taxi_wallet_pay` — **IDOR**: anyone could debit any user's wallet, amount client-supplied | 🔴 CRITICAL | Requires `auth.uid()` ∈ (passenger_id, driver_id) or admin; order must match; **amount taken from DB order price**, not argument |
| 7 | `taxi_wallet_topup` — anyone could top up any wallet | 🔴 CRITICAL | Requires `auth.uid() = p_user_id` or admin; positive amount |
| 8 | `taxi_wallet_balance` — any balance readable | 🟠 HIGH | Returns NULL unless self/admin |
| 9 | `activate_subscription` — any user could grant any role incl. `admin` | 🔴 CRITICAL | Raises exception unless caller is admin for `admin` role |
| 10 | `notifications` — INSERT with arbitrary `user_id` (spam/forgery) | 🟠 HIGH | Restricted to self / order participants / route creator |
| 11 | `taxi_drivers` — driver could set own `is_verified=true`, inflate rating | 🟠 HIGH | UPDATE WITH CHECK blocks `is_verified`/`rating` tamper for self |
| 12 | `get_delivery_order` — internal order data via anon RPC | 🟠 HIGH | Restricted to `service_role`/admin via `auth.role()` check |
| 13 | ~16 sensitive RPCs executable by `anon` (wallet, courier, payment, route transfer, API-key validation) | 🔴 CRITICAL | REVOKE from `anon` AND `PUBLIC`; GRANT to `authenticated`/`service_role` (grants had leaked through `PUBLIC`) |
| 14 | SECURITY DEFINER functions without `search_path` — search_path hijack risk | 🟠 HIGH | `SET search_path TO public` on all ~30 functions |
| 15 | `routes`, `schedules`, `stops`, `vehicles`, `taxi_vehicles`, `taxi_driver_locations`, `taxi_favorite_addresses`, `taxi_driver_documents` — missing WITH CHECK / read policies | 🟠 HIGH | WITH CHECK added for owners; read policies added |
| 16 | `taxi_ratings` — unauthenticated read | 🟡 MEDIUM | SELECT restricted to authenticated |
| 17 | `taxi_promotions` — anon could see inactive promotions | 🟡 MEDIUM | SELECT only `is_active` |

---

## Verified Fixed (post-fix testing)

- **RLS enabled on ALL public tables** — `pg_tables` check for `relrowsecurity = false` returned empty
- **Advisors: 0 ERRORs** (was 2 on `cities`)
- **anon RPC blocked via REST** — verified live with anon key:
  - `taxi_pay_wallet`, `get_delivery_order`, `courier_update_location`, `taxi_wallet_topup` → HTTP 401
  - `transfer_route`, `activate_subscription`, `calculate_delivery_price` → HTTP 404 (not exposed)
- **Grants confirmed** via `has_function_privilege`: all sensitive functions `anon_exec=false`, `auth_exec=true`
- **Storage** — only bucket `taxi_docs` (private, 3 objects); policies use standard `storage.foldername(name)[1] = auth.uid()` pattern + admin read
- **Client code** — `src/api/supabase.js` uses publishable key only; `delivery-api` edge function uses `SUPABASE_SERVICE_ROLE_KEY` server-side only, authenticated via `delivery_api_keys` + HMAC

---

## Remaining Advisors WARNs (all intentional / low risk)

| WARN | Why it stays |
|------|--------------|
| `extension_in_public` (pg_net) | Needed for delivery webhook queueing; standard Supabase pattern |
| `anon_security_definer_function_executable` (calculate_delivery_price) | Deliberate — price quote must work without auth; no data returned |
| `anon_security_definer_function_executable` (is_admin, is_super_admin) | Required by RLS policies for anon role; always return false |
| `authenticated_security_definer_function_executable` (~32 functions) | All now protected by internal `auth.uid()` / role checks — safe-by-design pattern |
| `auth_leaked_password_protection` | Optional dashboard setting (HaveIBeenPwned check) |

---

## Recommended Follow-ups (non-blocking)

1. Enable **Leaked Password Protection** in Auth dashboard settings
2. Consider moving `pg_net` to a non-public schema (e.g. `net`) — requires migration of `webhook_delivery_events` logic
3. Add `admin_activated` email verification flow (currently set via admin RPC only)
4. `.env.example` now uses placeholders — real keys live only in local `.env` / Vercel

---

## Migrations Applied

- `security_hardening_20260802` — RLS policies, function hardening, `protect_taxi_order_price` trigger
- `security_hardening_rpc_grants` — `search_path` fixes
- `security_fix_rpc_grants_public` — REVOKE anon/PUBLIC + GRANT authenticated/service_role
