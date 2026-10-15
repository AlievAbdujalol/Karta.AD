import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Регресс: «в тёмной теме поля белые, текст нечитаем».
 * Причина — несуществующие оттенки Tailwind (`slate-850`, `blue-650`):
 * компилятор молча не генерирует CSS, `dark:bg-*` не применяется,
 * а парный `dark:text-slate-100` применяется → светлый текст на белом фоне.
 *
 * Валидная шкала Tailwind: 50,100,200,…,900,950.
 * Тест сканирует исходники на любые «ступени с шагом 50» вне этой шкалы.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const VALID_SHADES = new Set([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);

// slate-850, blue-650, gray-150 … но НЕ «rounded-lg», «w-350px» и т.п.
const SHADE_RE = /\b(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(\d{2,3})\b/g;

function collectInvalid(pathStart) {
  const bad = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'test' || e.name === 'locales') continue;
        walk(p);
      } else if (/\.(jsx?|tsx?)$/.test(e.name)) {
        const s = fs.readFileSync(p, 'utf8');
        let m;
        SHADE_RE.lastIndex = 0;
        while ((m = SHADE_RE.exec(s))) {
          const shade = Number(m[1]);
          if (!VALID_SHADES.has(shade)) {
            bad.push(`${path.relative(root, p)}: ${m[0]}`);
          }
        }
      }
    }
  };
  walk(pathStart);
  return bad;
}

describe('Tailwind palette', () => {
  it('в исходниках нет несуществующих оттенков (-150…-850 и т.п.)', () => {
    const bad = collectInvalid(root);
    expect(bad, `Найдены несуществующие оттенки (замените на ближайший валидный):\n${bad.join('\n')}`).toEqual([]);
  });
});
