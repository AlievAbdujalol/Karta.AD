---
name: karta-website-builder
description: "Use when building or changing the Karta-AD AI Website Builder: site generation, sections, preview, versions, publish, Karta-AD module wiring (delivery/taxi/map/reviews/products), ai_projects storage, OpenRouter integration. Triggers: AI-конструктор, /business/ai, сайт бизнеса, секции сайта, publish сайта."
metadata:
  author: karta-ad
  version: "1.0.0"
---

# Karta-AD Website Builder

React 18 + Vite 6 SPA. AI Website Builder lives at route `/business/ai` (`src/pages/BusinessAI.jsx`).
LLM returns **structured JSON**, never raw HTML. A deterministic compiler builds the site.

## Where things live

| What | Where |
|---|---|
| Builder page (chat + preview + projects + versions) | `src/pages/BusinessAI.jsx` |
| Chat / preview / sections panels | `src/components/aiBuilder/{BuilderChat,BuilderPreview,SectionsPanel}.jsx` |
| Model selector (dynamic free list) | `src/components/AIModelSelector.jsx` |
| Structure schema, prompts, compiler | `src/lib/siteBuilder.js` (pure, tested) |
| Model catalog, cache, fallback | `src/lib/aiModels.js` |
| OpenRouter direct client (fallback) | `src/lib/openrouter.js` |
| Site image upload | `src/lib/siteImages.js` → Storage bucket `site-images` |
| Backend (key lives ONLY here) | `supabase/functions/ai-proxy/index.ts` (`?action=models`, `?action=chat`) |
| Tables | `ai_projects`, `ai_project_versions` (builder); `business_sites` (legacy published links) |
| Public site | `src/pages/SiteView.jsx`, route `/s/:id` (checks versions first, then legacy) |
| Tests | `src/test/siteBuilder.test.js`, `src/test/aiModels.test.js` |

## Core flow

1. User prompt → `buildStructureMessages(biz, prompt)` (biz = business + active products auto-injected).
2. `chatWithFallback()` via backend (max 3 tries, paid blocked without confirm).
3. `extractSiteJson()` → `validateStructure()` (unknown types → `about`, strips over-long fields).
4. `compileSite(structure, biz, opts)` → HTML. `opts={supabaseUrl, anonKey, preview}`: with shop config the
   `products` section renders cart (+ В корзину), sticky cart bar, checkout → POST `orders` + `order_items`
   via anon REST (RLS `orders_insert_public` / `order_items_insert_public`, active businesses only).
   `preview:true` disables submit (demo notice). Without config — static cards only.
   Multi-file: preview and `/s/:id` use `buildInlineDoc()` (local css/js inlined — blob: is blocked
   in sandbox without allow-same-origin). Published multi sites appear on the map
   (`get_public_sites()` RPC → marker with «Открыть сайт» link).
5. Save appends a version row. Undo/redo = pointer over versions, never mutate history.
6. Manual section edits use a draft + 1.2s debounce (never save per keystroke).
7. Publish sets `is_published` on one version, unpublishes siblings.

## Structure schema

`{ site: { name, description, theme: { primary: '#rrggbb', dark: bool }, pages: [{ name, sections: [...] }] } }`.
Section: `{ type, title, description, buttons[≤3], items[≤12], image, background }`.
Allowed `type`: hero features products services about gallery reviews map contact delivery taxi footer.
Limits enforced in `validateStructure`: ≤5 pages, ≤20 sections, field length caps.

## Karta-AD module wiring (auto-connect)

Renderer (`sectionHtml` in `siteBuilder.js`) auto-connects business data — do NOT ask the user for data that exists:
- `products` → active products (name + price) from business, fallback to section items.
- `contact` → `tel:` link from phone, address line, optional WhatsApp (`wa.me/<digits>` derived from phone).
- `taxi` → CTA to the Taxi tab; `delivery` → Karta-AD Delivery block; `map` → OSM search link from address; `reviews` → rating placeholder.
- Business context comes from `get_my_businesses()` + active `products`, never from chat memory.

Adding a NEW module (e.g. `booking`):
1. Add type to `SECTION_TYPES`.
2. Add renderer case in `sectionHtml` (+ test in `siteBuilder.test.js` covering render + XSS escaping).
3. Add the type word to `STRUCTURE_SYSTEM` type list prompt.
4. If it needs business data, extend the `biz` object where `bizContext()` is built in `BusinessAI.jsx`.

## Backend rules (Supabase here is special)

- CLI token is broken: use MCP Supabase tools or Dashboard SQL Editor, never `supabase db query`.
- The migration runner splits statements on `;` — one statement per `apply_migration` call; plpgsql bodies break. Prefer single-statement SQL functions with `$fn$` quoting.
- After DDL: `SELECT pg_notify('pgrst','reload schema')`.
- New tables need a local file in `supabase/migrations/` (remote history drifts otherwise).
- RLS on every table. Projects/versions: owner-only via `auth.uid()`; published versions readable publicly. Storage `site-images`: `bucket_id='site-images'`, write path `{userId}/...` must equal `auth.uid()`.
- `OPENROUTER_API_KEY` lives ONLY as Edge Function secret (Dashboard → Functions → Secrets; redeploy after setting). Never in frontend, never in logs (log only model/status/ms/counts).
- Direct frontend calls use the USER's own key (`user_api_keys`, RLS owner-only) and only as labeled fallback when backend is down.

## Verification (always, in order)

`npm run build` → `npm run lint` (0 errors) → `npm run typecheck` → `npm run test -- --run`.
Plus manual: generate → edit via chat → section edit → undo → publish → open `/s/:id` in incognito.

## Never

- Return raw model HTML to preview without `validateStructure` + escaping (`esc()` on every interpolated string — XSS test must pass).
- Save a version per keystroke; mutate version history; expose `OPENROUTER_API_KEY` to frontend/logs.
- Create a second website-builder, second Supabase client, or parallel AI service — extend these files.
