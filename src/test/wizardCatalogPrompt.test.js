import { describe, it, expect } from 'vitest';
import { catalogForPrompt, buildWizardPrompt, wizardDefaults } from '../lib/wizardConfig';

// Регресс «каталога нет на сайте»: в промпт уходили только имена отмеченных
// товаров (и то не всегда), без цен — LLM придумывал свои («AD Runner 499
// сомони» вместо реальных «кроссовки — 50 TJS»). Теперь каталог в промпте
// всегда реальный: выбранные товары, а при пустом выборе — все (как и
// обещает wizardDefaults.productIds: «пусто = все товары бизнеса»).
describe('catalogForPrompt — реальный каталог в промпте генерации', () => {
  const PRODUCTS = [
    { id: 'p1', name: 'кроссовки', price: '50.00' },
    { id: 'p2', name: 'очки', price: 100 },
  ];

  it('пустой выбор = все товары бизнеса, цена из каталога', () => {
    expect(catalogForPrompt(PRODUCTS, [])).toEqual([
      'кроссовки — 50 TJS',
      'очки — 100 TJS',
    ]);
  });

  it('выбранные в визарде товары — только они', () => {
    expect(catalogForPrompt(PRODUCTS, ['p2'])).toEqual(['очки — 100 TJS']);
  });

  it('битые записи и не-числовая цена не роняют промпт', () => {
    const list = [
      null,
      { id: 'p3', name: '', price: 10 },
      { id: 'p4', name: 'шнурки', price: 'abc' },
    ];
    expect(catalogForPrompt(list, [])).toEqual(['шнурки — 0 TJS']);
    expect(catalogForPrompt(null, [])).toEqual([]);
  });

  it('не больше 20 позиций в промпте', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, name: `товар ${i}`, price: i }));
    const out = catalogForPrompt(many, []);
    expect(out).toHaveLength(20);
    expect(out[19]).toBe('товар 19 — 19 TJS');
  });

  it('buildWizardPrompt вставляет каталог строкой «Акцент в каталоге»', () => {
    const state = { ...wizardDefaults({}), heroTitle: 'Магазин-AD', heroDescription: 'Кроссовки' };
    const prompt = buildWizardPrompt(state, { name: 'Магазин-AD' }, catalogForPrompt(PRODUCTS, []));
    expect(prompt).toContain('Акцент в каталоге: кроссовки — 50 TJS, очки — 100 TJS.');
  });
});
