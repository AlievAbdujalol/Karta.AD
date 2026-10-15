import { describe, it, expect } from 'vitest';
import { compileSite } from '../lib/siteBuilder';
import { pickDeepLinkResult } from '../lib/searchUtils';

// «Кнопка должна открывать карту-AD»: секция map раньше вела на
// openstreetmap.org — наружу. Теперь кнопка ведёт на карту Karta-AD
// (appOrigin, новая вкладка — сайт живёт в sandbox-iframe с origin null),
// а главная карта умеет принимать ?q=адрес и показывать место.
describe('кнопка «Открыть карту» ведёт в карту Karta-AD', () => {
  const section = { site: { name: 'T', pages: [{ name: 'H', sections: [{ type: 'map' }] }] } };
  const biz = { name: 'Magazin-AD', address: 'Хучанд, ул. Рудаки 68' };

  it('с appOrigin — ссылка на карту Karta-AD с адресом бизнеса, в новой вкладке', () => {
    const h = compileSite(section, biz, { appOrigin: 'https://karta-ad.vercel.app' });
    expect(h).toContain(`https://karta-ad.vercel.app/?q=${encodeURIComponent(biz.address)}`);
    expect(h).toContain('target="_blank"');
    expect(h).not.toContain('openstreetmap.org/search');
  });

  it('без appOrigin — запасной openstreetmap (сайт вне контекста приложения)', () => {
    const h = compileSite(section, biz, {});
    expect(h).toContain(`openstreetmap.org/search?query=${encodeURIComponent(biz.address)}`);
  });

  it('без адреса бизнеса — используется название, спецсимволы закодированы', () => {
    const h = compileSite(section, { name: 'Кв. "Заря" 5', address: '' }, { appOrigin: 'https://a.example' });
    expect(h).toContain(`https://a.example/?q=${encodeURIComponent('Кв. "Заря" 5')}`);
  });
});

describe('pickDeepLinkResult — что карта показывает по ?q=', () => {
  it('предпочитает адрес или место с координатами, а не маршрут/остановку', () => {
    const res = {
      routes: [{ _type: 'route', id: 1, lat: 38.5, lng: 68.7 }],
      stops: [{ _type: 'stop', lat: 38.51, lng: 68.71 }],
      vehicles: [],
      addresses: [{ _type: 'address', lat: 38.559, lng: 68.773, name: 'Хучанд' }],
      pois: [],
    };
    expect(pickDeepLinkResult(res)?._type).toBe('address');
  });

  it('адресов нет — берёт любой результат с координатами', () => {
    const res = {
      routes: [{ _type: 'route', id: 1, lat: 1, lng: 2 }],
      stops: [], vehicles: [], addresses: [], pois: [],
    };
    expect(pickDeepLinkResult(res)?._type).toBe('route');
  });

  it('строчные координаты распознаются как валидные', () => {
    const res = { routes: [], stops: [], vehicles: [], addresses: [], pois: [{ _type: 'poi', lat: '38.5', lng: '68.7' }] };
    expect(pickDeepLinkResult(res)?._type).toBe('poi');
  });

  it('без координат и на пустом результате — null (ничего не показываем)', () => {
    expect(pickDeepLinkResult({ routes: [], stops: [], vehicles: [], addresses: [], pois: [] })).toBeNull();
    expect(pickDeepLinkResult({ routes: [{ _type: 'route', id: 1 }] })).toBeNull();
    expect(pickDeepLinkResult(null)).toBeNull();
    expect(pickDeepLinkResult(undefined)).toBeNull();
  });
});
