import { describe, it, expect } from 'vitest';
import { reverseGeocodeUrl, pickAddressText } from '../lib/geo';

describe('reverseGeocodeUrl', () => {
  it('собирает URL Nominatim в формате jsonv2', () => {
    const url = reverseGeocodeUrl(38.559, 68.786);
    expect(url).toContain('nominatim.openstreetmap.org/reverse');
    expect(url).toContain('format=jsonv2');
    expect(url).toContain('lat=38.559');
    expect(url).toContain('lon=68.786');
    expect(url).toContain('accept-language=ru');
  });

  it('не делает запрос для нечисловых координат', () => {
    expect(reverseGeocodeUrl(NaN, 68.7)).toBeNull();
    expect(reverseGeocodeUrl(38.5, undefined)).toBeNull();
    expect(reverseGeocodeUrl(null, null)).toBeNull();
  });

  it('координаты не дублируют лишние знаки (stabilный URL)', () => {
    expect(reverseGeocodeUrl(38.559123456, 68.786987654))
      .toContain('lat=38.559123');
  });
});

describe('pickAddressText', () => {
  it('берёт display_name из ответа', () => {
    expect(pickAddressText({ display_name: 'Худжанд, проспект Рудаки' }))
      .toBe('Худжанд, проспект Рудаки');
  });

  it('пустой ответ → fallback (введённый текст адреса)', () => {
    expect(pickAddressText(null, 'пр. Рудаки 1')).toBe('пр. Рудаки 1');
    expect(pickAddressText({}, 'пр. Рудаки 1')).toBe('пр. Рудаки 1');
    expect(pickAddressText({ display_name: '   ' }, 'адрес')).toBe('адрес');
  });

  it('без fallback — пустая строка, не undefined', () => {
    expect(pickAddressText(null)).toBe('');
  });
});
