import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/gemini', () => ({
  geminiGenerate: vi.fn(),
  isGeminiConfigured: vi.fn(),
}));

import { askOrderAi } from '../lib/orderAssistant';
import { geminiGenerate, isGeminiConfigured } from '../lib/gemini';

const DATA = {
  found: true,
  status: 'in_transit',
  eta_min: 17,
  distance_km: 2.4,
  delivery_type: 'delivery',
  shop_name: 'Магазин-AD',
  dropoff_address: 'ул. Ленина 5',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('askOrderAi', () => {
  it('возвращает текст ИИ и помечает успех', async () => {
    isGeminiConfigured.mockReturnValue(true);
    geminiGenerate.mockResolvedValue('Курьер в пути, ≈17 минут.');

    const res = await askOrderAi({ data: DATA, question: 'Когда прибудет?' });
    expect(res.ok).toBe(true);
    expect(res.text).toContain('17 минут');

    const [prompt, opts] = geminiGenerate.mock.calls[0];
    expect(prompt).toContain('Когда прибудет?');
    expect(prompt).toContain('in_transit');
    expect(opts.jsonMode).toBe(false); // ответ — свободный текст
    expect(opts.thinkingConfig === undefined).toBe(true); // thinkingBudget управляется внутри gemini.js
  });

  it('ключа нет → ok=false reason=no_key, ИИ не вызывается', async () => {
    isGeminiConfigured.mockReturnValue(false);
    const res = await askOrderAi({ data: DATA, question: 'Где заказ?' });
    expect(res).toEqual({ ok: false, text: null, reason: 'no_key' });
    expect(geminiGenerate).not.toHaveBeenCalled();
  });

  it('модель вернула null → ok=false reason=empty', async () => {
    isGeminiConfigured.mockReturnValue(true);
    geminiGenerate.mockResolvedValue(null);
    const res = await askOrderAi({ data: DATA, question: 'Где заказ?' });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('empty');
  });

  it('ошибка ИИ не роняет страницу → ok=false reason=error', async () => {
    isGeminiConfigured.mockReturnValue(true);
    geminiGenerate.mockRejectedValue(new Error('HTTP 429'));
    const res = await askOrderAi({ data: DATA, question: 'Где заказ?' });
    expect(res).toEqual({ ok: false, text: null, reason: 'error' });
  });

  it('обрезает пустые ответы по краям', async () => {
    isGeminiConfigured.mockReturnValue(true);
    geminiGenerate.mockResolvedValue('  Заказ будет скоро.  ');
    const res = await askOrderAi({ data: DATA, question: 'q' });
    expect(res.text).toBe('Заказ будет скоро.');
  });
});
