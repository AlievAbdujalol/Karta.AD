import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const authGetUser = vi.hoisted(() => vi.fn(async () => ({ data: { user: { id: 'u1' } } })));
const profileFetch = vi.hoisted(() => vi.fn(async () => ({ data: { id: 'u1', full_name: 'Водитель', role: 'driver', driver_status: 'approved' } })));
const vehicleFilter = vi.hoisted(() => vi.fn(async () => [{ id: 'v1', vehicle_number: '113', route_id: 'r1', is_active: true }]));
const routeFilter = vi.hoisted(() => vi.fn(async () => [{ id: 'r1', number: 113, name: 'Хистеварс', stops: [
  { name: 'Остановка 1', lat: 40.28, lng: 69.62 },
  { name: 'Остановка 2', lat: 40.29, lng: 69.63 },
  { name: 'Остановка 3', lat: 40.30, lng: 69.64 },
] }]));
const scheduleFilter = vi.hoisted(() => vi.fn(async () => [{ id: 's1', route_id: 'r1', stops_schedule: [] }]));
const endTripMock = vi.hoisted(() => vi.fn(async () => {}));
const tripState = vi.hoisted(() => ({ isTracking: true }));

vi.mock('@/api/supabase', () => ({
  supabase: {
    auth: { getUser: authGetUser },
    from: vi.fn((table) => {
      if (table === 'profiles') return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: profileFetch })) })) };
      return {};
    }),
  },
}));
vi.mock('@/api/entities', () => ({
  Vehicle: { filter: vehicleFilter },
  Route: { filter: routeFilter },
  Schedule: { filter: scheduleFilter },
}));
vi.mock('@/lib/useLanguage', () => ({
  useLanguage: () => ({ t: (k) => k, lang: 'ru', setLang: () => {} }),
}));
// Мок TripContext: зелёный баннер «Рейс идёт» и его прекращение
vi.mock('@/lib/TripContext', () => ({
  useTrip: () => ({ isTracking: tripState.isTracking, endTrip: endTripMock }),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  tripState.isTracking = true;
  localStorage.removeItem('karta_route_start');
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem('karta_route_start');
});

import DriverSchedule from '../pages/DriverSchedule';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="path">{loc.pathname}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/driver-schedule']}>
      <LocationProbe />
      <DriverSchedule />
    </MemoryRouter>,
  );
}

describe('DriverSchedule — неплановый рейс', () => {
  it('по умолчанию старт с первой остановки — плановый, без жёлтого бейджа', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Остановка 1')).toBeInTheDocument());

    expect(screen.getByText('В пути')).toBeInTheDocument();
    expect(screen.queryByText('schedule.unscheduledBadge')).not.toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/driver-schedule');
    expect(endTripMock).not.toHaveBeenCalled();
  });

  it('старт со второй остановки — неплановый, жёлтый бейдж и баннер', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Остановка 1')).toBeInTheDocument());

    const buttons = await screen.findAllByText('schedule.startLabel');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(buttons[1]);

    // жёлтая маркировка появляется синхронно — до ухода на карту
    expect(screen.getAllByText('schedule.unscheduledBadge').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('schedule.unscheduledDesc').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('В пути')).toBeInTheDocument();

    // авто-рейс прерван, приложение уходит к остановке на карте
    await waitFor(() => expect(endTripMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/'));
  });
});

describe('DriverSchedule — «Старт» прерывает автоматический рейс', () => {
  it('кликом по «Старт» заканчиваем авто-рейс, сохраняем выбор и уходим на карту', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Остановка 1')).toBeInTheDocument());

    const buttons = await screen.findAllByText('schedule.startLabel');
    fireEvent.click(buttons[1]);

    // 1) автоматический рейс прерван
    await waitFor(() => expect(endTripMock).toHaveBeenCalledTimes(1));

    // 2) выбор стартовой остановки ушёл на карту
    await waitFor(() => {
      const raw = localStorage.getItem('karta_route_start');
      expect(raw).toBeTruthy();
      const pending = JSON.parse(raw);
      expect(pending.routeId).toBe('r1');
      expect(pending.stopIndex).toBe(1);
      expect(pending.stop).toMatchObject({ lat: 40.29, lng: 69.63 });
    });

    // 3) приложение перешло к карте
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/'));
  });

  it('выбираем третью остановку — индекс и координаты соответствуют ей', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Остановка 1')).toBeInTheDocument());

    const buttons = await screen.findAllByText('schedule.startLabel');
    fireEvent.click(buttons[2]);

    await waitFor(() => {
      const pending = JSON.parse(localStorage.getItem('karta_route_start'));
      expect(pending.stopIndex).toBe(2);
      expect(pending.stop).toMatchObject({ lat: 40.3, lng: 69.64, name: 'Остановка 3' });
    });
    expect(endTripMock).toHaveBeenCalledTimes(1);
  });

  it('когда авто-рейса нет — endTrip не вызываем, но выбор сохраняется', async () => {
    tripState.isTracking = false;
    renderPage();
    await waitFor(() => expect(screen.getByText('Остановка 1')).toBeInTheDocument());

    const buttons = await screen.findAllByText('schedule.startLabel');
    fireEvent.click(buttons[1]);

    await waitFor(() => {
      const pending = JSON.parse(localStorage.getItem('karta_route_start'));
      expect(pending.stopIndex).toBe(1);
    });
    expect(endTripMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/'));
  });
});
