import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';

const toastMock = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a) => toastMock('success', ...a),
    error: (...a) => toastMock('error', ...a),
    info: (...a) => toastMock('info', ...a),
  },
}));

import SiteWizard from '../components/aiBuilder/SiteWizard';

const BIZ = { id: 'b1', name: 'Магазин-AD', description: 'Продажа кроссовок' };
const PRODUCTS = [
  { id: 'p1', name: 'Кроссовки', price: 50 },
  { id: 'p2', name: 'Кепка', price: 20 },
];

const baseProps = (over = {}) => ({
  open: true,
  onClose: vi.fn(),
  business: BIZ,
  products: PRODUCTS,
  busy: false,
  stage: '',
  onSubmit: vi.fn().mockResolvedValue(true),
  ...over,
});

const clickNext = () => fireEvent.click(screen.getByRole('button', { name: /Далее/ }));
const clickBack = () => fireEvent.click(screen.getByRole('button', { name: /Назад/ }));

/** Заполнить шаг «Информация о компании» (индекс 2). */
const fillInfo = () => {
  fireEvent.change(screen.getByPlaceholderText('Магазин-AD'), { target: { value: 'Кроссовки AD' } });
  fireEvent.change(
    screen.getByPlaceholderText('Продажа спортивной обуви и одежды в Душанбе'),
    { target: { value: 'Магазин кроссовок в Душанбе' } },
  );
};

/** Дойти до финального шага «Пожелания» (индекс 6). */
const gotoFinalStep = () => {
  clickNext();
  clickNext(); // 1 → 2 → 3 (Информация)
  fillInfo();
  clickNext(); // 3 → 4 (Товары)
  clickNext(); // 4 → 5 (Доставка)
  clickNext(); // 5 → 6 (Оплата)
  clickNext(); // 6 → 7 (Пожелания)
  expect(screen.getByText(/Шаг 7 из 7/)).toBeTruthy();
};

beforeEach(() => {
  toastMock.mockClear();
});

afterEach(cleanup);

describe('SiteWizard: шаги и валидация', () => {
  it('open=false → ничего не рисует', () => {
    const { container } = render(<SiteWizard {...baseProps({ open: false })} />);
    expect(container.innerHTML).toBe('');
  });

  it('показывает заголовок и шаг 1 из 7', () => {
    render(<SiteWizard {...baseProps()} />);
    expect(screen.getByText('Создать сайт с помощью AI')).toBeTruthy();
    expect(screen.getByText(/Шаг 1 из 7 · Тип сайта/)).toBeTruthy();
  });

  it('навигация вперёд и назад, на первом шаге «Назад» отключён', () => {
    render(<SiteWizard {...baseProps()} />);
    expect(screen.getByRole('button', { name: /Назад/ }).disabled).toBe(true);
    clickNext();
    expect(screen.getByText(/Шаг 2 из 7 · Стиль оформления/)).toBeTruthy();
    clickBack();
    expect(screen.getByText(/Шаг 1 из 7/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Назад/ }).disabled).toBe(true);
  });

  it('пустая «Информация» блокирует переход с ошибками', () => {
    render(<SiteWizard {...baseProps()} />);
    clickNext();
    clickNext();
    expect(screen.getByText(/Шаг 3 из 7/)).toBeTruthy();
    clickNext();
    expect(screen.getByText(/Укажите название сайта/)).toBeTruthy();
    expect(screen.getByText(/Кратко опишите, чем занимаетесь/)).toBeTruthy();
    expect(screen.getByText(/Шаг 3 из 7/)).toBeTruthy();
  });

  it('выбор всех товаров и сброс в «Все товары»', () => {
    render(<SiteWizard {...baseProps()} />);
    clickNext();
    clickNext();
    fillInfo();
    clickNext();
    expect(screen.getByText(/Шаг 4 из 7/)).toBeTruthy();
    expect(screen.getByText('Все товары (2)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать все' }));
    expect(screen.getByText('Выбрано: 2 из 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Все товары (2)' }));
    expect(screen.getByText('В каталоге будут все активные товары')).toBeTruthy();
  });

  it('доставка: смена режима прячет поле цены, «по расстоянию» — про серверную подсказку', () => {
    render(<SiteWizard {...baseProps()} />);
    clickNext();
    clickNext();
    fillInfo();
    clickNext(); // 3 → 4 (Товары)
    clickNext(); // 4 → 5 (Доставка)
    expect(screen.getByText(/Шаг 5 из 7/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Бесплатная' }));
    expect(screen.queryByText('Цена, TJS')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'По расстоянию' }));
    expect(screen.getByText(/Стоимость по расстоянию считает сервер/)).toBeTruthy();
    expect(screen.queryByText('Цена, TJS')).toBeNull();
  });

  it('оплата: добавление Alif Pay попадает в сводку финального шага', () => {
    render(<SiteWizard {...baseProps()} />);
    gotoFinalStep();
    // вернёмся на шаг оплаты и включим Alif Pay
    clickBack(); // 7 → 6 (Оплата)
    expect(screen.getByText(/Шаг 6 из 7/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Alif Pay/));
    clickNext();
    // RTL матчит прямые текстовые узлы: «Оплата:» живёт в отдельном <b>
    expect(screen.getByText(/Наличными при получении, Alif Pay/)).toBeTruthy();
  });
});

