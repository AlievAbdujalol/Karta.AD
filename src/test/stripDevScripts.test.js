/**
 * stripDevScripts — из опубликованного/preview HTML (sandbox, origin null)
 * убираем dev-скрипты Vite: в чужом контексте они дают CORS-ошибки
 * «Access to script … from origin 'null'» и оставляют страницу пустой.
 */
import { describe, it, expect } from 'vitest';
import { stripDevScripts, buildInlineDoc } from '../lib/projectFiles';
import { normalizeWidgetUrls } from '../lib/widgetSnippet';

const DEV_HEAD = `<!doctype html>
<html lang="ru"><head>
<script type="module" src="/@vite/client"></script>
<script type="module">import RefreshRuntime from "/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);</script>
<script type="module" src="/src/main.jsx"></script>
<script type="module" src="http://localhost:5173/@vite/client"></script>
<script type="module" src="http://localhost:5173/src/main.jsx"></script>
</head><body><div id="root"></div>
<script src="app.js"></script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>window.__store = { cart: {} };</script>
</body></html>`;

describe('stripDevScripts', () => {
  it('удаляет @vite/client и /src/main.jsx (корневые и абсолютные)', () => {
    const out = stripDevScripts(DEV_HEAD);
    expect(out).not.toMatch(/@vite\/client/);
    expect(out).not.toMatch(/\/src\/main\.jsx/);
  });

  it('удаляет инлайн-преамбулу @react-refresh', () => {
    const out = stripDevScripts(DEV_HEAD);
    expect(out).not.toMatch(/@react-refresh/);
    expect(out).not.toMatch(/RefreshRuntime/);
  });

  it('сохраняет легитимные скрипты (CDN и инлайн-логику магазина)', () => {
    const out = stripDevScripts(DEV_HEAD);
    expect(out).toContain('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    expect(out).toContain('window.__store');
    expect(out).toContain('<div id="root">');
  });

  it('пустой/несуществующий ввод не ломает', () => {
    expect(stripDevScripts('')).toBe('');
    expect(stripDevScripts(null)).toBe(null);
  });

  it('buildInlineDoc возвращает entry без dev-скриптов', () => {
    const out = buildInlineDoc({ 'index.html': DEV_HEAD, 'app.js': 'window.__ok = 1;' }, 'index.html');
    expect(out).not.toMatch(/@vite\/client|@react-refresh|\/src\/main\.jsx/);
    expect(out).toContain('window.__ok = 1;');
  });

  it('normalizeWidgetUrls чистит dev-скрипты и переписывает widget.js', () => {
    const html = '<script src="/widget.js" data-business="b1"></script>\n' + DEV_HEAD;
    const out = normalizeWidgetUrls(html, 'https://karta-ad.vercel.app');
    expect(out).toContain('https://karta-ad.vercel.app/widget.js');
    expect(out).not.toMatch(/@vite\/client|@react-refresh|\/src\/main\.jsx/);
  });
});
