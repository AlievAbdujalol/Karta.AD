/**
 * UserApiKeys — поля с type="password" обязаны жить внутри <form>:
 * Chromium пишет «Password field is not contained in a form» (менеджер паролей
 * ждёт форму), а с формой появляется бонус — Enter сохраняет ключ.
 * Кнопки внутри формы (глаз, удалить) не должны триггерить сабмит.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const saveKeyMock = vi.fn(async () => {});
const deleteKeyMock = vi.fn(async () => {});
const validateMock = vi.fn(async () => ({ ok: true }));

vi.mock('@/lib/userKeys', () => ({
  loadUserKeys: vi.fn(async () => {}),
  saveUserKey: (...a) => saveKeyMock(...a),
  deleteUserKey: (...a) => deleteKeyMock(...a),
  hasOwnKey: () => false,
  getOwnKey: () => null,
}));

vi.mock('@/lib/openrouter', () => ({
  validateOpenRouterKey: (...a) => validateMock(...a),
}));

const toastMock = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a) => toastMock('success', ...a),
    error: (...a) => toastMock('error', ...a),
    info: (...a) => toastMock('info', ...a),
  },
}));

import UserApiKeys from '../components/profile/UserApiKeys';

describe('UserApiKeys', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('каждое password-поле живёт внутри формы (нет DOM-warning)', () => {
    render(<UserApiKeys userId="u1" />);
    const pw = screen.getAllByPlaceholderText(/sk-or-v1|AQ\./);
    expect(pw.length).toBeGreaterThan(0);
    for (const input of pw) {
      expect(input.closest('form')).toBeTruthy();
    }
  });

  it('Enter в поле сохраняет ключ (сабмит формы)', async () => {
    render(<UserApiKeys userId="u1" />);
    const input = screen.getByPlaceholderText('sk-or-v1-…');
    fireEvent.change(input, { target: { value: 'sk-or-v1-test' } });
    fireEvent.submit(input.closest('form'));

    await waitFor(() =>
      expect(saveKeyMock).toHaveBeenCalledWith('u1', 'openrouter', 'sk-or-v1-test')
    );
  });

  it('кнопка «глаз» внутри формы не вызывает сабмит', async () => {
    render(<UserApiKeys userId="u1" />);
    const eye = screen.getAllByTitle('Показать')[0];
    fireEvent.click(eye);
    expect(saveKeyMock).not.toHaveBeenCalled();
  });
});
