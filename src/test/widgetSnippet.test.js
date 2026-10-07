import { describe, it, expect } from 'vitest';
import {
  buildWidgetSnippet, buildAnchorHints,
  canonicalOrigin, normalizeWidgetUrls, PUBLIC_ORIGIN,
} from '../lib/widgetSnippet';

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

describe('canonicalOrigin / normalizeWidgetUrls', () => {
  it('на dev-окружении возвращает публичный origin, а не localhost', () => {
    // jsdom-тесты бегут на http://localhost — ровно тот случай
    expect(canonicalOrigin()).toBe(PUBLIC_ORIGIN);
  });

  it('переписывает http://localhost…/widget.js на канонический адрес', () => {
    const html = '<script src="http://localhost:5173/widget.js" data-business="x" defer></script>';
    const out = normalizeWidgetUrls(html);
    expect(out).toContain(`src="${PUBLIC_ORIGIN}/widget.js"`);
    expect(out).not.toContain('localhost');
    expect(out).toContain('data-business="x"');
  });

  it('переписывает относительный /widget.js (srcdoc с origin null)', () => {
    const out = normalizeWidgetUrls('<script src="/widget.js" defer></script>');
    expect(out).toBe(`<script src="${PUBLIC_ORIGIN}/widget.js" defer></script>`);
  });

  it('явный origin перекрывает дефолт', () => {
    const out = normalizeWidgetUrls('<script src="https://old.app/widget.js"></script>', 'https://new.app');
    expect(out).toBe('<script src="https://new.app/widget.js"></script>');
  });

  it('чужие script-теги и атрибуты не трогает', () => {
    const html = '<script src="https://cdn.example.com/app.js"></script><script src="https://x/widget.js?v=2"></script>';
    const out = normalizeWidgetUrls(html, 'https://new.app');
    expect(out).toContain('https://cdn.example.com/app.js');
    // query после widget.js не матчится — ссылка остаётся исходной, не ломается
    expect(out).toContain('https://x/widget.js?v=2');
  });

  it('null и пустая строка возвращаются как есть', () => {
    expect(normalizeWidgetUrls(null)).toBe(null);
    expect(normalizeWidgetUrls('')).toBe('');
  });
});
