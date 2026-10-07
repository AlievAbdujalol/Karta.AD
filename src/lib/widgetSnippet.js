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

/** Примеры якорей для секционного встраивания. */
export function buildAnchorHints() {
  return [
    '<!-- Секции виджета на вашей странице (по желанию): -->',
    '<div data-karta="catalog"></div>',
    '<div data-karta="cart"></div>',
    '<div data-karta="checkout"></div>',
  ].join('\n');
}
