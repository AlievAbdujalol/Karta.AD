/**
 * widgetConfig — чтение конфигурации виджета из <script> тега
 * и поиск якорных мест на чужой странице.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ANCHOR_TYPES = ['catalog', 'cart', 'checkout'];

/**
 * Разбор атрибутов script-тега. Возвращает null и предупреждение,
 * если business не задан или не похож на UUID (защита от мусора/XSS).
 */
export function readWidgetConfig(scriptEl) {
  const data = scriptEl?.dataset;
  const businessId = data?.business;
  if (!businessId || !UUID_RE.test(businessId)) {
    console.warn('[Karta-AD widget] нужен корректный data-business (UUID) в script-теге');
    return null;
  }
  return {
    businessId,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    appOrigin: typeof window !== 'undefined' ? window.location.origin : '',
    lang: data.lang || 'ru',
    mapEnabled: data.map !== 'off',
  };
}

/**
 * Якоря: <div data-karta="catalog|cart|checkout"> — секции виджета
 * инлайном встраиваются в эти места. Неизвестные значения игнорируются.
 */
export function findAnchors(doc) {
  const out = { catalog: null, cart: null, checkout: null };
  if (!doc?.querySelectorAll) return out;
  doc.querySelectorAll('[data-karta]').forEach((el) => {
    const key = el.getAttribute('data-karta');
    if (ANCHOR_TYPES.includes(key) && !out[key]) out[key] = el;
  });
  return out;
}
