/**
 * Регрессия MAJOR из код-ревью: водитель подтвердил отправление, стоя на
 * остановке (≥2 GPS-фиксов). Панель не должна засчитать ложное прибытие
 * на СЛЕДУЮЩУЮ остановку, пока машина физически не подъедет к ней, —
 * машина состояний питается дистанцией к обслуживаемой остановке,
 * а не к progress.nextStop (который сразу после отправления = 0 м).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/useLanguage', () => ({
  useLanguage: () => ({ t: (k) => k, lang: 'ru', setLang: () => {} }),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { toast } from 'sonner';
import TripProgressPanel from '@/components/driver/TripProgressPanel';

const STOPS = [
  { name: 'А', lat: 40.1000, lng: 69.2000 },
  { name: 'Б', lat: 40.1090, lng: 69.2000 },
  { name: 'В', lat: 40.1180, lng: 69.2000 },
];

const panel = (gps) => (
  <MemoryRouter>
    <TripProgressPanel route={{ id: 'r1', number: 5, stops: STOPS }} gpsInfo={gps} tripStartedAt={Date.now() - 60_000} />
  </MemoryRouter>
);

const atStopB = { lat: 40.1090, lng: 69.2000, speed: 0 };
// соседние фиксы у той же остановки — каждый новый объект даёт новый прогресс
// и запускает следующий «GPS-замер» машины состояний
const atStopB2 = { lat: 40.10905, lng: 69.2000, speed: 0 };
const atStopB3 = { lat: 40.10910, lng: 69.2000, speed: 0 };
const atStopB4 = { lat: 40.10915, lng: 69.2000, speed: 0 };

describe('TripProgressPanel — ложное прибытие после ручного отправления', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('после «Подтвердить отправление» стоя на остановке — «В» не засчитывается', () => {
    // Фикс 1: машина на остановке Б — прибытие ещё не подтверждено (нужен 2-й замер)
    const { rerender } = render(panel(atStopB));
    expect(screen.getByTestId('trip-phase').textContent).toBe('trip.phasePending');

    // Фикс 2: прибытие на Б зафиксировано авто
    rerender(panel(atStopB2));
    expect(screen.getByTestId('trip-phase').textContent).toBe('trip.phaseArriving');

    // Водитель подтверждает отправление, всё ещё стоя на Б
    fireEvent.click(screen.getByText('trip.confirmDeparture'));
    expect(toast.success).toHaveBeenCalledWith('trip.autoDeparted: Б');

    // Фиксы 3–4: машина всё ещё рядом с Б — ложное прибытие на В не должно
    // появиться, пока дистанция до В больше радиуса прибытия
    rerender(panel(atStopB3));
    rerender(panel(atStopB4));

    // В журнале только Б (с отправлением), «3. В» нет
    expect(screen.queryByText(/^3\. В$/)).toBeNull();
    expect(screen.getByText(/^2\. Б$/)).toBeInTheDocument();

    // Ни одно авто-уведомление не названо В
    for (const call of toast.success.mock.calls) {
      expect(String(call[0])).not.toContain('В');
    }

    // Следующая остановка впереди, фаза — предстоит (прибытие не наступало)
    expect(screen.getByTestId('trip-phase').textContent).toBe('trip.phasePending');
    expect(screen.getByTestId('trip-next-stop').textContent).toBe('В');
  });
});
