import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ navigateToLogin: vi.fn() }),
}));
vi.mock('@/lib/useLanguage', () => ({
  useLanguage: () => ({ t: (k) => k }),
}));

import Login from '../pages/Login';

afterEach(cleanup);

// Регистрация: оба согласия включены автоматически и не отключаются,
// документы открываются по названию в модалке с полным текстом.
describe('экран регистрации — согласия', () => {
  it('обе галочки стоят автоматически и отключены (снять нельзя)', () => {
    render(<Login />);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    for (const b of boxes) {
      expect(b.checked).toBe(true);
      expect(b.disabled).toBe(true);
    }
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    for (const b of boxes) expect(b.checked).toBe(true);
  });

  it('показаны названия обоих документов и примечание о невозможности отключения', () => {
    render(<Login />);
    expect(screen.getByRole('button', { name: 'Пользовательское соглашение' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Условия использования' })).toBeTruthy();
    expect(screen.getByText(/отключить их нельзя/i)).toBeTruthy();
  });

  it('клик по «Пользовательское соглашение» открывает полный текст и закрывается', () => {
    render(<Login />);
    fireEvent.click(screen.getByRole('button', { name: 'Пользовательское соглашение' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Пользовательское соглашение');
    expect(within(dialog).getByText('1. Предмет соглашения')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('клик по «Условия использования» открывает именно условия', () => {
    render(<Login />);
    fireEvent.click(screen.getByRole('button', { name: 'Условия использования' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Условия использования');
    expect(within(dialog).queryByText('1. Предмет соглашения')).toBeNull();
    expect(within(dialog).getByText('1. Общие положения')).toBeTruthy();
  });
});
