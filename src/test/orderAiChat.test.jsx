import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import OrderAiChat from '@/components/tracking/OrderAiChat';
import { askOrderAi } from '../lib/orderAssistant';

vi.mock('../lib/orderAssistant', () => ({ askOrderAi: vi.fn() }));

const DATA = {
  found: true,
  order_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  status: 'in_transit',
  eta_min: 17,
  distance_km: 2.4,
  shop_name: 'Магазин-AD',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OrderAiChat', () => {
  it('показывает детерминированную сводку сразу — до ответа ИИ', async () => {
    askOrderAi.mockResolvedValue({ ok: false, text: null, reason: 'no_key' });
    render(<OrderAiChat data={DATA} />);
    await waitFor(() => {
      expect(screen.getByText(/Текущий статус: В пути/)).toBeInTheDocument();
      expect(screen.getByText(/17 мин/)).toBeInTheDocument();
    });
  });

  it('поздний авто-ответ ИИ подменяет только фолбэк — история чата не стирается', async () => {
    const resolvers = [];
    askOrderAi.mockImplementation(() => new Promise((r) => resolvers.push(r)));
    const { container } = render(<OrderAiChat data={DATA} />);
    const live = () => container.querySelector('[aria-live="polite"]');

    // пользователь спрашивает, пока ИИ «думает» над авто-сводкой
    fireEvent.click(screen.getByRole('button', { name: 'Когда прибудёт заказ?' }));
    await waitFor(() => expect(resolvers).toHaveLength(2)); // авто-сводка + вопрос

    resolvers[1]({ ok: true, text: 'Ответ на вопрос', reason: null });
    await waitFor(() => expect(screen.getByText(/Ответ на вопрос/)).toBeInTheDocument());

    // поздний авто-ответ приходит после истории — он её не затирает и не дописывается поздно
    await act(async () => { resolvers[0]({ ok: true, text: 'Поздний авто-комментарий', reason: null }); });
    expect(screen.queryByText(/Поздний авто-комментарий/)).toBeNull();

    expect(live()).toHaveTextContent('Когда прибудёт заказ?'); // пузырь вопроса
    expect(live()).toHaveTextContent('Ответ на вопрос'); // ответ
  });

  it('отказ ИИ → системная подсказка, чат не падает', async () => {
    askOrderAi.mockResolvedValue({ ok: false, text: null, reason: 'error' });
    const { container } = render(<OrderAiChat data={DATA} />);
    await waitFor(() => expect(screen.getByText(/Текущий статус: В пути/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Где мой заказ?' }));
    await waitFor(() => {
      expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('временно недоступен');
      expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('Где мой заказ?');
    });
  });

  it('пустой ввод не отправляется в ИИ', () => {
    askOrderAi.mockResolvedValue({ ok: true, text: 'ok', reason: null });
    render(<OrderAiChat data={DATA} />);
    const form = document.querySelector('form');
    fireEvent.submit(form);
    // одна автоматическая сводка + ровно один вызов на submit формы с пустым полем не происходит
    return waitFor(() => expect(askOrderAi).toHaveBeenCalledTimes(1));
  });
});
