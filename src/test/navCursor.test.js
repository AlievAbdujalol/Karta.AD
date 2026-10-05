import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_NAV_SETTINGS,
  readNavSettings,
  pickNavSettings,
  cursorIconFor,
  customCursorHtml,
} from '@/lib/navCursor';

describe('navCursor — настройки навигатора', () => {
  beforeEach(() => localStorage.clear());

  it('readNavSettings: пустой localStorage → дефолты', () => {
    expect(readNavSettings()).toEqual(DEFAULT_NAV_SETTINGS);
  });

  it('readNavSettings: битый JSON → дефолты, не падает', () => {
    localStorage.setItem('karta_nav_settings', '{oops');
    expect(readNavSettings()).toEqual(DEFAULT_NAV_SETTINGS);
  });

  it('readNavSettings: сохранённые значения сливаются поверх дефолтов', () => {
    localStorage.setItem('karta_nav_settings', JSON.stringify({ cursor_style: 'kamaz', voice_enabled: false }));
    const s = readNavSettings();
    expect(s.cursor_style).toBe('kamaz');
    expect(s.voice_enabled).toBe(false);
    expect(s.night_mode).toBe('auto'); // дефолт не затирается
  });

  it('pickNavSettings: остаются только колонки navigation_settings', () => {
    // раньше voice_uri (несуществующая колонка) ронял upsert целиком
    const out = pickNavSettings({ cursor_style: 'kamaz', voice_uri: 'x', user_id: 'other', bogus: 1 });
    expect(out).toEqual({ cursor_style: 'kamaz', voice_uri: 'x' });
  });

  it('pickNavSettings: user_id/updated_at не проходят (их ставит вызывающий код)', () => {
    const out = pickNavSettings({ user_id: 'u1', updated_at: 't', auto_scale: false });
    expect(out).toEqual({ auto_scale: false });
  });
});

describe('navCursor — курсор на карте', () => {
  it('иконки доступных курсоров', () => {
    expect(cursorIconFor('kamaz')).toBe('🚚');
    expect(cursorIconFor('love_car')).toBe('❤️');
    expect(cursorIconFor('monster')).toBe('🚜');
  });

  it('классика и legacy-значение "car" → null, карта рисует штатную стрелку', () => {
    expect(cursorIconFor('classic')).toBeNull();
    expect(cursorIconFor('car')).toBeNull();
    expect(customCursorHtml({ style: 'classic' })).toBeNull();
    expect(customCursorHtml({ style: 'car' })).toBeNull();
  });

  it('эмодзи-курсор: иконка, поворот за курсом и контр-поворот содержимого', () => {
    const c = customCursorHtml({ style: 'kamaz', rot: 45 });
    expect(c.size).toBe(46);
    expect(c.html).toContain('🚚');
    expect(c.html).toContain('rotate(45deg)');   // контейнер за курсом
    expect(c.html).toContain('rotate(-45deg)');  // эмодзи остаётся вертикальным
    expect(c.html).toContain('<svg');            // стрелка-указатель направления
  });

  it('photo-курсор: аватарка в кружке', () => {
    const c = customCursorHtml({ style: 'photo', photoUrl: 'https://x/p.png', rot: 90 });
    expect(c.html).toContain('<img');
    expect(c.html).toContain('https://x/p.png');
  });

  it('photo без фото профиля → 👤', () => {
    const c = customCursorHtml({ style: 'photo' });
    expect(c.html).toContain('👤');
  });

  it('URL фото экранируется — атрибут не разорвётся (XSS)', () => {
    const c = customCursorHtml({ style: 'photo', photoUrl: '" onerror="alert(1)' });
    expect(c.html).toContain('&quot;');
    expect(c.html).not.toMatch(/onerror="/);
  });

  it('showPointer=false — стрелки-указателя нет', () => {
    const c = customCursorHtml({ style: 'ghost', showPointer: false });
    expect(c.html).not.toContain('<svg');
    expect(c.html).toContain('👻');
  });
});
