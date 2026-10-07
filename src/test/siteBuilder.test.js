import { describe, it, expect } from 'vitest';
import {
  validateStructure,
  extractSiteJson,
  compileSite,
  withKartaModules,
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

describe('ссылки модулей не ломают sandbox-превью', () => {
  const structure = () => withKartaModules({
    site: { name: 'Кафе', pages: [{ name: 'Home', sections: [{ type: 'hero', title: 'Кафе' }] }] },
  });

  it('такси: абсолютная ссылка в новой вкладке, когда передан адрес приложения', () => {
    const html = compileSite(structure(), { name: 'Кафе' }, { appOrigin: 'https://karta-ad.vercel.app' });
    expect(html).toContain('href="https://karta-ad.vercel.app/taxi"');
    expect(html).toContain('target="_blank"');
  });

  it('такси: без адреса приложения — никаких относительных ссылок', () => {
    const html = compileSite(structure(), { name: 'Кафе' });
    expect(html).not.toContain('href="/taxi"');
    expect(html).toContain('Такси Karta-AD');
  });

  it('доставка ведёт внутри документа (якорь), а не навигацией', () => {
    const s = withKartaModules(
      { site: { name: 'Кафе', pages: [{ name: 'Home', sections: [{ type: 'hero', title: 'Кафе' }] }] } },
      { products: [{ name: 'Пицца', price: 45 }] },
    );
    const html = compileSite(s, { name: 'Кафе', id: 'b1' }, {
      supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', preview: true,
      appOrigin: 'https://karta-ad.vercel.app',
    });
    expect(html).toContain('href="#checkout"');
    expect(html).not.toContain('target="_blank" rel="noreferrer">Оформить доставку');
  });
});

describe('auto modules are actionable', () => {
  const structure = () => withKartaModules({
    site: { name: 'Кафе', pages: [{ name: 'Home', sections: [{ type: 'hero', title: 'Кафе' }] }] },
  });

  it('такси без адреса приложения не даёт ссылок — только подсказка', () => {
    const html = compileSite(structure(), { name: 'Кафе' });
    expect(html).not.toContain('href="/taxi"');
    expect(html).toContain('Такси Karta-AD');
  });

  it('доставка получает кнопку оформления, когда есть каталог с корзиной', () => {
    const s = withKartaModules(
      { site: { name: 'Кафе', pages: [{ name: 'Home', sections: [{ type: 'hero', title: 'Кафе' }] }] } },
      { products: [{ name: 'Пицца', price: 45 }] },
    );
    const html = compileSite(s, { name: 'Кафе', id: 'b1' }, {
      supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', preview: true,
    });
    expect(html).toContain('Оформить доставку');
  });

  it('без телефона и каталога доставка не рисует пустых ссылок', () => {
    const html = compileSite(structure(), { name: 'Кафе' });
    expect(html).not.toContain('href="tel:"');
    expect(html).toContain('Доставка Karta-AD');
  });
});

describe('withKartaModules', () => {
  const base = {
    site: {
      name: 'Магазин',
      theme: { primary: '#ff0000', dark: true },
      pages: [{
        name: 'Home',
        sections: [
          { type: 'hero', title: 'Магазин' },
          { type: 'features', title: 'Плюсы' },
        ],
      }],
    },
  };

  it('дописывает доставку, такси, контакты и карту автоматически', () => {
    const out = withKartaModules(base);
    expect(out.site.pages[0].sections.map((s) => s.type))
      .toEqual(['hero', 'features', 'delivery', 'taxi', 'contact', 'map']);
  });

  it('не дублирует модуль, который AI уже добавил', () => {
    const src = {
      site: {
        ...base.site,
        pages: [{ name: 'Home', sections: [{ type: 'hero', title: 'A' }, { type: 'delivery', title: 'Моя доставка' }] }],
      },
    };
    const out = withKartaModules(src);
    const deliveries = out.site.pages[0].sections.filter((s) => s.type === 'delivery');
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].title).toBe('Моя доставка'); // AI-вариант не трогаем
  });

  it('каталог добавляется только если у бизнеса есть товары', () => {
    expect(withKartaModules(base).site.pages[0].sections.some((s) => s.type === 'products')).toBe(false);
    const withProducts = withKartaModules(base, { products: [{ name: 'Телефон', price: 800 }] });
    expect(withProducts.site.pages[0].sections.some((s) => s.type === 'products')).toBe(true);
  });

  it('не трогает импортированный сайт (ручной HTML)', () => {
    const imported = { site: { ...base.site, imported: true, pages: [{ name: 'Home', sections: [{ type: 'hero', title: 'A' }] }] } };
    const out = withKartaModules(imported);
    expect(out.site.pages[0].sections).toHaveLength(1);
    expect(out.site.imported).toBe(true);
  });

  it('уважает лимит в 20 секций на страницу', () => {
    const many = {
      site: {
        ...base.site,
        pages: [{ name: 'Home', sections: Array.from({ length: 20 }, (_, i) => ({ type: 'features', title: `F${i}` })) }],
      },
    };
    expect(withKartaModules(many).site.pages[0].sections.length).toBeLessThanOrEqual(20);
  });

  it('не ломает остальную структуру и идемпотентен', () => {
    const once = withKartaModules(base);
    const twice = withKartaModules(once);
    expect(twice.site.pages[0].sections.map((s) => s.type))
      .toEqual(once.site.pages[0].sections.map((s) => s.type));
    expect(twice.site.theme.primary).toBe('#ff0000');
    expect(twice.site.name).toBe('Магазин');
  });

  it('пустая структура не падает — модули всё равно добавляются', () => {
    const out = withKartaModules({ site: { pages: [{ name: 'Home', sections: [] }] } });
    expect(out.site.pages[0].sections.map((s) => s.type)).toEqual(['delivery', 'taxi', 'contact', 'map']);
  });

  it('доставка и такси попадают в HTML без просьбы в промпте', () => {
    const structure = validateStructure({
      site: { name: 'Кафе', pages: [{ name: 'Home', sections: [{ type: 'hero', title: 'Кафе' }] }] },
    });
    const html = compileSite(withKartaModules(structure), { name: 'Кафе', address: 'Худжанд' });
    expect(html).toContain('Доставка Karta-AD');
    expect(html).toContain('Такси Karta-AD');
  });
});

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

