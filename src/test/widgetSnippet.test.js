import { describe, it, expect } from 'vitest';
import { buildWidgetSnippet, buildAnchorHints } from '../lib/widgetSnippet';

const BIZ = '3c565078-140c-4d95-b9d3-bf478a108404';

describe('buildWidgetSnippet', () => {
  it('одна строка: script с data-business и defer', () => {
    const s = buildWidgetSnippet(BIZ, 'https://karta-ad.vercel.app');
    expect(s).toBe(
      '<script src="https://karta-ad.vercel.app/widget.js" data-business="3c565078-140c-4d95-b9d3-bf478a108404" defer></script>',
    );
  });

  it('хвостовой слэш в origin убирается', () => {
    const s = buildWidgetSnippet(BIZ, 'https://x.app/');
    expect(s).toContain('src="https://x.app/widget.js"');
    expect(s).not.toContain('//widget.js');
  });

  it('id с кавычками и скобками не ломает разметку', () => {
    const s = buildWidgetSnippet('"><script>alert(1)</script>', 'https://x.app');
    expect(s).not.toContain('"><script>alert');
    expect(s).toContain('&quot;');
  });

  it('битый origin → null (нельзя собрать валидный сниппет)', () => {
    expect(buildWidgetSnippet(BIZ, '')).toBeNull();
    expect(buildWidgetSnippet('', 'https://x.app')).toBeNull();
    expect(buildWidgetSnippet(BIZ, 'javascript:alert(1)')).toBeNull();
  });

  it('опция data-lang добавляет атрибут', () => {
    const s = buildWidgetSnippet(BIZ, 'https://x.app', { lang: 'tg' });
    expect(s).toContain('data-lang="tg"');
  });
});

describe('buildAnchorHints', () => {
  it('показывает все три якоря', () => {
    const h = buildAnchorHints();
    expect(h).toContain('data-karta="catalog"');
    expect(h).toContain('data-karta="cart"');
    expect(h).toContain('data-karta="checkout"');
  });
});