describe('SiteWizard: финал и onSubmit', () => {
  it('успех: вызывает onSubmit с формой, показывает прогресс и кнопку «Открыть сайт»', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<SiteWizard {...baseProps({ onSubmit, onClose })} />);
    gotoFinalStep();

    fireEvent.click(screen.getByRole('button', { name: /Создать сайт/ }));
    expect(screen.getByText('Создание сайта…')).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      siteType: 'shop',
      heroTitle: 'Кроссовки AD',
      productIds: [],
    });

    await waitFor(() => screen.getByText('Открыть сайт'));
    fireEvent.click(screen.getByText('Открыть сайт'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('провал генерации (false) → возврат к форме финального шага', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false);
    render(<SiteWizard {...baseProps({ onSubmit })} />);
    gotoFinalStep();
    fireEvent.click(screen.getByRole('button', { name: /Создать сайт/ }));
    await waitFor(() => screen.getByText(/Шаг 7 из 7/));
    expect(screen.queryByText('Создание сайта…')).toBeNull();
    expect(screen.queryByText('Открыть сайт')).toBeNull();
  });

  it('исключение из onSubmit → тост об ошибке и форма', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
    render(<SiteWizard {...baseProps({ onSubmit })} />);
    gotoFinalStep();
    fireEvent.click(screen.getByRole('button', { name: /Создать сайт/ }));
    await waitFor(() => screen.getByText(/Шаг 7 из 7/));
    expect(toastMock).toHaveBeenCalledWith('error', 'boom');
  });

  it('пока генерация не завершена — нет кнопки результата; busy гасит подсказку', async () => {
    let finish;
    const onSubmit = vi.fn(() => new Promise((r) => { finish = r; }));
    const { rerender } = render(<SiteWizard {...baseProps({ onSubmit, busy: false })} />);
    gotoFinalStep();

    fireEvent.click(screen.getByRole('button', { name: /Создать сайт/ }));
    expect(screen.getByText('Создание сайта…')).toBeTruthy();
    expect(screen.getByText(/Генерация скоро начнётся…/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Открыть сайт' })).toBeNull();

    // пока идёт генерация (busy=true) — подсказка «скоро начнётся» уходит
    rerender(<SiteWizard {...baseProps({ onSubmit, busy: true })} />);
    expect(screen.getByText('Создание сайта…')).toBeTruthy();
    expect(screen.queryByText(/Генерация скоро начнётся…/)).toBeNull();

    await act(async () => { finish(true); });
    await waitFor(() => screen.getByText('Открыть сайт'));
  });

  it('без бизнеса: submit не уходит, приходит тост', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<SiteWizard {...baseProps({ onSubmit, business: null })} />);
    expect(screen.getByText(/Бизнес не выбран/)).toBeTruthy();

    clickNext();
    clickNext();
    // плейсхолдеры без бизнеса — свои
    fireEvent.change(screen.getByPlaceholderText('Например: Магазин-AD'), { target: { value: 'Магазин-AD' } });
    fireEvent.change(
      screen.getByPlaceholderText('Продажа спортивной обуви и одежды в Душанбе'),
      { target: { value: 'Магазин' } },
    );
    clickNext();
    clickNext();
    clickNext();
    clickNext();
    expect(screen.getByText(/Шаг 7 из 7/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Создать сайт/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith('error', 'Сначала создай бизнес — сайт привязывается к нему');
  });
});
