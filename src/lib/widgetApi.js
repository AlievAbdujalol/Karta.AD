/**
 * widgetApi — тонкие fetch-обёртки для виджета (без supabase-js в бандле).
 * anon-ключ publishable, встраивается в сборку через vite define.
 */
import { reverseGeocodeUrl } from '@/lib/geo';

export function restHeaders(anonKey, { representation = true } = {}) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    ...(representation ? { Prefer: 'return=representation' } : {}),
  };
}

async function req(url, opts, label) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    throw new Error(`${label}: ${e.message}`);
  }
  if (!res.ok) {
    const text = await (res.text ? res.text() : '').catch(() => '');
    throw new Error(`${label}: HTTP ${res.status} ${text}`.trim());
  }
  return res;
}

/** Публичный каталог: RPC get_public_business (только active-бизнесы). */
export async function fetchBusiness(cfg) {
  const res = await req(
    `${cfg.supabaseUrl}/rest/v1/rpc/get_public_business`,
    {
      method: 'POST',
      headers: restHeaders(cfg.anonKey, { representation: false }),
      body: JSON.stringify({ p_business_id: cfg.businessId }),
    },
    'get_public_business',
  );
  return res.json();
}

/** Заказ + позиции. Ошибка на любом шаге → исключение (без половинчатых заказов). */
export async function createOrder(cfg, { order, rows = [] }) {
  const res = await req(
    `${cfg.supabaseUrl}/rest/v1/orders`,
    {
      method: 'POST',
      headers: restHeaders(cfg.anonKey),
      body: JSON.stringify(order),
    },
    'create order',
  );
  const created = await res.json();
  const row = Array.isArray(created) ? created[0] : created;

  if (rows.length) {
    await req(
      `${cfg.supabaseUrl}/rest/v1/order_items`,
      {
        method: 'POST',
        headers: restHeaders(cfg.anonKey),
        body: JSON.stringify(rows.map((r) => ({ ...r, order_id: row?.id }))),
      },
      'order items',
    );
  }
  return row;
}

/** Обратное геокодирование: пин на карте → JSON Nominatim (best-effort). */
export async function reverseGeocode(lat, lng) {
  const url = reverseGeocodeUrl(lat, lng);
  if (!url) return null;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  return res.json();
}
