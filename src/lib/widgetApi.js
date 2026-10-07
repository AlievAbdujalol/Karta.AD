/**
 * widgetApi — тонкие fetch-обёртки для виджета (без supabase-js в бандле).
 * anon-ключ publishable, встраивается в сборку через vite define.
 */
import { reverseGeocodeUrl } from '@/lib/geo';
import { storeOrderErrorMessage, STORE_ORDER_FALLBACK } from '@/lib/orderErrors';

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

/**
 * Заказ через RPC create_store_order: сервер берёт цены из каталога,
 * считает доставку из настроек сайта, проверяет остатки, минимальную сумму
 * и rate-limit. Аргументы собирает buildStoreOrderArgs — без цен и total.
 * Серверные коды ошибок превращаются в понятные сообщения.
 */
export async function createStoreOrder(cfg, args) {
  let res;
  try {
    res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/create_store_order`, {
      method: 'POST',
      headers: restHeaders(cfg.anonKey, { representation: false }),
      body: JSON.stringify(args),
    });
  } catch (e) {
    throw new Error(`create_store_order: ${e.message}`);
  }
  if (!res.ok) {
    const text = await (res.text ? res.text() : '').catch(() => '');
    let message = text;
    try {
      message = JSON.parse(text).message || text;
    } catch { /* не JSON — оставляем сырой текст */ }
    const friendly = storeOrderErrorMessage(message);
    throw new Error(
      friendly === STORE_ORDER_FALLBACK ? `${friendly} (HTTP ${res.status})` : friendly,
    );
  }
  return res.json();
}

/** Обратное геокодирование: пин на карте → JSON Nominatim (best-effort). */
export async function reverseGeocode(lat, lng) {
  const url = reverseGeocodeUrl(lat, lng);
  if (!url) return null;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  return res.json();
}
