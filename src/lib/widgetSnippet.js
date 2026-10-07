/**
 * widgetSnippet — генератор встройки виджета на чужой сайт.
 * Используется в BusinessDashboard (кнопка «Копировать») и в тестах.
 */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/**
 * Одна строка вставки:
 * <script src="https://host/widget.js" data-business="UUID" defer></script>
 * origin пустой/не-http(s) → null; id экранируется, чтобы разметка не сломалась.
 */
export function buildWidgetSnippet(businessId, origin, opts = {}) {
  if (!businessId) return null;
  const base = String(origin || '').replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/i.test(base)) return null;
  const lang = opts.lang ? ` data-lang="${esc(opts.lang)}"` : '';
  return `<script src="${esc(base)}/widget.js" data-business="${esc(businessId)}"${lang} defer></script>`;
}

/**
 * Канонический origin для ресурсов Karta (виджет, ссылки такси):
 * на проде — текущий origin, на localhost/dev — публичный адрес,
 * чтобы в сгенерированных сайтах не зашивался http://localhost:5173.
 */
export const PUBLIC_ORIGIN = 'https://karta-ad.vercel.app';

export function canonicalOrigin() {
  if (typeof window === 'undefined') return PUBLIC_ORIGIN;
  const { protocol, hostname, origin } = window.location;
  const isLocal = protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1');
  return isLocal ? PUBLIC_ORIGIN : origin;
}

// <script src="…/widget.js"> в любом виде: абсолютный (localhost/чужой origin)
// или относительный (/widget.js) — в srcdoc-iframe с origin null он не работает.
const WIDGET_SRC_RE = /(<script\b[^>]*\bsrc=["'])[^"']*\/widget\.js(["'])/gi;

/**
 * Переписывает любой script-тег виджета на канонический абсолютный адрес.
 * Безопасно для null/пустых значений (возвращает как есть).
 */
export function normalizeWidgetUrls(html, origin = canonicalOrigin()) {
  if (!html || !origin) return html;
  return String(html).replace(WIDGET_SRC_RE, (_m, head, tail) => `${head}${origin}/widget.js${tail}`);
}

/** Примеры якорей для секционного встраивания. */
export function buildAnchorHints() {
  return [
    '<!-- Секции виджета на вашей странице (по желанию): -->',
    '<div data-karta="catalog"></div>',
    '<div data-karta="cart"></div>',
    '<div data-karta="checkout"></div>',
  ].join('\n');
}
