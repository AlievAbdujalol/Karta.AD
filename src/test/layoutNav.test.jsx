/**
 * Нижняя навигация: активный пункт должен быть доступен не только цветом.
 *
 * Прод-проблема (03.11.2026): у активного пункта не было `aria-current`, а
 * высота клика была 38 px при рекомендации 44 px. Скринридер не сообщал
 * «текущая страница», на тач-устройстве пункт было легко промахнуть.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/lib/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { id: 'u1', role: 'driver', driver_status: 'approved' } }),
}));
vi.mock('@/lib/TripContext', () => ({
  useTrip: () => ({ isTracking: false, gpsInfo: { speed: 0 }, activeRoute: null, endTrip: vi.fn() }),
}));
vi.mock('@/lib/businessAccess', () => ({ showBusinessTab: () => false }));
vi.mock('@/lib/useLanguage', () => ({
  LANG_KEY: 'bustrack_lang',
  useLanguage: () => ({ t: (key) => key, setLang: vi.fn(), lang: 'ru' }),
}));
vi.mock('@/hooks/useTaxiIncoming', () => ({ useTaxiIncoming: vi.fn() }));
vi.mock('@/hooks/usePushSubscription', () => ({ usePushSubscription: vi.fn() }));

import Layout from '../components/Layout';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<div>page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function navLink(name) {
  return screen.getAllByRole('link').find((link) => link.textContent === name);
}

describe('Layout — доступность навигации', () => {
  it('активный пункт помечен aria-current="page"', () => {
    renderAt('/driver-schedule');
    const schedule = navLink('nav.schedule');
    expect(schedule).toBeTruthy();
    expect(schedule).toHaveAttribute('aria-current', 'page');
    expect(schedule.className).toContain('min-h-[44px]');
  });

  it('неактивные пункты не объявляют себя текущей страницей', () => {
    renderAt('/driver-schedule');
    const map = navLink('nav.map');
    expect(map).toBeTruthy();
    expect(map).not.toHaveAttribute('aria-current');
  });

  it('aria-current ровно у одного пункта', () => {
    renderAt('/taxi');
    const current = screen.getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe('Такси');
  });

  it('все пункты кликабельны с зоной не меньше 44 px по высоте', () => {
    renderAt('/');
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.className).toContain('min-h-[44px]');
    }
  });
});
