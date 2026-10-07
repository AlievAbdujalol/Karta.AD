import { describe, it, expect } from 'vitest';
import { SITE_THEMES, getTheme, toStructureTheme, DEFAULT_THEME_ID } from '../lib/siteThemes';

describe('siteThemes', () => {
  it('ровно 8 пресетов, id совпадают с CHECK website_settings_style_check', () => {
    expect(SITE_THEMES).toHaveLength(8);
    const allowed = ['minimal', 'modern', 'luxury', 'dark', 'street', 'fashion', 'glass', 'ai'];
    expect(SITE_THEMES.map((t) => t.id).sort()).toEqual([...allowed].sort());
  });

  it('каждый пресет непустой: label, description, primary, gradient, font', () => {
    for (const t of SITE_THEMES) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.primary).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.gradient).toContain('linear-gradient');
      expect(t.font.length).toBeGreaterThan(0);
      expect(typeof t.dark).toBe('boolean');
    }
  });

  it('getTheme: известный id → свой пресет, неизвестный → дефолтный', () => {
    expect(getTheme('glass').id).toBe('glass');
    expect(getTheme('no-such-style').id).toBe(DEFAULT_THEME_ID);
    expect(getTheme(undefined).id).toBe(DEFAULT_THEME_ID);
    expect(getTheme(null).id).toBe(DEFAULT_THEME_ID);
  });

  it('toStructureTheme отдаёт { primary, dark } для compileSite', () => {
    expect(toStructureTheme('ai')).toEqual({ primary: '#34d399', dark: true });
    expect(toStructureTheme('minimal')).toEqual({ primary: '#111827', dark: false });
    expect(toStructureTheme('мусор')).toEqual(toStructureTheme(DEFAULT_THEME_ID));
  });
});