describe('чекаут: адрес на карте и способ оплаты', () => {
  const s = { site: { name: 'T', pages: [{ name: 'H', sections: [{ type: 'products', title: 'К' }] }] } };
  const biz = { id: 'b1', products: [{ id: 'p1', name: 'Торт', price: 50 }] };
  const html = () => compileSite(s, biz, { supabaseUrl: 'https://x.supabase.co', anonKey: 'anon' });

  it('кнопка выбора адреса на карте и контейнер карты в форме заказа', () => {
    const h = html();
    expect(h).toContain('id="co_mapbtn"');
    expect(h).toContain('id="co_map"');
  });

  it('Leaflet подгружается лениво с unpkg (чужой хостинг не тащит наш бандл)', () => {
    expect(html()).toContain('unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    expect(html()).toContain('unpkg.com/leaflet@1.9.4/dist/leaflet.css');
  });

  it('заказ уходит через RPC: координаты в p_delivery, p_payment_method, без клиентских цен', () => {
    const h = html();
    expect(h).toContain('/rest/v1/rpc/create_store_order');
    expect(h).toContain('p_delivery');
    expect(h).toContain('lat:');
    expect(h).toContain('lng:');
    expect(h).toContain('p_payment_method');
    // прямой INSERT в orders больше не используется
    expect(h).not.toContain('/rest/v1/orders');
    expect(h).not.toContain('status: \'pending\'');
  });

  it('пин → обратное геокодирование Nominatim подставляет текст адреса', () => {
    expect(html()).toContain('nominatim.openstreetmap.org/reverse');
  });

  it('оплата: наличные выбраны, карта помечена disabled (шлюза нет)', () => {
    const h = html();
    expect(h).toContain('name="pm"');
    expect(h).toMatch(/name="pm" value="card" disabled/);
  });

  it('самовывоз не отправляет координаты доставки', () => {
    expect(html()).toContain("dtype === 'pickup'");
  });

  it('без shop-конфига карты в чекауте нет (как и корзины)', () => {
    expect(compileSite(s, biz)).not.toContain('id="co_mapbtn"');
  });
});
