/**
 * Порядок зеркал Overpass закреплён замерами из браузера (см. lib/overpass.js):
 * официальное зеркало обязано быть первым — упавший kumi впереди давал
 * пару CORS-ошибок в консоли на каждый новый тайл карты.
 */
import { describe, it, expect } from 'vitest';
import { OVERPASS_URLS } from '../lib/overpass';

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
