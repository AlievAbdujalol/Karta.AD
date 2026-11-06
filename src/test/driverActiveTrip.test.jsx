import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const tripState = vi.hoisted(() => ({
  isTracking: true,
  gpsInfo: { speed: 18, lat: 40.285, lng: 69.625 },
  activeRoute: {
    id: 'r1',
    number: 113,
    name: 'Хистеварс',
    stops: [
      { name: 'Остановка 1', lat: 40.28, lng: 69.62 },
      { name: 'Остановка 2', lat: 40.29, lng: 69.63 },
      { name: 'Остановка 3', lat: 40.30, lng: 69.64 },
    ],
  },
  vehicleNumber: '113',
  tripStartedAt: Date.now() - 600_000,
}));
const endTripMock = vi.hoisted(() => vi.fn(async () => {}));
const currentUser = vi.hoisted(() => ({
  user: { id: 'd1', role: 'driver', driver_status: 'approved' },
  loading: false,
}));
const scheduleFilter = vi.hoisted(() => vi.fn(async () => [{
  id: 's1',
  route_id: 'r1',
  stops_schedule: [
    { stop_index: 0, stop_name: 'Остановка 1', times: ['12:16'] },
    { stop_index: 1, stop_name: 'Остановка 2', times: ['12:19'] },
    { stop_index: 2, stop_name: 'Остановка 3', times: ['12:25'] },
  ],
}]));
const vehiclesQuery = vi.hoisted(() => vi.fn(async () => ({ data: [], error: null })));

vi.mock('@/lib/useLanguage', () => ({
  useLanguage: () => ({ t: (k) => k, lang: 'ru', setLang: () => {} }),
}));
vi.mock('@/lib/useCurrentUser', () => ({
  useCurrentUser: () => currentUser,
}));
vi.mock('@/lib/TripContext', () => ({
  useTrip: () => ({ ...tripState, endTrip: endTripMock }),
}));
vi.mock('@/api/entities', () => ({
  Schedule: { filter: scheduleFilter },
}));
vi.mock('@/api/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: vehiclesQuery }) }) }) },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
// Карта без настоящего leaflet: рендерим детей как есть
vi.mock('@/components/driver/ActiveTripMap', () => ({
  default: ({ route }) => <div data-testid="map-stub">{route?.number}</div>,
}));

import DriverActiveTrip from '@/pages/DriverActiveTrip';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="path">{loc.pathname}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/driver-active-trip']}>
      <LocationProbe />
      <DriverActiveTrip />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  tripState.isTracking = true;
  currentUser.user = { id: 'd1', role: 'driver', driver_status: 'approved' };
  currentUser.loading = false;
  localStorage.removeItem('karta_trip_distance');
});

afterEach(() => {
  cleanup();
  localStorage.removeItem('karta_trip_distance');
});

