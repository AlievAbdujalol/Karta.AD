import { describe, it, expect } from 'vitest';
import { calcPrice, ridePrice, MAX_RIDE_PRICE_TJS } from '@/lib/taxi';

// Потолок стоимости поездки: пользователь запросил «снизить стоимость до 50 TJS».
describe('Потолок цены поездки MAX_RIDE_PRICE_TJS', () => {
  it('потолок = 50 TJS', () => {
    expect(MAX_RIDE_PRICE_TJS).toBe(50);
  });

  it('долгая поездка с ночью и высоким спросом = ровно 50', () => {
    const price = calcPrice({
      distanceKm: 120, durationMin: 240, category: 'business', demandCoef: 2, night: true,
    });
    expect(price).toBe(MAX_RIDE_PRICE_TJS);
  });

  it('межгород НЕ попадает под потолок — считается по расстоянию', () => {
    // 40 + 2.2*300 + 0.5*320 = 860 — межгород (Душанбе→Худжанд) не может
    // стоить 50 TJS; потолок действует только на городские поездки
    expect(calcPrice({ distanceKm: 300, durationMin: 320, category: 'intercity' })).toBe(860);
  });

  it('доставка и курьер НЕ попадают под потолок', () => {
    // delivery: 4 + 1.8*100 + 0.3*200 = 244
    expect(calcPrice({ distanceKm: 100, durationMin: 200, category: 'delivery' })).toBe(244);
    // courier: 5 + 2.0*80 + 0.3*160 = 213
    expect(calcPrice({ distanceKm: 80, durationMin: 160, category: 'courier' })).toBe(213);
  });

  it('короткая городская поездка не подорожала (снижение, а не фикс-цена)', () => {
    // economy: 5 + 1.5*5 + 0.3*15 = 17 — остаётся прежней
    expect(calcPrice({ distanceKm: 5, durationMin: 15, category: 'economy' })).toBe(17);
  });

  it('ridePrice: доплаты за опции не пробивают потолок', () => {
    const price = ridePrice({
      distanceKm: 120, durationMin: 240, category: 'economy',
      extras: { childSeat: true, pets: true, luggage: true },
      demandCoef: 2, night: true,
    });
    expect(price).toBe(50);
  });

  it('ridePrice: короткая поездка с доплатами считается как раньше', () => {
    // 17 (база) + 3 (детское кресло) = 20
    expect(ridePrice({ distanceKm: 5, durationMin: 15, category: 'economy', extras: { childSeat: true } })).toBe(20);
  });

  it('ridePrice: межгород с доплатой «туда-обратно» не ограничен потолком', () => {
    // 860 (база) + 180 (0.6*300 обратно) = 1040
    const price = ridePrice({
      distanceKm: 300, durationMin: 320, category: 'intercity',
      extras: { returnTrip: true }, baseDistance: 300,
    });
    expect(price).toBe(1040);
  });
});
