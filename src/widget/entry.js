/**
 * entry — точка входа виджета для чужих сайтов.
 * <script src="https://host/widget.js" data-business="UUID" defer></script>
 *
 * Собирается отдельным конфигом (vite.widget.config.js) в IIFE dist/widget.js,
 * без SPA-бандла. Повторная загрузка скрипта не создаёт второй виджет.
 */
import { readWidgetConfig } from '@/lib/widgetConfig';
import { fetchBusiness, createOrder, reverseGeocode } from '@/lib/widgetApi';
import { createWidget } from './app';

function findOwnScript() {
  if (document.currentScript) return document.currentScript;
  return Array.from(document.scripts).find((s) => s.hasAttribute('data-business')) || null;
}

function boot() {
  if (window.__kartaWidgetLoaded) return;
  window.__kartaWidgetLoaded = true;

  const cfg = readWidgetConfig(findOwnScript());
  if (!cfg) return;

  createWidget({
    doc: document,
    cfg,
    api: { fetchBusiness, createOrder, reverseGeocode },
  });
}

boot();

export default boot;
