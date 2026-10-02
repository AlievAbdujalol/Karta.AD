import { describe, it, expect } from 'vitest';
import {
  validateStructure,
  extractSiteJson,
  compileSite,
  SECTION_TYPES,
} from '../lib/siteBuilder';

const good = {
  site: {
    name: 'Магазин',
    description: 'Торты',
    theme: { primary: '#ff0000', dark: false },
    pages: [{
      name: 'Home',
      sections: [
        { type: 'hero', title: 'Торты', description: 'Вкусно', buttons: ['Заказать'] },
        { type: 'products', title: 'Каталог' },
        { type: 'contact', title: 'Контакты' },
        { type: 'nope', title: 'X' },
      ],
    }],
  },
};

describe('validateStructure', () => {
  it('чистит мусор и дефолты', () => {
    const v = validateStructure(good);
    expect(v.site.name).toBe('Магазин');
    expect(v.site.pages[0].sections.map((s) => s.type)).toEqual(['hero', 'products', 'contact', 'about']);
    expect(v.site.theme.primary).toBe('#ff0000');
  });
  it('битый primary и пустые pages', () => {
    const v = validateStructure({ site: { theme: { primary: 'red' }, pages: [] } });
    expect(v.site.theme.primary).toBe('#7c3aed');
    expect(v.site.pages.length).toBe(1);
  });
  it('null → fallback', () => {
    expect(validateStructure(null).site.pages[0].sections).toEqual([]);
  });
  it('режет лимиты', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ type: 'about', title: `t${i}` }));
    const v = validateStructure({ site: { pages: [{ name: 'H', sections: many }] } });
    expect(v.site.pages[0].sections.length).toBe(20);
  });
});

describe('extractSiteJson', () => {
  it('достаёт JSON из fences', () => {
    const raw = '```json\n{"site":{"name":"A","pages":[]}}\n```';
    expect(extractSiteJson(raw)?.site.name).toBe('A');
  });
  it('голый JSON', () => {
    expect(extractSiteJson('{"site":{"name":"B"}}')?.site.name).toBe('B');
  });
  it('мусор → null', () => {
    expect(extractSiteJson('Привет! Я помогу')).toBeNull();
    expect(extractSiteJson('')).toBeNull();
  });
});

describe('compileSite', () => {
  const biz = { name: 'Магазин AD', city: 'Худжанд', address: 'ул. Ленина 1', phone: '+992 00', products: [{ name: 'Торт', price: 50 }] };

  it('собирает полный HTML', () => {
    const html = compileSite(good, biz);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Торты');
    expect(html).toContain('Торт');
    expect(html).toContain('50 сом');
    expect(html).toContain('+992 00');
  });
  it('экранирует инъекции', () => {
    const evil = { site: { name: '<script>alert(1)</script>', pages: [{ name: 'H', sections: [] }] } };
    const html = compileSite(evil, {});
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;');
  });
  it('секции Karta-AD рендерятся', () => {
    const s = {
      site: {
        name: 'T', pages: [{
          name: 'H',
          sections: [{ type: 'delivery', title: '' }, { type: 'taxi', title: '' }, { type: 'map', title: '' }],
        }],
      },
    };
    const html = compileSite(s, biz);
    expect(html).toContain('Karta-AD');
    expect(html).toContain('ул. Ленина 1');
  });
  it('контакты: tel и WhatsApp из телефона', () => {
    const s = { site: { name: 'T', pages: [{ name: 'H', sections: [{ type: 'contact', title: 'К' }] }] } };
    const html = compileSite(s, { phone: '+992 92 606 42 00' });
    expect(html).toContain('tel:+992 92 606 42 00');
    expect(html).toContain('https://wa.me/992926064200');
    const noPhone = compileSite(s, {});
    expect(noPhone).not.toContain('wa.me');
  });
  it('фото секции рендерится и экранируется', () => {
    const s = { site: { name: 'T', pages: [{ name: 'H', sections: [{ type: 'hero', title: 'Hi', image: 'https://x/y.png' }] }] } };
    expect(compileSite(s, {})).toContain('<img class="pic" src="https://x/y.png"');
    const evil = { site: { name: 'T', pages: [{ name: 'H', sections: [{ type: 'about', title: 'A', image: '" onerror="alert(1)' }] }] } };
    const html = compileSite(evil, {});
    expect(html).not.toContain('" onerror="alert(1)');
    expect(html).toContain('&quot; onerror=&quot;alert(1)');
  });
  it('корзина: только с shop-конфигом', () => {
    const s = { site: { name: 'T', pages: [{ name: 'H', sections: [{ type: 'products', title: 'К' }] }] } };
    const biz = { id: 'b1', products: [{ id: 'p1', name: 'Торт', price: 50 }] };
    const withShop = compileSite(s, biz, { supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', preview: true });
    expect(withShop).toContain('id="cartbar"');
    expect(withShop).toContain('+ В корзину');
    expect(withShop).toContain('Демо-режим');
    const plain = compileSite(s, biz);
    expect(plain).not.toContain('data-i="0"');
    expect(plain).not.toContain('id="cartbar"');
    expect(plain).toContain('Торт');
  });
  it('покрыты все типы секций', () => {
    const s = { site: { name: 'T', pages: [{ name: 'H', sections: SECTION_TYPES.map((type) => ({ type, title: type })) }] } };
    const html = compileSite(s, biz);
    for (const t of SECTION_TYPES) expect(html).toContain(t);
  });
});
