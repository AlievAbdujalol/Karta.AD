import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// Мок Supabase до импорта компонента
const rpcMock = vi.fn();
const selectResult = { data: [], error: null };
const requestsResult = { data: [], error: null };

vi.mock('@/api/supabase', () => ({
  supabase: {
    from: (table) => {
      const result = table === 'payment_requests' ? requestsResult : selectResult;
      const chain = {
        select: () => chain,
        order: () => chain,
        eq: () => chain,
        limit: () => Promise.resolve(result),
        then: (cb) => cb(result),
      };
      return chain;
    },
    rpc: (...args) => rpcMock(...args),
  },
}));

const toastMock = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a) => toastMock('success', ...a),
    error: (...a) => toastMock('error', ...a),
  },
}));

import UsersManager from '../components/admin/UsersManager';

const USER = {
  id: 'u1',
  full_name: 'Тест Клиент',
  email: 'client@example.com',
  phone: '+992900000000',
  role: 'user',
  balance: 502.1,
  subscription_status: 'active',
  subscription_paid_until: '2026-12-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
};

describe('UsersManager', () => {
  beforeEach(() => {
    selectResult.data = [USER];
    selectResult.error = null;
    requestsResult.data = [];
    requestsResult.error = null;
    rpcMock.mockReset();
    toastMock.mockReset();
  });
  afterEach(cleanup);

  it('показывает список пользователей с балансом и ролью', async () => {
    render(<UsersManager />);
    await waitFor(() => expect(screen.getByText('Тест Клиент')).toBeTruthy());
    expect(screen.getByText('client@example.com · +992900000000')).toBeTruthy();
    expect(screen.getByText('Пассажир')).toBeTruthy();
    expect(screen.getByText('502.10 TJS')).toBeTruthy();
  });

  it('фильтрует список по поисковой строке', async () => {
    render(<UsersManager />);
    await waitFor(() => expect(screen.getByText('Тест Клиент')).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText('Поиск по имени, e-mail или телефону'), {
      target: { value: 'несуществующий' },
    });
    await waitFor(() => expect(screen.getByText('Пользователи не найдены')).toBeTruthy());
  });

  it('не отправляет запрос, пока форма создания невалидна', async () => {
    render(<UsersManager />);
    fireEvent.click(screen.getByText('Добавить пользователя'));
    fireEvent.click(screen.getByText('Создать'));

    await waitFor(() => expect(screen.getByText('Некорректный e-mail')).toBeTruthy());
    expect(screen.getByText('Минимум 6 символов')).toBeTruthy();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('валидная форма вызывает admin_create_user со стартовым балансом', async () => {
    rpcMock.mockResolvedValue({ data: 'new-uuid', error: null });
    render(<UsersManager />);
    fireEvent.click(screen.getByText('Добавить пользователя'));

    fireEvent.change(screen.getByPlaceholderText('client@example.com'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••'), { target: { value: 'secret123' } });
    fireEvent.change(screen.getByPlaceholderText('Имя Фамилия'), { target: { value: 'Иван Иванов' } });
    fireEvent.change(screen.getByPlaceholderText('1000'), { target: { value: '1500' } });
    fireEvent.click(screen.getByText('Создать'));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('admin_create_user', {
      p_email: 'new@example.com',
      p_password: 'secret123',
      p_full_name: 'Иван Иванов',
      p_phone: null,
      p_role: 'user',
      p_initial_balance: 1500,
    }));
  });

  it('показывает ошибку сервера, если RPC отклонил запрос', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'Пользователь с таким e-mail уже существует' } });
    render(<UsersManager />);
    fireEvent.click(screen.getByText('Добавить пользователя'));

    fireEvent.change(screen.getByPlaceholderText('client@example.com'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••'), { target: { value: 'secret123' } });
    fireEvent.change(screen.getByPlaceholderText('Имя Фамилия'), { target: { value: 'Иван Иванов' } });
    fireEvent.click(screen.getByText('Создать'));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(
      'error',
      'Пользователь с таким e-mail уже существует',
    ));
  });

  it('пополнение кошелька вызывает admin_topup_balance с новым балансом', async () => {
    rpcMock.mockResolvedValue({ data: 1502.1, error: null });
    render(<UsersManager />);
    await waitFor(() => expect(screen.getByText('Тест Клиент')).toBeTruthy());

    fireEvent.click(screen.getByText('Пополнить'));
    const amountInput = screen.getByPlaceholderText('1000');
    fireEvent.change(amountInput, { target: { value: '1000' } });
    fireEvent.click(screen.getByText('Пополнить', { selector: 'button[type="submit"]' }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('admin_topup_balance', {
      p_user_id: 'u1',
      p_amount: 1000,
      p_reason: 'Пополнение администратором',
    }));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith('success', 'Баланс пополнен: 1502.10 TJS'));
  });

  it('показывает заявки на пополнение и зачисляет их на сервере', async () => {
    requestsResult.data = [{
      id: 'req1', user_id: 'u1', amount: 1000, method: 'manual', status: 'pending', created_at: '2026-10-01T00:00:00Z',
    }];
    rpcMock.mockResolvedValue({ data: { amount: 1000, balance: 1502.1 }, error: null });
    render(<UsersManager />);

    await waitFor(() => expect(screen.getByText(/Заявки на пополнение/)).toBeTruthy());
    fireEvent.click(screen.getByText('Зачислить'));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('complete_topup_request', {
      p_request_id: 'req1',
      p_external_id: null,
    }));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith('success', expect.stringContaining('1000.00 TJS')));
  });

  it('пополнение с нулевой суммой не отправляется', async () => {
    render(<UsersManager />);
    await waitFor(() => expect(screen.getByText('Тест Клиент')).toBeTruthy());

    fireEvent.click(screen.getByText('Пополнить'));
    fireEvent.click(screen.getByText('Пополнить', { selector: 'button[type="submit"]' }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith('error', 'Введите сумму больше нуля'));
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
