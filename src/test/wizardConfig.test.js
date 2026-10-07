import { describe, it, expect } from 'vitest';
import {
  WIZARD_STEPS, SITE_TYPES, DELIVERY_MODES, PAYMENT_PROVIDERS,
  wizardDefaults, validateWizardStep, validateWizard, isWizardValid,
  wizardToSettings, buildWizardPrompt,
} from '../lib/wizardConfig';
import { SITE_THEMES } from '../lib/siteThemes';

const BIZ = { name: 'Магазин-AD', description: 'Спортивные товары' };

/** Полностью валидное состояние. */
const good = () => ({
  ...wizardDefaults(BIZ),
  siteType: 'clothing',
  style: 'luxury',
  heroTitle: 'Магазин-AD',
  heroDescription: 'Кроссовки и одежда в Душанбе',
  delivery: { enabled: true, mode: 'fixed', price: 15, minOrder: 100, radiusKm: 8 },
  payment: { cod: true, online: false, providers: ['cash', 'card'] },
  prompt: 'Хочу яркий баннер с акцией',
});

describe('wizardConfig: шаги и дефолты', () => {
  it('ровно 7 шагов, каждый с id/title/hint', () => {
    expect(WIZARD_STEPS).toHaveLength(7);
    for (const s of WIZARD_STEPS) {
      expect(s.id).toMatch(/^[a-z]+$/);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.hint.length).toBeGreaterThan(0);
    }
  });

  it('типы/стили/режимы доставки/способы оплаты — непустые списки с id', () => {
    expect(SITE_TYPES.length).toBeGreaterThanOrEqual(6);
    expect(SITE_TYPES.map((t) => t.id)).toContain('shop');
    expect(DELIVERY_MODES.map((m) => m.id)).toEqual(['fixed', 'free', 'distance']);
    expect(PAYMENT_PROVIDERS.map((p) => p.id)).toContain('cash');
    expect(SITE_THEMES.length).toBe(8);
  });

  it('wizardDefaults подхватывает имя/описание бизнеса и обрезает длинное', () => {
    const d = wizardDefaults({ name: 'N'.repeat(200), description: 'D'.repeat(500) });
    expect(d.heroTitle).toHaveLength(80);
    expect(d.heroDescription).toHaveLength(300);
    expect(d.siteType).toBe('shop');
    expect(d.payment.providers).toEqual(['cash']);
  });
});

describe('wizardConfig: валидация', () => {
  it('валидное состояние проходит все шаги', () => {
    expect(validateWizard(good())).toEqual({});
    expect(isWizardValid(good())).toBe(true);
  });

  it('шаг type/style: пустой выбор → ошибка', () => {
    expect(validateWizardStep('type', { siteType: 'zzz' })).toHaveLength(1);
    expect(validateWizardStep('style', { style: 'zzz' })).toHaveLength(1);
    expect(validateWizardStep('type', { siteType: 'shop' })).toEqual([]);
  });

  it('шаг info: без названия или описания — по одной ошибке', () => {
    const base = { heroTitle: '', heroDescription: '' };
    expect(validateWizardStep('info', base)).toHaveLength(2);
    expect(validateWizardStep('info', { heroTitle: 'X', heroDescription: '' })).toHaveLength(1);
    expect(validateWizardStep('info', { heroTitle: 'X', heroDescription: 'Y' })).toEqual([]);
  });

  it('шаг delivery: отрицительная цена/лимиты км — ошибки', () => {
    const s = { delivery: { enabled: true, mode: 'fixed', price: -1, minOrder: -5, radiusKm: 500 } };
    expect(validateWizardStep('delivery', s).length).toBe(3);
    const off = { delivery: { enabled: false } };
    expect(validateWizardStep('delivery', off)).toEqual([]);
    const dist = { delivery: { enabled: true, mode: 'distance', minOrder: 0, radiusKm: 10 } };
    expect(validateWizardStep('delivery', dist)).toEqual([]);
  });

  it('шаг payment: ни одного способа или неизвестный id — ошибки', () => {
    expect(validateWizardStep('payment', { payment: { cod: false, online: false, providers: [] } })).not.toEqual([]);
    expect(validateWizardStep('payment', { payment: { cod: true, online: false, providers: ['bitcoin'] } })).toHaveLength(1);
    expect(validateWizardStep('payment', { payment: { cod: true, online: false, providers: ['cash'] } })).toEqual([]);
  });

  it('шаг prompt: лимит 1000 символов', () => {
    expect(validateWizardStep('prompt', { prompt: 'x'.repeat(1001) })).toHaveLength(1);
    expect(validateWizardStep('prompt', { prompt: 'x'.repeat(1000) })).toEqual([]);
  });

  it('validateWizard собирает ошибки по шагам, невалидные — в ключах', () => {
    const bad = { ...good(), heroTitle: '', delivery: { enabled: true, mode: 'fixed', price: -1, minOrder: 0, radiusKm: 5 } };
    const res = validateWizard(bad);
    expect(Object.keys(res).sort()).toEqual(['delivery', 'info']);
    expect(isWizardValid(bad)).toBe(false);
  });
});

describe('wizardConfig: payload website_settings', () => {
  it('wizardToSettings маппит состояние в строку таблицы', () => {
    const row = wizardToSettings(good(), 'biz-1');
    expect(row).toMatchObject({
      business_id: 'biz-1',
      site_type: 'clothing',
      style: 'luxury',
      font: 'Playfair Display',
      hero_title: 'Магазин-AD',
      show_delivery: true,
      show_payment: true,
    });
    expect(row.delivery).toEqual({ enabled: true, mode: 'fixed', price: 15, min_order: 100, radius_km: 8 });
    expect(row.payment).toEqual({ cod: true, online: false, providers: ['cash', 'card'] });
    expect(row.prompt).toBe('Хочу яркий баннер с акцией');
  });

  it('доставка выключена → show_delivery=false, вложенный enabled=false', () => {
    const s = good();
    s.delivery = { enabled: false };
    const row = wizardToSettings(s, 'biz-1');
    expect(row.show_delivery).toBe(false);
    expect(row.delivery.enabled).toBe(false);
  });

  it('prompt обрезается до 1000', () => {
    const s = good();
    s.prompt = 'y'.repeat(1500);
    expect(wizardToSettings(s, 'b').prompt).toHaveLength(1000);
  });
});

describe('wizardConfig: промпт для AI', () => {
  it('содержит тип, название, стиль и пожелания', () => {
    const p = buildWizardPrompt(good(), BIZ);
    expect(p).toContain('одежда и обувь');
    expect(p).toContain('Магазин-AD');
    expect(p).toContain('Люкс');
    expect(p).toContain('яркий баннер');
    expect(p).toContain('каталог товаров');
  });

  it('без пожеланий — нет дубля «Пожелания:», пустое описание не ломает', () => {
    const s = good();
    s.prompt = '';
    s.heroTitle = '';
    s.heroDescription = '   ';
    const p = buildWizardPrompt(s, { name: 'X' });
    expect(p).not.toContain('Пожелания:');
    expect(p).not.toContain('О бизнесе:');
    expect(p).toContain('«X»');
  });

  it('выбранные товары попадают в промпт, пустой выбор — нет', () => {
    const p = buildWizardPrompt(good(), BIZ, ['Кроссовки', 'Куртка']);
    expect(p).toContain('Акцент в каталоге: Кроссовки, Куртка');
    const none = buildWizardPrompt(good(), BIZ, []);
    expect(none).not.toContain('Акцент в каталоге');
  });
});
