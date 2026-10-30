import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const authGetUser = vi.hoisted(() => vi.fn(async () => ({ data: { user: { id: 'u1' } } })));
const profileFetch = vi.hoisted(() => vi.fn(async () => ({ data: { id: 'u1', full_name: 'Водитель', role: 'driver', driver_status: 'approved' } })));
const vehicleFilter = vi.hoisted(() => vi.fn(async () => [{ id: 'v1', vehicle_number: '113', route_id: 'r1', is_active: true }]));
const routeFilter = vi.hoisted(() => vi.fn(async () => [{ id: 'r1', number: 113, name: 'Хистеварс', stops: [{ name: 'Остановка 1' }, { name: 'Остановка 2' }, { name: 'Остановка 3' }] }]));
const scheduleFilter = vi.hoisted(() => vi.fn(async () => [{ id: 's1', route_id: 'r1', stops_schedule: [] }]));

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

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

import DriverSchedule from '../pages/DriverSchedule';

describe('DriverSchedule — неплановый рейс', () => {
  it('старт с первой остановки — плановый, нет жёлтого бейджа', async () => {
    render(<DriverSchedule />);
    await waitFor(() => expect(screen.getByText('Остановка 1')).toBeInTheDocument());

    const buttons = await screen.findAllByText('schedule.startLabel');
    fireEvent.click(buttons[0]);

    await waitFor(() => {
      expect(screen.getByText('В пути')).toBeInTheDocument();
    });
    expect(screen.queryByText('schedule.unscheduledBadge')).not.toBeInTheDocument();
  });

  it('старт со второй остановки — неплановый, жёлтый бейдж и баннер', async () => {
    render(<DriverSchedule />);
    await waitFor(() => expect(screen.getByText('Остановка 1')).toBeInTheDocument());

    const buttons = await screen.findAllByText('schedule.startLabel');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(buttons[1]);

    await waitFor(() => {
      expect(screen.getAllByText('schedule.unscheduledBadge').length).toBeGreaterThanOrEqual(1);
    });
    await waitFor(() => {
      expect(screen.getAllByText('schedule.unscheduledDesc').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('В пути')).toBeInTheDocument();
  });
});
