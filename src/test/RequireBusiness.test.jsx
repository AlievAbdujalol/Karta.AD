/**
 * Гейт раздела /business: главное требование — без активной роли «Бизнес»
 * пользователь НЕ должен видеть бизнес-данные (ни «Магазин-AD», ни кнопки).
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const authState = vi.hoisted(() => ({ user: null, loading: false }));

vi.mock('@/lib/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: authState.user, loading: authState.loading }),
}));

import RequireBusiness from '@/components/RequireBusiness';

const DAY = 24 * 60 * 60 * 1000;

function renderGuarded(user, loading = false) {
  authState.user = user;
  authState.loading = loading;
  return render(
    <MemoryRouter initialEntries={['/business']}>
      <Routes>
        <Route
          path="/business"
          element={
            <RequireBusiness>
              <div>БИЗНЕС-ДАННЫЕ</div>
            </RequireBusiness>
          }
        />
        <Route path="/profile" element={<div>ПРОФИЛЬ</div>} />
        <Route path="/" element={<div>КАРТА</div>} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RequireBusiness', () => {
  it('пассажир видит пейволл и НЕ видит бизнес-данные', () => {
    renderGuarded({
      id: 'u1',
      role: 'passenger',
      subscription_status: 'active',
      subscription_paid_until: new Date(Date.now() + DAY).toISOString(),
    });

    expect(screen.queryByText('БИЗНЕС-ДАННЫЕ')).toBeNull();
    expect(screen.getByText(/Нужна роль «Бизнес»/)).toBeTruthy();
    expect(screen.getByText(/1000 TJS/)).toBeTruthy();
  });

  it('кнопка пейволла ведёт в профиль — там активируется роль', () => {
    renderGuarded({ id: 'u1', role: 'passenger' });
    fireEvent.click(screen.getByRole('button', { name: /Активировать в профиле/ }));
    expect(screen.getByText('ПРОФИЛЬ')).toBeTruthy();
  });

  it('бизнес с активной подпиской видит раздел', () => {
    renderGuarded({
      id: 'u2',
      role: 'business',
      subscription_status: 'active',
      subscription_paid_until: new Date(Date.now() + DAY).toISOString(),
    });

    expect(screen.getByText('БИЗНЕС-ДАННЫЕ')).toBeTruthy();
    expect(screen.queryByText(/Нужна роль «Бизнес»/)).toBeNull();
  });

  it('истёкшая подписка — пейволл с предложением продлить', () => {
    renderGuarded({
      id: 'u2',
      role: 'business',
      subscription_status: 'active',
      subscription_paid_until: new Date(Date.now() - DAY).toISOString(),
    });

    expect(screen.queryByText('БИЗНЕС-ДАННЫЕ')).toBeNull();
    expect(screen.getByText(/Подписка «Бизнес» истекла/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Продлить в профиле/ })).toBeTruthy();
  });

  it('админ проходит без бизнес-подписки', () => {
    renderGuarded({ id: 'a1', role: 'admin', subscription_status: null, subscription_paid_until: null });
    expect(screen.getByText('БИЗНЕС-ДАННЫЕ')).toBeTruthy();
  });

  it('пока профиль грузится — спиннер, без пейволла и без данных', () => {
    renderGuarded(null, true);
    expect(screen.queryByText('БИЗНЕС-ДАННЫЕ')).toBeNull();
    expect(screen.queryByText(/Нужна роль «Бизнес»/)).toBeNull();
  });
});