describe('DriverActiveTrip — основной экран рейса', () => {
  it('показывает карту, текущую и следующую остановки, статистику и кнопку завершения', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId('map-stub')).toHaveTextContent('113'));
    expect(screen.getByTestId('current-stop')).toHaveTextContent('Остановка 1');
    // время отправления из расписания; после 12:16 в расписании рейсов больше нет
    const dep = screen.getByTestId('departure-time').textContent;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    expect(dep).toBe(nowMin <= 12 * 60 + 16 ? '12:16' : '—');
    expect(screen.getByTestId('next-stop')).toHaveTextContent('Остановка 2');
    expect(screen.getByTestId('next-stop-dist')).toHaveTextContent('м');
    // время прибытия по расписанию или динамический ETA — но не пусто
    expect(screen.getByTestId('next-stop-eta').textContent.length).toBeGreaterThan(0);
    expect(screen.getByTestId('trip-stats')).toBeInTheDocument();
    expect(screen.getByTestId('end-trip')).toBeInTheDocument();
  });

  it('последующие остановки маршрута показаны после следующей', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('map-stub')).toBeInTheDocument());
    expect(screen.getByText('activeTrip.upcomingStops')).toBeInTheDocument();
    expect(screen.getByText('Остановка 3')).toBeInTheDocument();
  });

  it('статистика: время из tripStartedAt, остановки и скорость из GPS', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('trip-stats')).toBeInTheDocument());
    const stats = screen.getByTestId('trip-stats').textContent;
    expect(stats).toContain('activeTrip.km'); // км в пути есть
    expect(stats).toContain('0:10'); // 600 сек = 10 минут в пути (h:mm)
    expect(stats).toContain('1 / 3'); // GPS между 1-й и 2-й остановкой — первая пройдена
    expect(stats).toContain('18'); // скорость из gpsInfo
  });

  it('кнопка «Завершить рейс» вызывает endTrip и уходит в расписание', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('end-trip')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('end-trip'));

    await waitFor(() => expect(endTripMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/driver-schedule'));
  });

  it('двойной тап по «Завершить рейс» вызывает endTrip только один раз', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('end-trip')).toBeInTheDocument());

    const btn = screen.getByTestId('end-trip');
    fireEvent.click(btn);
    fireEvent.click(btn);

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/driver-schedule'));
    expect(endTripMock).toHaveBeenCalledTimes(1);
  });
});

describe('DriverActiveTrip — ближайшие машины только из живого GPS', () => {
  it('без машин на маршруте — пустое состояние без выдуманных чисел', async () => {
    vehiclesQuery.mockResolvedValueOnce({ data: [], error: null });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('nearest-buses-empty')).toBeInTheDocument());
    expect(screen.queryByTestId(/^nearest-bus-/)).not.toBeInTheDocument();
  });

  it('живая машина того же маршрута попадает в список с расстоянием', async () => {
    vehiclesQuery.mockResolvedValueOnce({
      data: [{
        id: 'v2',
        driver_id: 'd2',
        driver_name: 'Другой водитель',
        vehicle_number: '114',
        route_id: 'r1',
        is_active: true,
        lat: 40.29,
        lng: 69.63,
        speed: 12,
        last_updated: new Date().toISOString(),
      }],
      error: null,
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('nearest-bus-v2')).toBeInTheDocument());
    expect(screen.getByTestId('nearest-bus-v2').textContent).toContain('114');
    expect(screen.getByTestId('nearest-bus-v2').textContent).toContain('Другой водитель');
    // расстояние и ETA рассчитаны динамически
    expect(screen.getByTestId('nearest-bus-v2').textContent).toMatch(/м|км/);
  });

  it('устаревший GPS другой машины не показывается (isVehicleLive)', async () => {
    vehiclesQuery.mockResolvedValueOnce({
      data: [{
        id: 'v3',
        driver_id: 'd3',
        vehicle_number: '115',
        route_id: 'r1',
        is_active: true,
        lat: 40.29,
        lng: 69.63,
        speed: 10,
        last_updated: new Date(Date.now() - 600_000).toISOString(), // 10 мин назад
      }],
      error: null,
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('nearest-buses-empty')).toBeInTheDocument());
    expect(screen.queryByTestId('nearest-bus-v3')).not.toBeInTheDocument();
  });
});

describe('DriverActiveTrip — гейты', () => {
  it('без роли водителя — заглушка «Нет доступа»', async () => {
    currentUser.user = { id: 'u1', role: 'passenger', driver_status: 'pending' };
    renderPage();
    await waitFor(() => expect(screen.getByText('schedule.accessDenied')).toBeInTheDocument());
    expect(screen.queryByTestId('end-trip')).not.toBeInTheDocument();
  });

  it('когда рейс не идёт — заглушка с ссылкой на расписание', async () => {
    tripState.isTracking = false;
    renderPage();
    await waitFor(() => expect(screen.getByText('schedule.noActiveTrip')).toBeInTheDocument());
    expect(screen.getByText('nav.schedule').closest('a')).toHaveAttribute('href', '/driver-schedule');
    expect(endTripMock).not.toHaveBeenCalled();
  });
});
