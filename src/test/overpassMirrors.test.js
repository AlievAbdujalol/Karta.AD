/**
 * Порядок зеркал Overpass закреплён живыми замерами (см. lib/overpass.js):
 * первым — самое быстрое живое зеркало (fr отвечает за ~0.7 с), официальное
 * api.de идёт вторым, потому что с egress Vercel стабильно уходит в таймаут 5 с.
 * Клиент в проде ходит только на свой прокси: прямые зеркала режутся CORS.
 */
import { describe, it, expect } from 'vitest';
import { OVERPASS_URLS, overpassEndpoints, OVERPASS_PROXY_PATH } from '../lib/overpass';

describe('OVERPASS_URLS', () => {
  it('быстрое живое зеркало первым', () => {
    expect(OVERPASS_URLS[0]).toBe('https://overpass.openstreetmap.fr/api/interpreter');
  });

  it('официальное зеркало в списке, но не первым', () => {
    expect(OVERPASS_URLS).toContain('https://overpass-api.de/api/interpreter');
    expect(OVERPASS_URLS[0]).not.toBe('https://overpass-api.de/api/interpreter');
  });

  it('таймаутное openstreetmap.ru только последним', () => {
    expect(OVERPASS_URLS[OVERPASS_URLS.length - 1]).toBe('https://overpass.openstreetmap.ru/api/interpreter');
  });

  it('без дублей', () => {
    expect(new Set(OVERPASS_URLS).size).toBe(OVERPASS_URLS.length);
  });
});

describe('overpassEndpoints', () => {
  it('в проде только свой прокси — без кросс-доменных зеркал', () => {
    const eps = overpassEndpoints(true);
    expect(eps).toEqual([OVERPASS_PROXY_PATH]);
    expect(eps[0]).toBe('/api/overpass');
  });

  it('в dev — только прямые зеркала (Vite /api-функции не обслуживает)', () => {
    expect(overpassEndpoints(false)).toEqual(OVERPASS_URLS);
  });

  it('безусловный вызов в тестовой среде (PROD=false) — без прокси', () => {
    expect(overpassEndpoints()).toEqual(OVERPASS_URLS);
  });
});

