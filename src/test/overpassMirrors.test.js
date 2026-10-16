/**
 * Порядок зеркал Overpass закреплён живыми замерами (см. lib/overpass.js):
 * официальное зеркало обязано быть первым — упавший kumi впереди давал
 * пару CORS-ошибок в консоли на каждый новый тайл карты.
 */
import { describe, it, expect } from 'vitest';
import { OVERPASS_URLS, overpassEndpoints, OVERPASS_PROXY_PATH } from '../lib/overpass';

describe('OVERPASS_URLS', () => {
  it('официальное зеркало первым', () => {
    expect(OVERPASS_URLS[0]).toBe('https://overpass-api.de/api/interpreter');
  });

  it('таймаутное openstreetmap.ru только последним', () => {
    expect(OVERPASS_URLS[OVERPASS_URLS.length - 1]).toBe('https://overpass.openstreetmap.ru/api/interpreter');
  });

  it('без дублей', () => {
    expect(new Set(OVERPASS_URLS).size).toBe(OVERPASS_URLS.length);
  });
});

describe('overpassEndpoints', () => {
  it('в проде первым идёт свой прокси, затем прямые зеркала', () => {
    const eps = overpassEndpoints(true);
    expect(eps[0]).toBe(OVERPASS_PROXY_PATH);
    expect(eps[0]).toBe('/api/overpass');
    expect(eps.slice(1)).toEqual(OVERPASS_URLS);
  });

  it('в dev — только прямые зеркала (Vite /api-функции не обслуживает)', () => {
    expect(overpassEndpoints(false)).toEqual(OVERPASS_URLS);
  });

  it('безусловный вызов в тестовой среде (PROD=false) — без прокси', () => {
    expect(overpassEndpoints()).toEqual(OVERPASS_URLS);
  });
});
