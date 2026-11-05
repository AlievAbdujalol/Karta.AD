/**
 * Регресс консольных ошибок прод-сборки (отчёт из консоли karta-ad.vercel.app):
 *
 * 1. CORS на зеркалах Overpass — прод-клиент уходил напрямую в зеркала:
 *    детект прода по `import.meta.env.PROD` (= NODE_ENV === 'production')
 *    срывается строкой `NODE_ENV=development` в .env.local / в переменных
 *    окружения Vercel → PROD=false → прямые кросс-доменные запросы,
 *    5xx-ответы зеркал — без Access-Control-Allow-Origin → ERR_FAILED.
 *    Плюс PoiOverlay делал собственный GET на overpass-api.de мимо клиента.
 * 2. 503 generativelanguage + тост «AI explanation failed» — AiRouteExplainer
 *    дёргал @google/generative-ai (v1beta, жёсткая gemini-3.5-flash)
 *    вместо общего клиента проекта (v1, gemini-3.6-flash).
 * 3. Предупреждение «Banner not shown: preventDefault() called…» —
 *    installPrompt подавлял системный баннер, но prompt() вызывал только
 *    по кнопке пользователя.
 *
 * Тесты статические (чтение исходников), как securityHeaders.test.js.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { overpassEndpoints, OVERPASS_PROXY_PATH } from '@/lib/overpass';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/** Код без комментариев: проверки не должны цепляться за текст в пояснениях. */
const code = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('Overpass: в проде только свой прокси', () => {
  const src = code(read('src/lib/overpass.js'));

  it('дефолт — детект прода по MODE, не по PROD (NODE_ENV не должен ломать)', () => {
    // PROD = (NODE_ENV === 'production'): строка NODE_ENV=development в .env.local
    // или в переменных Vercel превращала прод-сборку в dev (PROD=false),
    // и клиент снова шёл напрямую в зеркала. MODE задаётся режимом сборки
    // (`vite build` → 'production') и от NODE_ENV не зависит.
    expect(src).toContain("overpassEndpoints(prod = import.meta.env.MODE === 'production')");
    expect(src).not.toMatch(/import\.meta\.env\?\.PROD/);
    expect(src).not.toContain('import.meta.env.PROD)');
  });

  it('prod=true → ровно свой /api/overpass (кросс-доменных зеркал нет)', () => {
    expect(overpassEndpoints(true)).toEqual([OVERPASS_PROXY_PATH]);
  });

  it('PoiOverlay не ходит на зеркала напрямую — только общий fetchOverpass', () => {
    const poi = code(read('src/components/PoiOverlay.jsx'));
    expect(poi).not.toMatch(/fetch\(\s*[`'"]https?:\/\/overpass/);
    expect(poi).not.toContain('overpass-api.de/api/interpreter');
    expect(poi).toContain("import { fetchOverpass } from '@/lib/overpass'");
  });

  it('клиентские вызовы Overpass идут через fetchOverpass', () => {
    const transit = code(read('src/lib/osmTransit.js'));
    const search = code(read('src/lib/searchUtils.js'));
    expect(transit).toContain('fetchOverpass(');
    expect(search).toContain('fetchOverpass(');
    expect(transit).not.toMatch(/fetch\(\s*[`'"]https?:\/\/overpass/);
    expect(search).not.toMatch(/fetch\(\s*[`'"]https?:\/\/overpass/);
  });
});

describe('Gemini: общий клиент проекта, а не SDK v1beta', () => {
  const src = code(read('src/components/AiRouteExplainer.jsx'));

  it('нет @google/generative-ai, v1beta и gemini-3.5-flash', () => {
    expect(src).not.toContain('@google/generative-ai');
    expect(src).not.toContain('GoogleGenerativeAI');
    expect(src).not.toContain('v1beta');
    expect(src).not.toContain('gemini-3.5-flash');
  });

  it('использует src/lib/gemini.js (endpoint v1, модель gemini-3.6-flash)', () => {
    expect(src).toContain("from '@/lib/gemini'");
    expect(src).toContain('geminiGenerate(');
    expect(src).toContain('geminiErrorText(');
    const client = code(read('src/lib/gemini.js'));
    expect(client).toContain('https://generativelanguage.googleapis.com/v1/models');
    expect(client).toContain('gemini-3.6-flash');
    expect(client).not.toContain('v1beta');
  });
});

describe('beforeinstallprompt: системный баннер не подавляем', () => {
  it('installPrompt не вызывает preventDefault — иначе Chromium пишет «Banner not shown»', () => {
    const src = code(read('src/lib/installPrompt.js'));
    expect(src).not.toMatch(/preventDefault\s*\(/);
    expect(src).toContain('window[PROMPT_KEY] = e'); // событие сохраняется для кнопки
  });

  it('показ промпта остаётся за пользователем (promptInstall)', () => {
    const src = read('src/lib/installPrompt.js');
    expect(src).toContain('deferred.prompt()');
  });
});
